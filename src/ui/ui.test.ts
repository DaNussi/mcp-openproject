import { assert, test } from 'orca/testing'
import type { OpenProjectStateSnapshot, OpenProjectWorkPackage } from '../protocol'
import { renderMarkdown } from './markdown'
import {
  buildLaunchModel,
  buildListModel,
  DEFAULT_PREFS,
  normalizePrefs,
  readableTextOn,
  typeColor,
  type UiPrefs
} from './view-model'

function wp(overrides: Partial<OpenProjectWorkPackage> & { id: number; subject: string }): OpenProjectWorkPackage {
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

function snapshot(workPackages: OpenProjectWorkPackage[]): OpenProjectStateSnapshot {
  return {
    config: {
      baseUrl: 'https://openproject.example.com',
      hasToken: true,
      tokenSource: 'secrets',
      readProjects: '*',
      writeProjects: '*',
      defaultAgent: 'codex',
      mcpBinaryPath: 'mcp-openproject'
    },
    currentUser: 'Alex Dev',
    projects: [
      { id: 1, identifier: 'acme-backend', name: 'Acme Backend', description: '' },
      { id: 2, identifier: 'acme-frontend', name: 'Acme Frontend', description: '' }
    ],
    workPackages,
    statuses: [
      { id: 1, name: 'New', isClosed: false, color: '#DEE2E6' },
      { id: 7, name: 'In Progress', isClosed: false, color: '#CC5DE8' },
      { id: 12, name: 'Closed', isClosed: true }
    ],
    selectedTicket: null,
    activities: [],
    lastSyncedAt: null,
    lastError: null
  }
}

const PACKAGES = [
  wp({ id: 10, subject: 'Parent epic', type: 'Epic' }),
  wp({ id: 11, subject: 'Child task', parentId: 10, assignee: 'Alex Dev', status: 'In Progress' }),
  wp({ id: 12, subject: 'Done thing', status: 'Closed' }),
  wp({ id: 13, subject: 'Frontend bug', type: 'Bug', projectIdentifier: 'acme-frontend', project: 'Acme Frontend', priority: 'High' })
]

const prefs = (patch: Partial<UiPrefs> = {}): UiPrefs => ({ ...DEFAULT_PREFS, ...patch })
const ids = (model: ReturnType<typeof buildListModel>) => model.rows.map((r) => r.wp.id)

test('list: open work packages in hierarchy order, closed hidden', () => {
  const model = buildListModel(snapshot(PACKAGES), prefs(), 100)
  assert.deepEqual(ids(model), [10, 11, 13])
  assert.deepEqual(model.rows.map((r) => r.depth), [0, 1, 0])
  assert.equal(model.totalCount, 3)
  assert.equal(model.view, 'open')
})

test('list: views, project, search, priority and sort', () => {
  const snap = snapshot(PACKAGES)
  assert.deepEqual(ids(buildListModel(snap, prefs({ scope: 'my_todos' }), 100)), [11])
  assert.deepEqual(ids(buildListModel(snap, prefs({ status: 'closed' }), 100)), [12])
  assert.deepEqual(ids(buildListModel(snap, prefs({ project: 'acme-frontend' }), 100)), [13])
  assert.deepEqual(ids(buildListModel(snap, prefs({ search: 'child' }), 100)), [11])
  assert.deepEqual(ids(buildListModel(snap, prefs({ search: '13' }), 100)), [13])
  assert.deepEqual(ids(buildListModel(snap, prefs({ priority: 'High' }), 100)), [13])
  assert.deepEqual(ids(buildListModel(snap, prefs({ sort: { column: 'id', direction: 'desc' } }), 100)), [13, 11, 10])
  assert.deepEqual(ids(buildListModel(snap, prefs({ sort: { column: 'subject', direction: 'asc' } }), 100)), [11, 13, 10])
  const filtered = buildListModel(snap, prefs({ priority: 'High', status: 'New' }), 100)
  assert.equal(filtered.drawerFilterCount, 2)
  assert.equal(filtered.canReset, true)
  assert.equal(buildListModel(snap, prefs(), 100).canReset, false)
})

test('list: page size limits rows and offers the next step', () => {
  const many = Array.from({ length: 60 }, (_, i) => wp({ id: i + 1, subject: `Task ${i + 1}` }))
  const model = buildListModel(snapshot(many), prefs(), 50)
  assert.equal(model.rows.length, 50)
  assert.equal(model.hasMore, true)
  assert.equal(model.nextPageSize, '100')
})

test('prefs: normalizes stored values and clamps the split', () => {
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS)
  const p = normalizePrefs({ mode: 'popover', split: 2, locale: 'vi', sort: { column: 'id', direction: 'desc' } })
  assert.equal(p.mode, 'popover')
  assert.equal(p.split, 0.85)
  assert.equal(p.locale, 'vi')
  assert.deepEqual(p.sort, { column: 'id', direction: 'desc' })
  assert.equal(normalizePrefs({ mode: 'weird' }).mode, 'stacked')
})

test('colors: OpenProject hex first, readable text on top', () => {
  assert.equal(typeColor({ type: 'Bug', typeColor: '#123456' }), '#123456')
  assert.equal(typeColor({ type: 'Aufgabe' }), '#1A67A3')
  assert.equal(typeColor({ type: 'Fehler' }), '#D9534F')
  assert.equal(readableTextOn('#FFFFFF'), '#000000')
  assert.equal(readableTextOn('#1A67A3'), '#FFFFFF')
})

test('launch: new worktree defaults to the repository matching the project', () => {
  const ticket = wp({ id: 124, subject: 'Sidebar', project: 'Acme Frontend', projectIdentifier: 'acme-frontend' })
  const model = buildLaunchModel(
    ticket,
    [
      { id: 'ws-mobile', name: 'dev', path: '/x/acme-mobile', branch: 'dev', kind: 'folder', repoName: 'acme-mobile' },
      { id: 'ws-frontend', name: 'ui', path: '/x/acme-frontend', branch: 'ui', kind: 'worktree', repoName: 'acme-frontend' }
    ],
    [{ id: 'claude', label: 'Claude Code', installed: true }],
    ''
  )
  assert.equal(model.selectedWorkspace, 'ws-frontend')
  assert.equal(model.repoOptions[0].value, 'ws-frontend')
  assert.equal(model.workspaceForRepo('ws-mobile'), 'ws-mobile')
  assert.deepEqual(model.agentOptions, [{ value: 'claude', label: 'Claude Code' }])
})

test('markdown: escapes HTML, renders common markup, only safe links', () => {
  const html = renderMarkdown(
    '# Title\n\n**bold** and _it_ <script>alert(1)</script>\n\n- [x] done\n- open\n\n[site](https://example.com) [bad](javascript:alert(1))\n\n> quote\n\nA&nbsp;B'
  )
  assert.ok(html.includes('<h3>Title</h3>'))
  assert.ok(html.includes('<strong>bold</strong>'))
  assert.ok(html.includes('<em>it</em>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('md-check done'))
  assert.ok(html.includes('data-url="https://example.com"'))
  assert.ok(!html.includes('javascript:'))
  assert.ok(html.includes('<blockquote>'))
  assert.ok(html.includes('A B'))
})
