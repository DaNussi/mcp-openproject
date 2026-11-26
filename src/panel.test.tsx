import { assert, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import type { OpenProjectStateSnapshot, OpenProjectWorkPackage } from './protocol'

const TABLE = { label: 'Work packages', type: 'Table' }
const DETAIL_TABS = { label: 'Work package details' }

function workPackage(
  overrides: Partial<OpenProjectWorkPackage> & { id: number; subject: string }
): OpenProjectWorkPackage {
  return {
    description: '',
    status: 'New',
    statusId: 1,
    type: 'Task',
    priority: 'Normal',
    project: 'Acme Backend',
    projectIdentifier: 'acme-backend',
    assignee: 'Unassigned',
    updatedAt: '2026-11-04T08:00:00Z',
    lockVersion: 1,
    ...overrides
  }
}

function createInitialSnapshot(): OpenProjectStateSnapshot {
  const bug = workPackage({
    id: 1428,
    subject: 'Fix OAuth token refresh',
    description: 'Prevent duplicate refresh token requests.',
    status: 'In Progress',
    statusId: 7,
    type: 'Bug',
    priority: 'High',
    assignee: 'Alex Dev',
    lockVersion: 2
  })
  return {
    config: {
      baseUrl: 'https://openproject.example.com',
      hasToken: true,
      tokenSource: 'secrets',
      readProjects: 'acme-backend,acme-frontend',
      writeProjects: 'acme-backend,acme-frontend',
      defaultAgent: 'codex',
      mcpBinaryPath: 'mcp-openproject'
    },
    currentUser: 'Alex Dev',
    projects: [
      { id: 1, identifier: 'acme-backend', name: 'Acme Backend', description: 'Core backend API' }
    ],
    workPackages: [bug],
    statuses: [
      { id: 1, name: 'New', isClosed: false },
      { id: 7, name: 'In Progress', isClosed: false },
      { id: 10, name: 'In Review', isClosed: false },
      { id: 12, name: 'Closed', isClosed: true }
    ],
    selectedTicket: bug,
    activities: [],
    detectedAgents: [
      { id: 'antigravity', label: 'Antigravity (agy)', installed: true, binPath: '/usr/local/bin/agy' },
      { id: 'codex', label: 'Codex', installed: true, binPath: '/usr/local/bin/codex' },
      { id: 'claude', label: 'Claude Code', installed: false }
    ],
    lastSyncedAt: 1793779200000,
    lastError: null
  }
}

function selectById(snapshot: OpenProjectStateSnapshot) {
  return ({ id }: { id: number }) => {
    const found = snapshot.workPackages.find((wp) => wp.id === id) ?? snapshot.workPackages[0]
    snapshot.selectedTicket = found
    return { workPackage: found, activities: [] }
  }
}

test('lists work packages in an OpenProject-style table and saves status from the split view', async () => {
  const snapshot = createInitialSnapshot()
  const updates: Array<Record<string, unknown>> = []
  let launchedTicketId = 0

  const host = mockHost({
    requests: {
      'openproject.state.get': () => snapshot,
      'openproject.workPackages.update': (input) => {
        updates.push({ ...input })
        if (input.status) snapshot.selectedTicket!.status = input.status
        snapshot.workPackages[0] = snapshot.selectedTicket!
        return {
          preview: false,
          confirmed: true,
          action: 'update_work_package',
          summary: `[CONFIRMED] Updated #${input.id} to ${snapshot.selectedTicket!.status}`,
          changes: {},
          workPackage: snapshot.selectedTicket!
        }
      },
      'openproject.agent.launch': ({ ticketId, agent }) => {
        launchedTicketId = ticketId
        return {
          terminalId: 'term-1428',
          workspaceId: 'ws-1',
          branchSlug: 'op-1428-fix-oauth-token-refresh',
          agent: agent ?? 'codex'
        }
      }
    }
  })

  const view = await mount(panel, { host })
  assert.deepEqual(view.rowsOf(TABLE), ['1428'])
  assert.deepEqual(view.columnsOf(TABLE), ['id', 'type', 'subject', 'status', 'assignee', 'priority'])
  assert.deepEqual(view.columnsOf(TABLE, { width: 420 }), ['id', 'subject', 'status'])
  assert.ok(view.find({ type: 'Heading', text: 'Fix OAuth token refresh' }))

  // Save stays disabled until an attribute differs, then sends only the attribute change.
  await view.select({ label: 'Status' }, 'In Review')
  await view.press({ text: 'Save' })
  assert.equal(updates.length, 1)
  assert.equal(updates[0].status, 'In Review')
  assert.equal(updates[0].comment, undefined)
  assert.ok(view.find({ text: /\[CONFIRMED\] Updated #1428/ }))

  // Comment from the Activity tab posts only the comment.
  await view.select(DETAIL_TABS, 'activity')
  await view.type({ label: 'Comment' }, 'Reproduced on staging.')
  await view.press({ type: 'Button', text: 'Comment' })
  assert.equal(updates.length, 2)
  assert.deepEqual(updates[1], { id: 1428, comment: 'Reproduced on staging.', confirm: true })

  await view.press({ text: 'Launch Agent' })
  await view.press({ text: 'Start Agent' })
  assert.equal(launchedTicketId, 1428)
  assert.ok(view.find({ text: /op-1428-fix-oauth-token-refresh/ }))

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('selecting a row opens its split view, deselecting closes it, and sorting reorders rows', async () => {
  const snapshot = createInitialSnapshot()
  snapshot.workPackages.push(
    workPackage({ id: 1429, subject: 'Add warehouse inventory UI', description: 'Inline split test.' })
  )

  const host = mockHost({
    requests: {
      'openproject.state.get': () => snapshot,
      'openproject.workPackages.get': selectById(snapshot)
    }
  })

  const view = await mount(panel, { host })
  assert.deepEqual(view.valueOf(TABLE), ['1428'])

  await view.selectRows(TABLE, ['1429'])
  assert.ok(view.find({ type: 'Heading', text: 'Add warehouse inventory UI' }))
  assert.ok(view.find({ text: /Inline split test/ }))

  await view.selectRows(TABLE, [])
  assert.equal(view.find({ text: 'Launch Agent' }), null)

  await view.sort(TABLE, 'subject')
  assert.deepEqual(view.rowsOf(TABLE), ['1429', '1428'])
  await view.sort(TABLE, 'subject')
  assert.deepEqual(view.rowsOf(TABLE), ['1428', '1429'])

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('unconfigured state shows clean onboarding without mock URLs or fake sync success', async () => {
  const unconfiguredSnapshot: OpenProjectStateSnapshot = {
    config: {
      baseUrl: '',
      hasToken: false,
      tokenSource: 'none',
      readProjects: '*',
      writeProjects: '*',
      defaultAgent: 'codex',
      mcpBinaryPath: 'mcp-openproject'
    },
    currentUser: '',
    projects: [],
    workPackages: [],
    statuses: [],
    selectedTicket: null,
    activities: [],
    detectedAgents: [
      { id: 'antigravity', label: 'Antigravity (agy)', installed: true },
      { id: 'codex', label: 'Codex', installed: true }
    ],
    lastSyncedAt: null,
    lastError: null
  }

  const host = mockHost({
    requests: {
      'openproject.state.get': () => unconfiguredSnapshot,
      'openproject.projects.list': () => ({ projects: [], statuses: [] })
    }
  })

  const view = await mount(panel, { host })
  assert.ok(view.find({ text: /Connect to OpenProject/ }))
  assert.ok(view.find({ text: 'Configure Connection' }))

  await view.press({ text: 'Sync' })
  assert.ok(view.find({ text: /Enter your OpenProject Base URL and API Token below/ }))

  await view.press({ text: 'EN' })
  assert.ok(view.find({ text: 'VI' }))
  assert.ok(view.find({ text: 'Đồng bộ' }))
  assert.ok(view.find({ text: 'Lưu cấu hình' }))

  await view.press({ text: 'VI' })
  assert.ok(view.find({ text: 'Sync' }))

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('filter drawer changes page size and the Create button opens the create form', async () => {
  const snapshot = createInitialSnapshot()
  let requestedLimit = 100
  let createdSubject = ''

  const host = mockHost({
    requests: {
      'openproject.state.get': () => snapshot,
      'openproject.workPackages.list': (input) => {
        if (input?.limit) {
          requestedLimit = input.limit
          snapshot.config.pageSize = input.limit
        }
        return { workPackages: snapshot.workPackages }
      },
      'openproject.workPackages.create': (input) => {
        createdSubject = input.subject
        const created = workPackage({
          id: 1500,
          subject: input.subject,
          description: input.description ?? '',
          type: input.typeName ?? 'Task',
          priority: input.priorityName ?? 'Normal',
          projectIdentifier: input.project,
          lockVersion: 0
        })
        snapshot.workPackages.unshift(created)
        snapshot.selectedTicket = created
        return {
          preview: false,
          confirmed: true,
          action: 'create_work_package',
          summary: `[CONFIRMED] Created #1500: ${input.subject}`,
          changes: { subject: { to: input.subject } },
          workPackage: created
        }
      }
    }
  })

  const view = await mount(panel, { host })

  await view.press({ type: 'Button', text: 'Filter' })
  await view.select({ label: 'Load per page' }, '200')
  assert.equal(requestedLimit, 200)

  await view.press({ type: 'Button', text: 'Create' })
  assert.equal(view.valueOf({ label: 'OpenProject Views' }), 'create')
  await view.type({ label: 'Subject' }, 'Optimize API pagination cache', { replace: true })
  await view.press({ text: 'Create Task' })
  assert.equal(createdSubject, 'Optimize API pagination cache')
  assert.ok(view.find({ type: 'Heading', text: 'Optimize API pagination cache' }))
  assert.ok(view.rowsOf(TABLE).includes('1500'))

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})

test('relations tab navigates parent and children and launch pre-selects the matching workspace', async () => {
  const snapshot = createInitialSnapshot()
  snapshot.projects.push({
    id: 2,
    identifier: 'acme-frontend',
    name: 'Acme Frontend',
    description: 'Frontend web client'
  })
  snapshot.workspaces = [
    { id: 'ws-mobile', name: 'dev', path: '/home/dev/orca/acme-mobile', branch: 'dev', kind: 'folder', repoName: 'acme-mobile' },
    { id: 'ws-frontend', name: 'ui-refresh', path: '/home/dev/orca/acme-frontend', branch: 'ui-refresh', kind: 'worktree', repoName: 'acme-frontend' }
  ]

  const parentTask = workPackage({
    id: 123,
    subject: 'Phase 2 dashboard redesign',
    description: 'Parent epic description',
    type: 'Epic',
    project: 'Acme Frontend',
    projectIdentifier: 'acme-frontend',
    childIds: [124]
  })
  const childTask = workPackage({
    id: 124,
    subject: 'Implement responsive sidebar layout',
    description: 'Child task description',
    status: 'In Progress',
    statusId: 7,
    project: 'Acme Frontend',
    projectIdentifier: 'acme-frontend',
    parentId: 123,
    parentSubject: 'Phase 2 dashboard redesign',
    assignee: 'Alex Dev'
  })
  snapshot.workPackages = [parentTask, snapshot.workPackages[0], childTask]
  snapshot.selectedTicket = parentTask

  let launchedWsId = ''
  let launchedCreateWorktree = false
  let launchedBranchName = ''
  const host = mockHost({
    requests: {
      'openproject.state.get': () => snapshot,
      'openproject.workPackages.get': selectById(snapshot),
      'openproject.agent.launch': ({ ticketId, workspaceId, createWorktree, branchName }) => {
        launchedWsId = workspaceId ?? ''
        launchedCreateWorktree = Boolean(createWorktree)
        launchedBranchName = branchName ?? ''
        return {
          terminalId: `term-${ticketId}`,
          workspaceId: launchedWsId,
          workspaceName: 'acme-frontend',
          branchSlug: launchedBranchName || `op-${ticketId}-task`,
          agent: 'codex'
        }
      }
    }
  })

  const view = await mount(panel, { host })

  // Hierarchy order: the child sits right under its parent.
  assert.deepEqual(view.rowsOf(TABLE), ['123', '124', '1428'])

  await view.select(DETAIL_TABS, 'relations')
  await view.press({ text: /↳ #124 Implement responsive sidebar layout/ })
  assert.ok(view.find({ type: 'Heading', text: 'Implement responsive sidebar layout' }))
  assert.ok(view.find({ text: /Child task description/ }))

  await view.press({ text: 'Launch Agent' })
  await view.press({ text: 'Start Agent' })
  assert.equal(launchedWsId, 'ws-frontend')
  assert.equal(launchedCreateWorktree, false)

  await view.press({ text: 'Launch Agent' })
  await view.press({ text: 'New Worktree' })
  assert.ok(view.find({ label: 'Target Repository' }))
  await view.type({ label: 'Branch Name' }, 'op-124-responsive-sidebar', { replace: true })
  await view.press({ text: 'Create Worktree & Start' })
  assert.equal(launchedCreateWorktree, true)
  assert.equal(launchedBranchName, 'op-124-responsive-sidebar')

  // The parent breadcrumb above the subject jumps back to #123.
  await view.press({ type: 'Link', text: '#123 Phase 2 dashboard redesign' })
  assert.ok(view.find({ type: 'Heading', text: 'Phase 2 dashboard redesign' }))

  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
  await view.unmount()
})
