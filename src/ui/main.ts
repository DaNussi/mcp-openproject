import { t, type UiLocale } from '../i18n'
import { formatWorktreeBranchSlug, matchBestWorkspaceForTicket } from '../openproject-api'
import type { OpenProjectStateSnapshot, OpenProjectWorkPackage } from '../protocol'
import { DEFAULT_OPENPROJECT_TYPES, formatShortDate, isStatusClosedName } from '../utils/openproject-tones'
import { workPackageUrl } from '../utils/work-package-table'
import { escapeHtml as esc, renderMarkdown } from './markdown'
import { PANEL_CSS } from './styles'
import {
  buildLaunchModel,
  buildListModel,
  buildMemberOptions,
  cleanHex,
  agentChoices,
  DEFAULT_PRIORITIES,
  formatDuration,
  lastActivity,
  normalizePrefs,
  readableTextOn,
  shownOption,
  typeColor,
  type ListModel,
  type Option,
  type UiPrefs
} from './view-model'

// ---------------------------------------------------------------------------------------------
// State

type MainTab = 'tickets' | 'ticket' | 'create' | 'setup'
type DetailTab = 'overview' | 'activity' | 'relations'
type Feedback = { tone: 'success' | 'warning' | 'danger' | 'accent'; text: string } | null

const PREFS_KEY = 'openproject.ui.prefs'

const state = {
  snapshot: null as OpenProjectStateSnapshot | null,
  prefs: normalizePrefs(null) as UiPrefs,
  pageSize: 100,
  tab: 'tickets' as MainTab,
  /** Popover mode: the ticket shown in its own tab. */
  ticketTabId: null as number | null,
  /** Stacked mode: the ticket shown under the table. */
  stackedId: null as number | null,
  detailTab: 'overview' as DetailTab,
  filtersOpen: false,
  launchOpen: false,
  launch: { createWorktree: true, workspaceId: '', branch: '', agent: '' },
  comment: '',
  feedback: null as Feedback,
  create: {
    project: '',
    parent: '0',
    subject: '',
    type: 'Task',
    priority: 'Normal',
    assignee: '0',
    responsible: '0',
    description: ''
  },
  setup: { baseUrl: '', token: '', agent: 'codex', readProjects: '*', writeProjects: '*' },
  setupLoaded: false
}

const tr = (key: string, params?: Record<string, string | number>) =>
  t(state.prefs.locale, key, params)

function savePrefs(): void {
  void orca.storage.set(PREFS_KEY, state.prefs as unknown as never).catch(() => undefined)
}

function setPrefs(patch: Partial<UiPrefs>): void {
  state.prefs = { ...state.prefs, ...patch }
  savePrefs()
}

function feedback(tone: NonNullable<Feedback>['tone'], text: string): void {
  state.feedback = { tone, text }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The ticket the visible detail view is about, if any. */
function shownTicketId(): number | null {
  if (state.prefs.mode === 'popover') return state.tab === 'ticket' ? state.ticketTabId : null
  return state.stackedId
}

function ticketById(id: number | null): OpenProjectWorkPackage | null {
  if (id === null || !state.snapshot) return null
  if (state.snapshot.selectedTicket?.id === id) return state.snapshot.selectedTicket
  return state.snapshot.workPackages.find((w) => w.id === id) ?? null
}

// ---------------------------------------------------------------------------------------------
// Worker calls

function applySnapshot(snapshot: OpenProjectStateSnapshot): void {
  state.snapshot = snapshot
  if (snapshot.config.pageSize) state.pageSize = snapshot.config.pageSize
  if (!state.setupLoaded) {
    state.setup.baseUrl =
      snapshot.config.baseUrl && snapshot.config.baseUrl !== 'https://openproject.example.com'
        ? snapshot.config.baseUrl
        : ''
    state.setup.agent = snapshot.config.defaultAgent || 'codex'
    state.setup.readProjects = snapshot.config.readProjects || '*'
    state.setup.writeProjects = snapshot.config.writeProjects || '*'
    state.setupLoaded = true
  }
  if (!state.launch.agent) state.launch.agent = snapshot.config.defaultAgent || 'codex'
  const writable = snapshot.projects.filter((p) => p.canCreateWorkPackage !== false)
  if (writable.length && !writable.some((p) => p.identifier === state.create.project)) {
    state.create.project = writable[0].identifier
  }
}

async function call<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    feedback('danger', errorText(err))
    render()
    return undefined
  }
}

async function loadState(): Promise<void> {
  const snapshot = await call(() =>
    orca.plugin.request('openproject.state.get', {
      project: state.prefs.project,
      pageSize: state.pageSize
    })
  )
  if (snapshot) applySnapshot(snapshot)
  render()
}

async function refreshAll(): Promise<void> {
  await call(async () => {
    await orca.plugin.request('openproject.projects.list', {
      refresh: true,
      project: state.prefs.project,
      pageSize: state.pageSize
    })
    const snapshot = await orca.plugin.request('openproject.state.get')
    applySnapshot(snapshot)
    if (!snapshot.config.baseUrl || !snapshot.config.hasToken) {
      state.tab = 'setup'
      feedback('warning', tr('feedback.missingCredentials'))
    } else {
      feedback('success', tr('feedback.syncedSummary', {
        taskCount: snapshot.workPackages.length,
        projectCount: snapshot.projects.length
      }))
    }
  })
  render()
}

async function reloadList(opts: { project?: string; closed?: boolean; limit?: number } = {}): Promise<void> {
  const project = opts.project ?? state.prefs.project
  const limit = opts.limit ?? state.pageSize
  await call(async () => {
    await orca.plugin.request('openproject.workPackages.list', {
      project: project || 'all',
      ...(opts.closed ? { status: 'closed' } : {}),
      limit
    })
    applySnapshot(
      await orca.plugin.request('openproject.state.get', { project: project || 'all', pageSize: limit })
    )
  })
  render()
}

function wantsClosed(status: string): boolean {
  return status === 'closed' || isStatusClosedName(status)
}

