import { createTranslator, type UiLocale } from '../i18n'
import { matchBestWorkspaceForTicket } from '../openproject-api'
import type {
  DetectedAgentCli,
  OpenProjectPriorityItem,
  OpenProjectStateSnapshot,
  OpenProjectStatusItem,
  OpenProjectWorkPackage,
  OpenProjectWorkspaceOption
} from '../protocol'
import {
  isStatusClosedName,
  UNUSED_BOILERPLATE_STATUSES
} from '../utils/openproject-tones'
import {
  orderWorkPackages,
  type OrderedWorkPackage,
  type WorkPackageSort
} from '../utils/work-package-table'

export type ScopeMode = 'all' | 'my_todos'
export type LayoutMode = 'stacked' | 'popover'

/** Per-viewer UI preferences, kept in the plugin's storage. */
export interface UiPrefs {
  locale: UiLocale
  mode: LayoutMode
  /** Share of the stacked split given to the table (0.15 – 0.85). */
  split: number
  project: string
  scope: ScopeMode
  status: string
  priority: string
  search: string
  sort: WorkPackageSort | null
}

export const DEFAULT_PREFS: UiPrefs = {
  locale: 'en',
  mode: 'stacked',
  split: 0.45,
  project: 'all',
  scope: 'all',
  status: 'all',
  priority: 'all',
  search: '',
  sort: null
}

export function normalizePrefs(raw: unknown): UiPrefs {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<UiPrefs>
  const split = typeof p.split === 'number' && Number.isFinite(p.split) ? p.split : DEFAULT_PREFS.split
  return {
    locale: p.locale === 'vi' ? 'vi' : 'en',
    mode: p.mode === 'popover' ? 'popover' : 'stacked',
    split: Math.min(0.85, Math.max(0.15, split)),
    project: typeof p.project === 'string' && p.project ? p.project : 'all',
    scope: p.scope === 'my_todos' ? 'my_todos' : 'all',
    status: typeof p.status === 'string' && p.status ? p.status : 'all',
    priority: typeof p.priority === 'string' && p.priority ? p.priority : 'all',
    search: typeof p.search === 'string' ? p.search : '',
    sort:
      p.sort && typeof p.sort.column === 'string'
        ? { column: p.sort.column, direction: p.sort.direction === 'desc' ? 'desc' : 'asc' }
        : null
  }
}

export interface Option {
  value: string
  label: string
}

export const DEFAULT_PRIORITIES: OpenProjectPriorityItem[] = [
  { id: 1, name: 'Low', color: '#C5F6FA' },
  { id: 2, name: 'Normal', color: '#74C0FC' },
  { id: 3, name: 'High', color: '#F59F00' },
  { id: 4, name: 'Immediate', color: '#FA5252' }
]

export const PAGE_SIZE_STEPS = ['50', '100', '200'] as const

function norm(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim()
}

export type WorkPackageView = 'open' | 'mine' | 'closed'

export interface ListModel {
  view: WorkPackageView
  rows: OrderedWorkPackage[]
  filteredCount: number
  totalCount: number
  hasMore: boolean
  nextPageSize: string | undefined
  drawerFilterCount: number
  canReset: boolean
  projectOptions: Option[]
  statusOptions: Option[]
  priorityOptions: Option[]
  statuses: OpenProjectStatusItem[]
  priorities: OpenProjectPriorityItem[]
}