async function changeProject(project: string): Promise<void> {
  setPrefs({ project })
  render()
  await reloadList({ project, closed: wantsClosed(state.prefs.status) })
}

async function changeStatus(status: string): Promise<void> {
  setPrefs({ status })
  render()
  if (wantsClosed(status)) await reloadList({ closed: true })
}

async function changePageSize(size: number): Promise<void> {
  state.pageSize = size
  render()
  await reloadList({ limit: size, closed: wantsClosed(state.prefs.status) })
}

function resetLaunchFor(ticket: OpenProjectWorkPackage): void {
  const best = matchBestWorkspaceForTicket(ticket, state.snapshot?.workspaces ?? [])
  state.launch.workspaceId = best?.id ?? ''
  state.launch.branch = formatWorktreeBranchSlug(ticket.id, ticket.subject)
  state.launch.createWorktree = true
  state.launchOpen = false
  state.comment = ''
}

/** Shows ticket `id` (stacked: under the table; popover: in its own tab) and loads its activity. */
async function openTicket(id: number): Promise<void> {
  const cached = ticketById(id)
  if (state.prefs.mode === 'popover') {
    state.ticketTabId = id
    state.tab = 'ticket'
  } else {
    state.stackedId = id
  }
  state.detailTab = 'overview'
  if (cached) resetLaunchFor(cached)
  if (state.snapshot && cached) {
    state.snapshot = { ...state.snapshot, selectedTicket: cached, activities: [] }
  }
  render()
  await call(async () => {
    await orca.plugin.request('openproject.workPackages.get', { id })
    applySnapshot(await orca.plugin.request('openproject.state.get'))
    const fresh = ticketById(id)
    if (fresh && !cached) resetLaunchFor(fresh)
  })
  render()
}

function closeTicket(): void {
  if (state.prefs.mode === 'popover') {
    state.ticketTabId = null
    if (state.tab === 'ticket') state.tab = 'tickets'
  } else {
    state.stackedId = null
  }
  render()
}

async function postComment(id: number): Promise<void> {
  const comment = state.comment.trim()
  if (!comment) return
  await call(async () => {
    const res = await orca.plugin.request('openproject.workPackages.update', { id, comment, confirm: true })
    state.comment = ''
    feedback('success', state.prefs.locale === 'vi' ? tr('feedback.updatedTicket', { id }) : res.summary)
    await orca.plugin.request('openproject.workPackages.get', { id })
    applySnapshot(await orca.plugin.request('openproject.state.get'))
  })
  render()
}

/** The agent the launch form shows: the person's pick, else the configured default, else the first installed. */
function launchAgent(agentOptions: Option[]): string {
  return shownOption(agentOptions, state.launch.agent, state.snapshot?.config.defaultAgent)
}

async function launchWorkspace(ticket: OpenProjectWorkPackage): Promise<void> {
  const model = buildLaunchModel(
    ticket,
    state.snapshot?.workspaces ?? [],
    state.snapshot?.detectedAgents ?? [],
    state.launch.workspaceId
  )
  const workspaceId = model.selectedWorkspace
  const branchName = state.launch.branch.trim()
  const agent = launchAgent(model.agentOptions)
  await call(async () => {
    const res = await orca.plugin.request('openproject.agent.launch', {
      ticketId: ticket.id,
      agent,
      ...(workspaceId ? { workspaceId } : {}),
      createWorktree: state.launch.createWorktree,
      ...(state.launch.createWorktree && branchName ? { branchName } : {})
    })
    state.launchOpen = false
    feedback('accent', tr('feedback.launchedAgent', {
      agent: res.agent,
      workspace: res.workspaceName || res.workspaceId,
      branch: res.branchSlug,
      terminalId: res.terminalId
    }))
  })
  render()
}

async function createTicket(): Promise<void> {
  const c = state.create
  await call(async () => {
    const res = await orca.plugin.request('openproject.workPackages.create', {
      project: c.project,
      subject: c.subject.trim(),
      typeName: c.type || 'Task',
      priorityName: c.priority || 'Normal',
      parentId: Number(c.parent) > 0 ? Number(c.parent) : null,
      assigneeId: Number(c.assignee) > 0 ? Number(c.assignee) : null,
      responsibleId: Number(c.responsible) > 0 ? Number(c.responsible) : null,
      description: c.description.trim(),
      confirm: true
    })
    c.subject = ''
    c.description = ''
    c.parent = '0'
    applySnapshot(await orca.plugin.request('openproject.state.get'))
    feedback(
      'success',
      state.prefs.locale === 'vi' && res.workPackage
        ? tr('feedback.createdTicket', { id: res.workPackage.id, subject: res.workPackage.subject })
        : res.summary
    )
    state.tab = 'tickets'
    if (res.workPackage) void openTicket(res.workPackage.id)
  })
  render()
}

async function saveSetup(): Promise<void> {
  const s = state.setup
  await call(async () => {
    const snapshot = await orca.plugin.request('openproject.config.save', {
      baseUrl: s.baseUrl,
      ...(s.token.trim() ? { apiToken: s.token.trim() } : {}),
      readProjects: s.readProjects,
      writeProjects: s.writeProjects,
      defaultAgent: shownOption(agentChoices(state.snapshot?.detectedAgents ?? []), s.agent),
      mcpBinaryPath: state.snapshot?.config.mcpBinaryPath || 'mcp-openproject',
      pageSize: state.pageSize
    })
    s.token = ''
    applySnapshot(snapshot)
    feedback('success', tr('feedback.savedConfig'))
  })
  render()
}

async function registerMcp(): Promise<void> {
  await call(async () => {
    const agent = shownOption(agentChoices(state.snapshot?.detectedAgents ?? []), state.setup.agent)
    const res = await orca.plugin.request('openproject.mcp.register', { agent })
    feedback(
      'success',
      state.prefs.locale === 'vi' ? tr('feedback.registeredMcp', { configPath: res.configPath }) : res.summary
    )
  })
  render()
}

function openExternal(url: string): void {
  void orca.shell?.openExternal(url)
}

// ---------------------------------------------------------------------------------------------
// Rendering helpers

function options(list: Option[], selected: string): string {
  return list
    .map((o) => `<option value="${esc(o.value)}"${o.value === selected ? ' selected' : ''}>${esc(o.label)}</option>`)
    .join('')
}

function typeLabel(wp: Pick<OpenProjectWorkPackage, 'type' | 'typeColor'>): string {
  return `<span class="type" style="--c:${typeColor(wp)}">${esc((wp.type || 'Task').toUpperCase())}</span>`
}

function statusPill(name: string, color: string | undefined): string {
  const hex = cleanHex(color)
  if (!hex) return `<span class="pill plain" title="${esc(name)}">${esc(name)}</span>`
  return `<span class="pill" style="--c:${hex};--fg:${readableTextOn(hex)}" title="${esc(name)}">${esc(name)}</span>`
}

function priorityLabel(name: string, color: string | undefined): string {
  if (!name) return ''
  const hex = cleanHex(color)
  return `<span class="prio"${hex ? ` style="--c:${hex}"` : ''}>${esc(name)}</span>`
}

function statusColorFor(name: string, fallback?: string): string | undefined {
  const st = state.snapshot?.statuses.find((s) => s.name.toLowerCase() === name.toLowerCase())
  return fallback || st?.color
}

function idLink(id: number): string {
  const url = workPackageUrl(state.snapshot?.config.baseUrl ?? '', id)
  return url
    ? `<a href="#" data-action="open-url" data-url="${esc(url)}" title="${esc(tr('detail.openInOpenProject'))}">${id}</a>`
    : `<span class="muted">${id}</span>`
}

function person(name: string | undefined): string {
  return name && name !== 'Unassigned' ? esc(name) : '<span class="muted">—</span>'
}

// ---------------------------------------------------------------------------------------------
// Views

function renderHeader(model: ListModel): string {
  const snap = state.snapshot
  const count =
    snap === null
      ? '…'
      : !snap.config.hasToken
        ? tr('header.setupBadge')
        : model.filteredCount !== model.totalCount
          ? `${model.filteredCount} / ${model.totalCount}`
          : String(model.totalCount)
  const canCreate = Boolean(snap?.config.hasToken) && (snap?.projects ?? []).some((p) => p.canCreateWorkPackage !== false)
  return `
    <div class="header">
      <span class="title">${esc(tr('wp.title'))}</span>
      <span class="count">${esc(count)}</span>
      <span class="spacer"></span>
      <button class="btn success" data-action="tab" data-tab="create" ${canCreate ? '' : 'disabled'}>＋ ${esc(tr('wp.create'))}</button>
      <button class="btn" data-action="sync">⟳ ${esc(tr('header.syncButton'))}</button>
      <button class="btn ghost" data-action="locale">${state.prefs.locale.toUpperCase()}</button>
    </div>`
}

function renderTabBar(): string {
  const snap = state.snapshot
  const canCreate = Boolean(snap?.config.hasToken) && (snap?.projects ?? []).some((p) => p.canCreateWorkPackage !== false)
  const tab = (id: MainTab, label: string, disabled = false) =>
    `<button class="tab${state.tab === id ? ' active' : ''}" data-action="tab" data-tab="${id}" ${disabled ? 'disabled' : ''}><span class="label">${esc(label)}</span></button>`
  const popTicket = state.prefs.mode === 'popover' && state.ticketTabId !== null ? ticketById(state.ticketTabId) : null
  const ticketTab =
    state.prefs.mode === 'popover' && state.ticketTabId !== null
      ? `<button class="tab${state.tab === 'ticket' ? ' active' : ''}" data-action="tab" data-tab="ticket" title="${esc(popTicket?.subject ?? '')}">
           <span class="label">#${state.ticketTabId}${popTicket ? ` ${esc(popTicket.subject)}` : ''}</span>
           <span class="x" data-action="close-ticket" title="${esc(tr('ticket.close'))}">✕</span>
         </button>`
      : ''
  return `<div class="tabbar">
      ${tab('tickets', tr('tabs.tickets'))}${ticketTab}
      ${tab('create', tr('tabs.newTask'), !canCreate)}${tab('setup', tr('tabs.setup'))}
    </div>`
}

function renderBanner(): string {
  const parts: string[] = []
  if (state.feedback) {
    parts.push(`<div class="banner ${state.feedback.tone}"><span class="text">${esc(state.feedback.text)}</span>
      <button class="icon-btn" data-action="dismiss" title="${esc(tr('ticket.close'))}">✕</button></div>`)
  }
  if (state.snapshot?.lastError) {
    parts.push(`<div class="banner warning"><span class="text"><strong>${esc(tr('callout.providerWarningTitle'))}:</strong> ${esc(state.snapshot.lastError)}</span></div>`)
  }
  return parts.join('')
}