/** Everything the work package table needs, derived from the worker snapshot and the filters. */
export function buildListModel(
  snapshot: OpenProjectStateSnapshot | null,
  prefs: UiPrefs,
  pageSize: number
): ListModel {
  const tr = createTranslator(prefs.locale)
  const projects = snapshot?.projects ?? []
  const all = snapshot?.workPackages ?? []
  const apiStatuses = snapshot?.statuses ?? []
  const priorities =
    snapshot?.priorities && snapshot.priorities.length > 0 ? snapshot.priorities : DEFAULT_PRIORITIES
  const currentUser = norm(snapshot?.currentUser)

  const closedByName = new Map<string, boolean>()
  for (const st of apiStatuses) closedByName.set(norm(st.name), st.isClosed ?? isStatusClosedName(st.name))
  const isClosed = (name: string) => closedByName.get(norm(name)) ?? isStatusClosedName(name)

  const inProject = (wp: OpenProjectWorkPackage) =>
    !prefs.project ||
    prefs.project === 'all' ||
    wp.projectIdentifier === prefs.project ||
    wp.project === prefs.project
  const scoped = all.filter(inProject)

  const statusCounts = new Map<string, number>()
  for (const wp of scoped) statusCounts.set(norm(wp.status), (statusCounts.get(norm(wp.status)) ?? 0) + 1)

  const statuses = [...apiStatuses]
  for (const wp of all) {
    if (wp.status && !statuses.some((s) => norm(s.name) === norm(wp.status))) {
      statuses.push({
        id: wp.statusId || statuses.length + 100,
        name: wp.status,
        color: wp.statusColor,
        isClosed: isStatusClosedName(wp.status)
      })
    }
  }
  const filterable = statuses.filter(
    (s) => (statusCounts.get(norm(s.name)) ?? 0) > 0 || !UNUSED_BOILERPLATE_STATUSES.has(norm(s.name))
  )
  const statusOptions: Option[] = [
    { value: 'all', label: tr('filters.allStatuses', { count: filterable.length }) },
    ...filterable.map((s) => {
      const count = statusCounts.get(norm(s.name)) ?? 0
      return { value: s.name, label: count > 0 ? `${s.name} (${count})` : s.name }
    })
  ]
  if (!statusOptions.some((o) => o.value === prefs.status) && prefs.status !== 'closed') {
    statusOptions.push({ value: prefs.status, label: prefs.status })
  }

  const filtered = scoped.filter((wp) => {
    if (prefs.scope === 'my_todos') {
      if (isClosed(wp.status)) return false
      if (currentUser) {
        if (!norm(wp.assignee).includes(currentUser) && !norm(wp.responsible).includes(currentUser)) {
          return false
        }
      } else if (wp.assignee === 'Unassigned' && !wp.responsible) {
        return false
      }
    }
    if (!prefs.status || prefs.status === 'all' || prefs.status === 'open') {
      if (isClosed(wp.status)) return false
    } else if (prefs.status === 'closed') {
      if (!isClosed(wp.status)) return false
    } else if (norm(wp.status) !== norm(prefs.status)) {
      return false
    }
    if (prefs.priority !== 'all' && norm(wp.priority) !== norm(prefs.priority)) return false
    const q = prefs.search.trim().toLowerCase()
    if (q) {
      const hay = `#${wp.id} ${wp.id} ${wp.subject} ${wp.type} ${wp.project} ${wp.status} ${wp.priority || ''} ${wp.assignee} ${wp.responsible || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const showingClosed = prefs.status === 'closed' || isClosed(prefs.status)
  const totalCount = scoped.filter((wp) => (showingClosed ? isClosed(wp.status) : !isClosed(wp.status))).length

  const ordered = orderWorkPackages(filtered, prefs.sort, { statuses, priorities })
  const rows = ordered.slice(0, pageSize)
  const nextPageSize = PAGE_SIZE_STEPS.find((s) => Number(s) > pageSize)
  const hasMore = ordered.length > rows.length || (nextPageSize !== undefined && all.length >= pageSize)

  const drawerFilterCount =
    (prefs.status !== 'all' && prefs.status !== 'closed' ? 1 : 0) + (prefs.priority !== 'all' ? 1 : 0)
  const canReset =
    drawerFilterCount > 0 ||
    prefs.project !== 'all' ||
    prefs.scope !== 'all' ||
    prefs.status !== 'all' ||
    prefs.search.trim().length > 0 ||
    prefs.sort !== null

  return {
    view: prefs.scope === 'my_todos' ? 'mine' : prefs.status === 'closed' ? 'closed' : 'open',
    rows,
    filteredCount: filtered.length,
    totalCount,
    hasMore,
    nextPageSize,
    drawerFilterCount,
    canReset,
    projectOptions: [
      { value: 'all', label: tr('filters.allProjects', { count: projects.length }) },
      ...projects.map((p) => ({ value: p.identifier, label: p.name }))
    ],
    statusOptions,
    priorityOptions: [
      { value: 'all', label: tr('filters.allPriority') },
      ...priorities.map((p) => ({ value: p.name, label: p.name }))
    ],
    statuses,
    priorities
  }
}

/** Members seen in principals and on loaded work packages, for the create form. */
export function buildMemberOptions(snapshot: OpenProjectStateSnapshot | null, unassignedLabel: string): Option[] {
  const byId = new Map<string, string>()
  for (const p of snapshot?.principals ?? []) if (p.id && p.name) byId.set(String(p.id), p.name)
  for (const wp of snapshot?.workPackages ?? []) {
    if (wp.assigneeId && wp.assignee && wp.assignee !== 'Unassigned') byId.set(String(wp.assigneeId), wp.assignee)
    if (wp.responsibleId && wp.responsible) byId.set(String(wp.responsibleId), wp.responsible)
  }
  return [
    { value: '0', label: unassignedLabel },
    ...Array.from(byId.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }))
  ]
}

/** OpenProject's ISO 8601 durations (`PT8H30M`, `P1DT2H`) as hours, e.g. `8.5 h`; days count 24 h. */
export function formatDuration(iso: string | undefined): string | null {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    (iso ?? '').trim()
  )
  if (!m || (!m[1] && !m[2] && !m[3] && !m[4])) return null
  const hours =
    Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60 + Number(m[4] ?? 0) / 3600
  return `${Math.round(hours * 100) / 100} h`
}

/** The newest journal entry: who touched the work package last, and when. */
export function lastActivity(
  activities: Array<{ user: string; createdAt: string }>
): { user: string; createdAt: string } | null {
  let latest: { user: string; createdAt: string } | null = null
  for (const a of activities) {
    if (a.createdAt && (!latest || a.createdAt > latest.createdAt)) latest = a
  }
  return latest
}

// ---------------------------------------------------------------------------------------------
// Colors

const HEX = /^#?([0-9a-f]{6})$/i

export function cleanHex(color: string | undefined): string | null {
  const m = HEX.exec((color ?? '').trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** Black or white text for a solid `hex` background (WCAG relative luminance). */
export function readableTextOn(hex: string): '#000000' | '#FFFFFF' {
  const clean = cleanHex(hex)
  if (!clean) return '#000000'
  const channel = (i: number) => {
    const v = Number.parseInt(clean.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return lum > 0.45 ? '#000000' : '#FFFFFF'
}

const FALLBACK_TYPE_COLORS: Array<[RegExp, string]> = [
  [/bug|fehler|error|incident/i, '#D9534F'],
  [/epic/i, '#F0AD4E'],
  [/milestone|meilenstein|release/i, '#35C53F'],
  [/phase/i, '#008BD0'],
  [/feature/i, '#9775FA'],
  [/story/i, '#748FFC'],
  [/task|aufgabe/i, '#1A67A3']
]

export function typeColor(wp: Pick<OpenProjectWorkPackage, 'type' | 'typeColor'>): string {
  return cleanHex(wp.typeColor) ?? FALLBACK_TYPE_COLORS.find(([re]) => re.test(wp.type))?.[1] ?? '#5C7080'
}

export function statusColor(name: string, color: string | undefined): string | null {
  return cleanHex(color)
}

export function priorityColor(name: string, color: string | undefined): string | null {
  return cleanHex(color)
}

/**
 * The value a `<select>` really shows: `wanted` when it is an option, else `fallback` when that is
 * one, else the first option. A browser shows the first option for an unknown value and fires no
 * change event when the person picks it, so state must follow what is shown, not what was stored.
 */
export function shownOption(options: Option[], wanted: string | undefined, fallback?: string): string {
  if (wanted && options.some((o) => o.value === wanted)) return wanted
  if (fallback && options.some((o) => o.value === fallback)) return fallback
  return options[0]?.value ?? wanted ?? ''
}

/** Agent choices for Setup and launch: installed agents, or every known one when none is detected. */
export function agentChoices(detectedAgents: DetectedAgentCli[]): Option[] {
  const installed = detectedAgents.filter((a) => a.installed)
  const source = installed.length > 0 ? installed : detectedAgents
  return source.length > 0 ? source.map((a) => ({ value: a.id, label: a.label })) : FALLBACK_AGENT_OPTIONS
}

// ---------------------------------------------------------------------------------------------
// Workspace launch

interface RepoGroup {
  key: string
  label: string
  representative: OpenProjectWorkspaceOption
  worktrees: OpenProjectWorkspaceOption[]
  hasFocused: boolean
  matchesProject: boolean
}

export interface LaunchModel {
  repoOptions: Option[]
  selectedRepo: string
  worktreeOptions: Option[]
  selectedWorkspace: string
  agentOptions: Option[]
  /** The best worktree of a repository, given its representative id (repo select value). */
  workspaceForRepo(repoValue: string): string
}

const FALLBACK_AGENT_OPTIONS: Option[] = [
  { value: 'antigravity', label: 'Antigravity (agy)' },
  { value: 'codex', label: 'OpenAI Codex (codex)' },
  { value: 'claude', label: 'Claude Code (claude)' },
  { value: 'gemini', label: 'Gemini CLI (gemini)' },
  { value: 'cursor-agent', label: 'Cursor Agent (cursor-agent)' },
  { value: 'opencode', label: 'OpenCode (opencode)' }
]

function repoKey(ws: OpenProjectWorkspaceOption): string {
  return (ws.repoName || ws.repoId || ws.name).toLowerCase()
}

/** Repository / worktree / agent choices for starting work on `ticket`. */
export function buildLaunchModel(
  ticket: OpenProjectWorkPackage,
  workspaces: OpenProjectWorkspaceOption[],
  detectedAgents: DetectedAgentCli[],
  chosenWorkspaceId: string
): LaunchModel {
  const best = matchBestWorkspaceForTicket(ticket, workspaces)
  const selectedId = chosenWorkspaceId || best?.id || workspaces[0]?.id || ''
  const selected = workspaces.find((w) => w.id === selectedId) ?? best

  const tokens = `${ticket.projectIdentifier} ${ticket.project}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && t !== 'project')

  const groups = new Map<string, RepoGroup>()
  for (const ws of workspaces) {
    const key = repoKey(ws)
    const g = groups.get(key)
    if (!g) {
      groups.set(key, {
        key,
        label: ws.repoName || ws.name,
        representative: ws,
        worktrees: [ws],
        hasFocused: Boolean(ws.isFocused),
        matchesProject: tokens.some((tok) => key.includes(tok))
      })
    } else {
      g.worktrees.push(ws)
      if (ws.isFocused) g.hasFocused = true
      if (ws.isMainWorktree && !g.representative.isMainWorktree) g.representative = ws
    }
  }
  const repoGroups = Array.from(groups.values()).sort((a, b) => {
    if (a.matchesProject !== b.matchesProject) return a.matchesProject ? -1 : 1
    if (a.hasFocused !== b.hasFocused) return a.hasFocused ? -1 : 1
    return a.label.localeCompare(b.label)
  })
  const active = (selected ? repoGroups.find((g) => g.key === repoKey(selected)) : undefined) ?? repoGroups[0]
  const fallbackLabel = selected?.repoName || selected?.name || 'default'

  const worktreeOptions: Option[] =
    active && active.worktrees.length > 0
      ? active.worktrees.map((ws) => {
          const name = ws.name || ws.branch || ws.repoName || ws.id
          const branch = ws.branch && ws.branch !== name ? ` (${ws.branch})` : ''
          return {
            value: ws.id,
            label: `${name}${branch}${ws.isMainWorktree ? ' [main]' : ''}${ws.isFocused ? ' ★' : ''}`
          }
        })
      : [{ value: selectedId || 'default-workspace', label: fallbackLabel }]

  const selectedWorkspace = worktreeOptions.some((o) => o.value === selectedId)
    ? selectedId
    : (active ? matchBestWorkspaceForTicket(ticket, active.worktrees)?.id : undefined) ||
      worktreeOptions[0]?.value ||
      selectedId

  return {
    repoOptions:
      repoGroups.length > 0
        ? repoGroups.map((g) => ({ value: g.representative.id, label: `${g.label}${g.hasFocused ? ' ★' : ''}` }))
        : [{ value: selectedId || 'default-workspace', label: fallbackLabel }],
    selectedRepo: active?.representative.id || selectedId,
    worktreeOptions,
    selectedWorkspace,
    agentOptions: agentChoices(detectedAgents),
    workspaceForRepo(repoValue: string): string {
      const g = repoGroups.find((x) => x.representative.id === repoValue)
      if (!g) return repoValue
      return (matchBestWorkspaceForTicket(ticket, g.worktrees) ?? g.representative).id
    }
  }
}