function renderToolbar(model: ListModel): string {
  const p = state.prefs
  const sortKeys = ['hierarchy', 'id:desc', 'id:asc', 'subject:asc', 'type:asc', 'status:asc', 'priority:desc', 'assignee:asc']
  const sortValue = p.sort ? `${p.sort.column}:${p.sort.direction}` : 'hierarchy'
  return `
    <div class="toolbar">
      <div class="row">
        <select data-bind="view" class="grow" aria-label="${esc(tr('wp.viewLabel'))}">
          ${options([
            { value: 'open', label: tr('wp.viewOpen') },
            { value: 'mine', label: tr('wp.viewMine') },
            { value: 'closed', label: tr('wp.viewClosed') }
          ], model.view)}
        </select>
        <select data-bind="project" class="grow" aria-label="${esc(tr('filters.projectLabel'))}">${options(model.projectOptions, p.project)}</select>
      </div>
      <div class="row wrap">
        <input id="search" type="search" class="grow" data-bind="search" placeholder="${esc(tr('filters.searchPlaceholder'))}" value="${esc(p.search)}">
        <button class="btn${state.filtersOpen ? ' on' : ''}" data-action="filters">⚲ ${esc(model.drawerFilterCount ? tr('wp.filterCount', { count: model.drawerFilterCount }) : tr('wp.filter'))}</button>
        <div class="seg" role="group" aria-label="${esc(tr('mode.label'))}">
          <button data-action="mode" data-mode="stacked" class="${p.mode === 'stacked' ? 'on' : ''}" title="${esc(tr('mode.stackedHint'))}">${esc(tr('mode.stacked'))}</button>
          <button data-action="mode" data-mode="popover" class="${p.mode === 'popover' ? 'on' : ''}" title="${esc(tr('mode.popoverHint'))}">${esc(tr('mode.popover'))}</button>
        </div>
      </div>
      ${state.filtersOpen ? `
        <div class="filters">
          <div class="grid2">
            <label class="field"><span>${esc(tr('filters.statusLabel'))}</span><select data-bind="status">${options(model.statusOptions, p.status)}</select></label>
            <label class="field"><span>${esc(tr('wp.priorityFilterLabel'))}</span><select data-bind="priority">${options(model.priorityOptions, p.priority)}</select></label>
            <label class="field"><span>${esc(tr('wp.sortLabel'))}</span><select data-bind="sort">${options(sortKeys.map((k) => ({ value: k, label: tr(`wp.sort.${k}`) })), sortValue)}</select></label>
            <label class="field"><span>${esc(tr('filters.pageSizeLabel'))}</span><select data-bind="pageSize">${options(['50', '100', '200'].map((s) => ({ value: s, label: tr('filters.pageSizeOption', { size: s }) })), String(state.pageSize))}</select></label>
          </div>
          <div class="row"><span class="spacer"></span><button class="btn ghost" data-action="reset" ${model.canReset ? '' : 'disabled'}>✕ ${esc(tr('filters.reset'))}</button></div>
        </div>` : ''}
    </div>`
}

function sortHeader(column: string, label: string, cls = ''): string {
  const s = state.prefs.sort
  const arrow = s && s.column === column ? (s.direction === 'asc' ? ' ▲' : ' ▼') : ''
  return `<th class="${cls}" data-action="sort" data-column="${column}">${esc(label)}<span class="arrow">${arrow}</span></th>`
}

function renderTable(model: ListModel): string {
  const snap = state.snapshot
  if (snap === null) return `<div class="empty">${esc(tr('tickets.loading'))}</div>`
  if (!snap.config.hasToken && snap.workPackages.length === 0) {
    return `<div class="empty"><strong>${esc(tr('tickets.onboardingTitle'))}</strong><span>${esc(tr('tickets.onboardingDesc'))}</span>
      <button class="btn primary" data-action="tab" data-tab="setup">${esc(tr('tickets.configureButton'))}</button></div>`
  }
  if (model.rows.length === 0) {
    return `<div class="empty"><strong>${esc(tr('tickets.emptyTitle'))}</strong><span>${esc(tr('tickets.emptyDesc'))}</span></div>`
  }
  const selected = shownTicketId()
  const rows = model.rows
    .map(({ wp, depth }) => {
      const indent = depth > 0 ? `<span class="indent">${'&nbsp;&nbsp;&nbsp;'.repeat(depth - 1)}└&nbsp;</span>` : ''
      return `<tr class="wp-row${selected === wp.id ? ' selected' : ''}" data-action="open-ticket" data-id="${wp.id}">
        <td>${idLink(wp.id)}</td>
        <td class="hide-narrow">${typeLabel(wp)}</td>
        <td>${statusPill(wp.status, statusColorFor(wp.status, wp.statusColor))}</td>
        <td title="${esc(wp.subject)}">${indent}${esc(wp.subject)}</td>
        <td class="hide-narrow">${person(wp.assignee)}</td>
      </tr>`
    })
    .join('')
  return `<div class="table-wrap" data-keep-scroll="table">
    <table class="wp">
      <colgroup><col class="c-id"><col class="c-type hide-narrow"><col class="c-status"><col><col class="c-assignee hide-narrow"></colgroup>
      <thead><tr>
        ${sortHeader('id', tr('wp.colId'))}${sortHeader('type', tr('wp.colType'), 'hide-narrow')}${sortHeader('status', tr('wp.colStatus'))}${sortHeader('subject', tr('wp.colSubject'))}${sortHeader('assignee', tr('wp.colAssignee'), 'hide-narrow')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${model.hasMore && model.nextPageSize ? `<div class="load-more"><button class="btn ghost" data-action="load-more" data-size="${model.nextPageSize}">${esc(tr('wp.loadMore'))}</button></div>` : ''}
  </div>`
}

function renderLaunch(ticket: OpenProjectWorkPackage): string {
  const snap = state.snapshot
  const model = buildLaunchModel(ticket, snap?.workspaces ?? [], snap?.detectedAgents ?? [], state.launch.workspaceId)
  const agent = launchAgent(model.agentOptions)
  const wt = state.launch.createWorktree
  return `<div class="launch">
    <div class="seg">
      <button data-action="launch-mode" data-worktree="1" class="${wt ? 'on' : ''}">${esc(tr('ticket.launchModeWorktree'))}</button>
      <button data-action="launch-mode" data-worktree="0" class="${wt ? '' : 'on'}">${esc(tr('ticket.launchModeExisting'))}</button>
    </div>
    <label class="field"><span>${esc(tr('ticket.targetRepoLabel'))}</span><select data-bind="launch-repo">${options(model.repoOptions, model.selectedRepo)}</select></label>
    ${wt
      ? `<label class="field"><span>${esc(tr('ticket.worktreeBranchLabel'))}</span><input id="launch-branch" type="text" data-bind="launch-branch" value="${esc(state.launch.branch)}"></label>`
      : `<label class="field"><span>${esc(tr('ticket.targetWorkspaceLabel'))}</span><select data-bind="launch-workspace">${options(model.worktreeOptions, model.selectedWorkspace)}</select></label>`}
    <label class="field"><span>${esc(tr('ticket.launchAgentSelectLabel'))}</span><select data-bind="launch-agent">${options(model.agentOptions, agent)}</select></label>
    <div class="row">
      <button class="btn primary" data-action="launch-start">${esc(wt ? tr('ticket.createAndStartButton') : tr('ticket.startAgentButton'))}</button>
      <button class="btn" data-action="launch-toggle">${esc(tr('ticket.cancelLaunchButton'))}</button>
    </div>
  </div>`
}

function renderTicket(ticket: OpenProjectWorkPackage): string {
  const snap = state.snapshot
  const all = snap?.workPackages ?? []
  const activities = snap?.selectedTicket?.id === ticket.id ? snap.activities : []
  const parent = ticket.parentId ? all.find((w) => w.id === ticket.parentId) : undefined
  const parentSubject = ticket.parentSubject || parent?.subject || ''
  const children = all.filter((w) => w.parentId === ticket.id).sort((a, b) => a.id - b.id)
  const relCount = children.length + (ticket.parentId ? 1 : 0)
  const url = workPackageUrl(snap?.config.baseUrl ?? '', ticket.id)
  const statusHex = statusColorFor(ticket.status, ticket.statusColor)
  const prioHex = ticket.priorityColor || DEFAULT_PRIORITIES.find((p) => p.name === ticket.priority)?.color
  const sub = (id: DetailTab, label: string) =>
    `<button class="tab${state.detailTab === id ? ' active' : ''}" data-action="detail-tab" data-tab="${id}"><span class="label">${esc(label)}</span></button>`

  let body = ''
  if (state.detailTab === 'overview') {
    const latest = lastActivity(activities)
    const watchers =
      ticket.watchers === undefined
        ? ''
        : `<dt>${esc(tr('detail.watchers'))}</dt><dd>${
            ticket.watchers.length ? ticket.watchers.map(esc).join(', ') : '<span class="muted">—</span>'
          }</dd>`
    const dateRows: Array<[string, string]> = []
    if (ticket.startDate || ticket.dueDate) {
      const range =
        ticket.startDate && ticket.dueDate && ticket.startDate !== ticket.dueDate
          ? `${ticket.startDate} → ${ticket.dueDate}`
          : (ticket.dueDate ?? ticket.startDate)!
      dateRows.push([tr('detail.dates'), esc(range)])
    }
    if (ticket.percentageDone !== undefined && ticket.percentageDone > 0) {
      dateRows.push([
        tr('detail.done'),
        `<span class="progress"><span style="width:${Math.min(100, Math.max(0, ticket.percentageDone))}%"></span></span> ${ticket.percentageDone}%`
      ])
    }
    const estimate = formatDuration(ticket.estimatedTime)
    if (estimate) dateRows.push([tr('detail.estimated'), esc(estimate)])
    if (ticket.version) dateRows.push([tr('detail.version'), esc(ticket.version)])
    if (ticket.createdAt) dateRows.push([tr('detail.created'), esc(formatShortDate(ticket.createdAt))])
    body = `
      <div class="panels">
        <section>
          <div class="section-title">${esc(tr('detail.sectionPeople'))}</div>
          <dl class="kv"><dt>${esc(tr('ticket.assignee'))}</dt><dd>${person(ticket.assignee)}</dd>
            <dt>${esc(tr('ticket.responsible'))}</dt><dd>${person(ticket.responsible)}</dd>
            ${watchers}
            ${latest ? `<dt>${esc(tr('detail.lastActivity'))}</dt><dd>${esc(latest.user)} <span class="muted">· ${esc(formatShortDate(latest.createdAt))}</span></dd>` : ''}
          </dl>
        </section>
        ${dateRows.length ? `<section>
          <div class="section-title">${esc(tr('detail.sectionDates'))}</div>
          <dl class="kv">${dateRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>
        </section>` : ''}
      </div>
      <div class="section-title">${esc(tr('ticket.description'))}</div>
      ${ticket.description ? `<div class="md">${renderMarkdown(ticket.description)}</div>` : `<div class="muted">${esc(tr('detail.noDescription'))}</div>`}`
  } else if (state.detailTab === 'activity') {
    const items = [...activities]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => `<div class="activity"><div class="who"><strong>${esc(a.user)}</strong><span class="muted">${esc(formatShortDate(a.createdAt))}</span></div>${
        a.details?.length ? `<ul class="changes md">${a.details.map((d) => `<li>${renderMarkdown(d).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul>` : ''
      }${a.comment.trim() ? `<div class="md">${renderMarkdown(a.comment)}</div>` : ''}</div>`)
      .join('')
    body = `
      <textarea id="comment" data-bind="comment" rows="3" placeholder="${esc(tr('detail.commentPlaceholder'))}">${esc(state.comment)}</textarea>
      <div class="row"><button class="btn primary" id="comment-btn" data-action="comment" ${state.comment.trim() ? '' : 'disabled'}>${esc(tr('detail.postComment'))}</button></div>
      ${items || `<div class="muted">${esc(tr('detail.noActivity'))}</div>`}`
  } else {
    const relItem = (wp: Pick<OpenProjectWorkPackage, 'id' | 'subject' | 'type' | 'typeColor' | 'status' | 'statusColor'>, arrow: string) =>
      `<div class="rel-item" data-action="open-ticket" data-id="${wp.id}">${arrow}<span class="muted">#${wp.id}</span>${typeLabel(wp)}<span class="grow">${esc(wp.subject)}</span>${statusPill(wp.status, statusColorFor(wp.status, wp.statusColor))}</div>`
    body = `
      ${ticket.parentId ? `<div class="section-title">${esc(tr('detail.parent'))}</div><div class="rel-list">${
        parent ? relItem(parent, '↑') : `<div class="rel-item" data-action="open-ticket" data-id="${ticket.parentId}">↑ #${ticket.parentId} ${esc(parentSubject)}</div>`
      }</div>` : ''}
      <div class="section-title">${esc(tr('detail.children', { count: children.length }))}</div>
      ${children.length ? `<div class="rel-list">${children.map((c) => relItem(c, '↳')).join('')}</div>` : `<div class="muted">${esc(tr('detail.noChildren'))}</div>`}`
  }

  const back =
    state.prefs.mode === 'popover'
      ? `<div><button class="btn ghost back" data-action="back">← ${esc(tr('detail.backToList'))}</button></div>`
      : ''

  return `<div class="ticket">
    ${back}
    <div class="ticket-head">
      <div class="meta">
        <div class="line1">${typeLabel(ticket)} ${idLink(ticket.id)}
          ${ticket.project ? `<span class="muted">· ${esc(ticket.project)}</span>` : ''}
          ${ticket.parentId ? `<span class="parent muted">· ↑ <a href="#" data-action="open-ticket" data-id="${ticket.parentId}">#${ticket.parentId}${parentSubject ? ` ${esc(parentSubject)}` : ''}</a></span>` : ''}
        </div>
        <div class="line1">${statusPill(ticket.status, statusHex)} ${priorityLabel(ticket.priority, prioHex)}
          ${ticket.updatedAt ? `<span class="muted">${esc(tr('detail.updatedOn', { date: formatShortDate(ticket.updatedAt) }))}</span>` : ''}</div>
        <h2 class="subject">${esc(ticket.subject)}</h2>
      </div>
      <div class="actions">
        <div class="row">
          ${url ? `<button class="icon-btn" data-action="open-url" data-url="${esc(url)}" title="${esc(tr('detail.openInOpenProject'))}">↗</button>` : ''}
          <button class="icon-btn" data-action="close-ticket" title="${esc(tr('ticket.close'))}">✕</button>
        </div>
        <button class="btn primary lg" data-action="launch-toggle">⑂ ${esc(tr('ticket.launchAgent'))}</button>
      </div>
    </div>
    ${state.launchOpen ? renderLaunch(ticket) : ''}
    <div class="subtabs">${sub('overview', tr('detail.tabOverview'))}${sub('activity', tr('detail.tabActivity', { count: activities.length }))}${sub('relations', tr('detail.tabRelations', { count: relCount }))}</div>
    <div class="stack">${body}</div>
  </div>`
}

function renderTicketsTab(model: ListModel): string {
  const table = renderTable(model)
  if (state.prefs.mode === 'popover') {
    return `${renderToolbar(model)}<div class="split"><div class="split-top" style="flex:1 1 auto">${table}</div></div>`
  }
  const ticket = ticketById(state.stackedId)
  const pct = Math.round(state.prefs.split * 1000) / 10
  return `${renderToolbar(model)}
    <div class="split" id="split">
      <div class="split-top" id="split-top" style="flex:0 0 ${pct}%">${table}</div>
      <div class="drag-bar" id="drag-bar" role="separator" aria-orientation="horizontal" title="${esc(tr('mode.dragHint'))}"></div>
      <div class="split-bottom" data-keep-scroll="stacked-ticket">${
        ticket
          ? renderTicket(ticket)
          : `<div class="empty"><strong>${esc(tr('detail.emptyTitle'))}</strong><span>${esc(tr('detail.emptyHint'))}</span></div>`
      }</div>
    </div>`
}

function renderCreateTab(): string {
  const snap = state.snapshot
  const c = state.create
  const writable = (snap?.projects ?? []).filter((p) => p.canCreateWorkPackage !== false)
  const types = snap?.types?.length ? snap.types : DEFAULT_OPENPROJECT_TYPES
  const priorities = snap?.priorities?.length ? snap.priorities : DEFAULT_PRIORITIES
  const members = buildMemberOptions(snap, tr('filters.unassignedOption'))
  const parents: Option[] = [
    { value: '0', label: tr('create.noParentOption') },
    ...(snap?.workPackages ?? [])
      .filter((wp) => wp.projectIdentifier === c.project || wp.project === c.project)
      .map((wp) => ({ value: String(wp.id), label: `#${wp.id} [${wp.type}] ${wp.subject}` }))
  ]
  if (!writable.length) {
    return `<div class="pad"><div class="banner warning"><span class="text"><strong>${esc(tr('create.unauthorizedTitle'))}</strong><br>${esc(tr('create.unauthorizedDesc'))}</span></div></div>`
  }
  return `<div class="pad stack scroll">
    <label class="field"><span>${esc(tr('create.projectLabel'))}</span><select data-bind="create-project">${options(writable.map((p) => ({ value: p.identifier, label: p.name })), c.project)}</select></label>
    <label class="field"><span>${esc(tr('create.parentLabel'))}</span><select data-bind="create-parent">${options(parents, c.parent)}</select></label>
    <label class="field"><span>${esc(tr('create.subjectLabel'))}</span><input id="create-subject" type="text" data-bind="create-subject" value="${esc(c.subject)}"></label>
    <div class="grid2">
      <label class="field"><span>${esc(tr('create.typeLabel'))}</span><select data-bind="create-type">${options(types.map((x) => ({ value: x.name, label: x.name })), c.type)}</select></label>
      <label class="field"><span>${esc(tr('create.priorityLabel'))}</span><select data-bind="create-priority">${options(priorities.map((x) => ({ value: x.name, label: x.name })), c.priority)}</select></label>
      <label class="field"><span>${esc(tr('ticket.assignee'))}</span><select data-bind="create-assignee">${options(members, c.assignee)}</select></label>
      <label class="field"><span>${esc(tr('ticket.responsible'))}</span><select data-bind="create-responsible">${options(members, c.responsible)}</select></label>
    </div>
    <label class="field"><span>${esc(tr('create.descriptionLabel'))}</span><textarea id="create-description" rows="6" data-bind="create-description">${esc(c.description)}</textarea></label>
    <div class="row"><button class="btn primary" id="create-btn" data-action="create" ${c.subject.trim() && c.project ? '' : 'disabled'}>${esc(tr('create.submitButton'))}</button></div>
  </div>`
}

function renderSetupTab(): string {
  const snap = state.snapshot
  const s = state.setup
  const agents = snap?.detectedAgents ?? []
  const agentOptions = agentChoices(agents)
  const setupAgent = shownOption(agentOptions, s.agent)
  const info = agents.find((a) => a.id === setupAgent)
  return `<div class="pad stack scroll">
    <label class="field"><span>${esc(tr('setup.baseUrlLabel'))}</span><input id="setup-url" type="text" data-bind="setup-url" placeholder="https://openproject.example.com" value="${esc(s.baseUrl)}"></label>
    <label class="field"><span>${esc(tr('setup.apiTokenLabel'))}</span><input id="setup-token" type="password" data-bind="setup-token" placeholder="${esc(snap?.config.hasToken ? tr('setup.apiTokenSavedPlaceholder') : '')}" value="${esc(s.token)}"></label>
    <label class="field"><span>${esc(tr('setup.defaultAgentLabel'))}</span><select data-bind="setup-agent">${options(agentOptions, setupAgent)}</select></label>
    <div class="row">
      <button class="btn primary" data-action="setup-save">${esc(tr('setup.saveButton'))}</button>
      <button class="btn" data-action="setup-register">${esc(tr('setup.registerMcpButton'))}</button>
    </div>
    <div class="section-title">${esc(tr('setup.advancedTitle'))}</div>
    <div class="muted">${esc(tr('setup.advancedDesc'))}</div>
    <div class="grid2">
      <label class="field"><span>${esc(tr('setup.readAllowlistLabel'))}</span><input id="setup-read" type="text" data-bind="setup-read" value="${esc(s.readProjects)}"></label>
      <label class="field"><span>${esc(tr('setup.writeAllowlistLabel'))}</span><input id="setup-write" type="text" data-bind="setup-write" value="${esc(s.writeProjects)}"></label>
    </div>
    ${info?.mcpSnippet ? `<div class="muted">${esc(tr('setup.mcpSnippetDesc', { target: info.mcpConfigPath || info.label }))}</div><pre class="snippet">${esc(info.mcpSnippet)}</pre>` : ''}
  </div>`
}

// ---------------------------------------------------------------------------------------------
// Render loop (focus and scroll positions survive re-renders)

const app = document.createElement('div')
app.id = 'app'

function render(): void {
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
  const focusId = active && app.contains(active) ? active.id : ''
  const selStart = focusId && 'selectionStart' in active! ? active!.selectionStart : null
  const selEnd = focusId && 'selectionEnd' in active! ? active!.selectionEnd : null
  const scrolls = new Map<string, number>()
  app.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((el) => scrolls.set(el.dataset.keepScroll!, el.scrollTop))

  document.documentElement.lang = state.prefs.locale
  const model = buildListModel(state.snapshot, state.prefs, state.pageSize)
  let content = ''
  if (state.tab === 'tickets') content = renderTicketsTab(model)
  else if (state.tab === 'ticket') {
    const ticket = ticketById(state.ticketTabId)
    content = ticket
      ? `<div class="scroll grow" data-keep-scroll="popover-ticket">${renderTicket(ticket)}</div>`
      : `<div class="empty">${esc(tr('tickets.loading'))}</div>`
  } else if (state.tab === 'create') content = renderCreateTab()
  else content = renderSetupTab()

  app.innerHTML = `${renderHeader(model)}${renderTabBar()}${renderBanner()}<div class="content">${content}</div>`

  app.querySelectorAll<HTMLElement>('[data-keep-scroll]').forEach((el) => {
    const top = scrolls.get(el.dataset.keepScroll!)
    if (top) el.scrollTop = top
  })
  if (focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null
    if (el) {
      el.focus()
      if (selStart !== null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(selStart, selEnd ?? selStart)
        } catch {
          /* not a text field */
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Events

function closestAction(target: EventTarget | null): HTMLElement | null {
  return (target as HTMLElement | null)?.closest?.('[data-action]') ?? null
}

app.addEventListener('click', (event) => {
  const el = closestAction(event.target)
  if (!el || (el as HTMLButtonElement).disabled) return
  const action = el.dataset.action
  if (el.tagName === 'A' || action === 'open-url') event.preventDefault()
  // A link or button inside a clickable row handles the click itself.
  event.stopPropagation()
  const currentTicket = ticketById(shownTicketId())
  switch (action) {
    case 'open-url':
      if (el.dataset.url) openExternal(el.dataset.url)
      return
    case 'open-ticket':
      void openTicket(Number(el.dataset.id))
      return
    case 'close-ticket':
      closeTicket()
      return
    case 'back':
      state.tab = 'tickets'
      break
    case 'tab':
      state.tab = el.dataset.tab as MainTab
      break
    case 'detail-tab':
      state.detailTab = el.dataset.tab as DetailTab
      break
    case 'sync':
      void refreshAll()
      return
    case 'locale':
      setPrefs({ locale: (state.prefs.locale === 'vi' ? 'en' : 'vi') as UiLocale })
      break
    case 'dismiss':
      state.feedback = null
      break
    case 'filters':
      state.filtersOpen = !state.filtersOpen
      break
    case 'reset': {
      const hadProject = state.prefs.project !== 'all'
      setPrefs({ project: 'all', scope: 'all', status: 'all', priority: 'all', search: '', sort: null })
      if (hadProject) void reloadList({ project: 'all' })
      break
    }
    case 'mode': {
      const mode = el.dataset.mode === 'popover' ? 'popover' : 'stacked'
      if (mode !== state.prefs.mode) {
        const current = shownTicketId()
        setPrefs({ mode })
        if (mode === 'popover') {
          state.ticketTabId = current
          state.stackedId = null
        } else {
          state.stackedId = current
          state.ticketTabId = null
          if (state.tab === 'ticket') state.tab = 'tickets'
        }
      }
      break
    }
    case 'sort': {
      const column = el.dataset.column!
      const s = state.prefs.sort
      setPrefs({
        sort: !s || s.column !== column ? { column, direction: 'asc' } : s.direction === 'asc' ? { column, direction: 'desc' } : null
      })
      break
    }
    case 'load-more':
      void changePageSize(Number(el.dataset.size))
      return
    case 'launch-toggle':
      state.launchOpen = !state.launchOpen
      break
    case 'launch-mode':
      state.launch.createWorktree = el.dataset.worktree === '1'
      break
    case 'launch-start':
      if (currentTicket) void launchWorkspace(currentTicket)
      return
    case 'comment':
      if (currentTicket) void postComment(currentTicket.id)
      return
    case 'create':
      void createTicket()
      return
    case 'setup-save':
      void saveSetup()
      return
    case 'setup-register':
      void registerMcp()
      return
    default:
      return
  }
  render()
})

/** Text fields update state without a full redraw (keeps typing smooth); selects redraw. */
app.addEventListener('input', (event) => {
  const el = event.target as HTMLInputElement | HTMLTextAreaElement
  const bind = el.dataset.bind
  const v = el.value
  switch (bind) {
    case 'search':
      setPrefs({ search: v })
      render()
      return
    case 'comment': {
      state.comment = v
      const btn = document.getElementById('comment-btn') as HTMLButtonElement | null
      if (btn) btn.disabled = !v.trim()
      return
    }
    case 'launch-branch':
      state.launch.branch = v
      return
    case 'create-subject': {
      state.create.subject = v
      const btn = document.getElementById('create-btn') as HTMLButtonElement | null
      if (btn) btn.disabled = !(v.trim() && state.create.project)
      return
    }
    case 'create-description':
      state.create.description = v
      return
    case 'setup-url':
      state.setup.baseUrl = v
      return
    case 'setup-token':
      state.setup.token = v
      return
    case 'setup-read':
      state.setup.readProjects = v
      return
    case 'setup-write':
      state.setup.writeProjects = v
  }
})

app.addEventListener('change', (event) => {
  const el = event.target as HTMLSelectElement
  const v = el.value
  const currentTicket = ticketById(shownTicketId())
  switch (el.dataset.bind) {
    case 'view':
      if (v === 'mine') {
        setPrefs({ scope: 'my_todos' })
        void changeStatus('all')
      } else {
        setPrefs({ scope: 'all' })
        void changeStatus(v === 'closed' ? 'closed' : 'all')
      }
      return
    case 'project':
      void changeProject(v)
      return
    case 'status':
      void changeStatus(v)
      return
    case 'priority':
      setPrefs({ priority: v })
      break
    case 'sort': {
      if (v === 'hierarchy') setPrefs({ sort: null })
      else {
        const [column, direction] = v.split(':')
        setPrefs({ sort: { column, direction: direction === 'desc' ? 'desc' : 'asc' } })
      }
      break
    }
    case 'pageSize':
      void changePageSize(Number(v))
      return
    case 'launch-repo':
      if (currentTicket) {
        const model = buildLaunchModel(currentTicket, state.snapshot?.workspaces ?? [], state.snapshot?.detectedAgents ?? [], state.launch.workspaceId)
        state.launch.workspaceId = model.workspaceForRepo(v)
      }
      break
    case 'launch-workspace':
      state.launch.workspaceId = v
      break
    case 'launch-agent':
      state.launch.agent = v
      break
    case 'create-project':
      state.create.project = v
      state.create.parent = '0'
      break
    case 'create-parent':
      state.create.parent = v
      break
    case 'create-type':
      state.create.type = v
      break
    case 'create-priority':
      state.create.priority = v
      break
    case 'create-assignee':
      state.create.assignee = v
      break
    case 'create-responsible':
      state.create.responsible = v
      break
    case 'setup-agent':
      state.setup.agent = v
      break
    default:
      return
  }
  render()
})

// Drag bar between table and ticket (stacked mode).
app.addEventListener('pointerdown', (event) => {
  const bar = (event.target as HTMLElement).closest?.('#drag-bar') as HTMLElement | null
  if (!bar) return
  const split = document.getElementById('split')
  const top = document.getElementById('split-top')
  if (!split || !top) return
  event.preventDefault()
  bar.setPointerCapture(event.pointerId)
  bar.classList.add('dragging')
  document.body.classList.add('resizing')
  const rect = split.getBoundingClientRect()
  const ratioAt = (clientY: number) =>
    Math.min(0.85, Math.max(0.15, (clientY - rect.top) / Math.max(rect.height, 1)))
  const move = (e: PointerEvent) => {
    top.style.flexBasis = `${ratioAt(e.clientY) * 100}%`
  }
  const up = (e: PointerEvent) => {
    bar.releasePointerCapture(e.pointerId)
    bar.removeEventListener('pointermove', move)
    bar.removeEventListener('pointerup', up)
    bar.classList.remove('dragging')
    document.body.classList.remove('resizing')
    setPrefs({ split: ratioAt(e.clientY) })
  }
  bar.addEventListener('pointermove', move)
  bar.addEventListener('pointerup', up)
})

// Keyboard: Escape closes the open ticket.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && shownTicketId() !== null && !(event.target as HTMLElement).closest?.('input,textarea,select')) {
    closeTicket()
  }
})

// ---------------------------------------------------------------------------------------------
// Boot

const style = document.createElement('style')
style.textContent = PANEL_CSS
document.head.appendChild(style)
document.body.appendChild(app)

orca.plugin.on('openproject.state.changed', (snapshot) => {
  applySnapshot(snapshot)
  render()
})

void (async () => {
  try {
    state.prefs = normalizePrefs(await orca.storage.get(PREFS_KEY))
  } catch {
    state.prefs = normalizePrefs(null)
  }
  render()
  await loadState()
  // Reopen the ticket the worker remembers (stacked mode shows it under the table).
  const remembered = state.snapshot?.selectedTicket
  if (remembered && state.prefs.mode === 'stacked') {
    state.stackedId = remembered.id
    resetLaunchFor(remembered)
    render()
  }
})()

