import {
  Box,
  Button,
  IconButton,
  Callout,
  Card,
  EmptyState,
  plugin,
  read,
  Row,
  set,
  Spinner,
  Tab,
  Tabs,
  Text,
  type PanelContext
} from 'orca'
import { CreateTicketView } from './components/CreateTicketView'
import { SetupView } from './components/SetupView'
import { TicketDetailView } from './components/TicketDetailView'
import { WorkPackageList } from './components/WorkPackageList'
import {
  WorkPackageHeader,
  WorkPackageToolbar,
  type WorkPackageView
} from './components/WorkPackageToolbar'
import { createTranslator } from './i18n'
import {
  activeTabAtom,
  changePageSize,
  feedbackMessageAtom,
  LIST_HEIGHT_MAX,
  LIST_HEIGHT_MIN,
  LIST_HEIGHT_STEP,
  listHeightAtom,
  filterPanelOpenAtom,
  localeAtom,
  pageSizeAtom,
  priorityFilterAtom,
  projectFilterAtom,
  scopeModeAtom,
  searchQueryAtom,
  stateAtom,
  statusFilterAtom,
  syncDraftsFromSnapshot,
  tableSortAtom,
  ticketDetailExpandedAtom
} from './state/panel-state'
import {
  DEFAULT_OPENPROJECT_TYPES,
  isStatusClosedName,
  UNUSED_BOILERPLATE_STATUSES
} from './utils/openproject-tones'
import { orderWorkPackages } from './utils/work-package-table'

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(
    plugin.on('openproject.state.changed', (snapshot) => {
      syncDraftsFromSnapshot(snapshot)
    })
  )
  const initialProject = read(projectFilterAtom)
  const initialPageSize = Number(read(pageSizeAtom) || '100')
  void plugin
    .request('openproject.state.get', {
      project: initialProject,
      pageSize: initialPageSize
    })
    .then((snapshot) => {
      syncDraftsFromSnapshot(snapshot)
    })
}

const DEFAULT_PRIORITIES = [
  { id: 1, name: 'Low', color: '#C5F6FA' },
  { id: 2, name: 'Normal', color: '#74C0FC' },
  { id: 3, name: 'High', color: '#F59F00' },
  { id: 4, name: 'Immediate', color: '#FA5252' }
]

const PAGE_SIZE_STEPS = ['50', '100', '200']

function norm(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim()
}

export default function Panel() {
  const locale = read(localeAtom)
  const tr = createTranslator(locale)
  const snapshot = read(stateAtom)
  const activeTab = read(activeTabAtom)
  const feedback = read(feedbackMessageAtom)
  const projectFilter = read(projectFilterAtom)
  const scopeMode = read(scopeModeAtom)
  const statusFilter = read(statusFilterAtom)
  const priorityFilter = read(priorityFilterAtom)
  const pageSize = read(pageSizeAtom) || '100'
  const searchQuery = read(searchQueryAtom)
  const filterPanelOpen = read(filterPanelOpenAtom)
  const tableSort = read(tableSortAtom)
  const ticketDetailExpanded = read(ticketDetailExpandedAtom)

  const projects = snapshot?.projects ?? []
  const writableProjects = projects.filter((p) => p.canCreateWorkPackage !== false)
  const canCreateAnyTask =
    Boolean(snapshot?.config.hasToken) && writableProjects.length > 0

  const allWorkPackages = snapshot?.workPackages ?? []
  const statuses = snapshot?.statuses ?? []
  const types =
    snapshot?.types && snapshot.types.length > 0
      ? snapshot.types
      : DEFAULT_OPENPROJECT_TYPES
  const priorities =
    snapshot?.priorities && snapshot.priorities.length > 0
      ? snapshot.priorities
      : DEFAULT_PRIORITIES
  const principals = snapshot?.principals ?? []
  const detectedAgents = snapshot?.detectedAgents ?? []
  const workspaces = snapshot?.workspaces ?? []
  const selectedTicket = snapshot?.selectedTicket ?? null
  const activities = snapshot?.activities ?? []
  const currentUserName = norm(snapshot?.currentUser)

  const closedStatusMap = new Map<string, boolean>()
  for (const st of statuses) {
    closedStatusMap.set(norm(st.name), st.isClosed ?? isStatusClosedName(st.name))
  }
  const isClosed = (statusName: string): boolean =>
    closedStatusMap.get(norm(statusName)) ?? isStatusClosedName(statusName)

  const inProject = (wp: { projectIdentifier: string; project: string; id: number }) =>
    !projectFilter ||
    projectFilter === 'all' ||
    wp.projectIdentifier === projectFilter ||
    wp.project === projectFilter ||
    String(wp.id) === projectFilter
  const projectScoped = allWorkPackages.filter(inProject)

  const statusCounts = new Map<string, number>()
  for (const wp of projectScoped) {
    statusCounts.set(norm(wp.status), (statusCounts.get(norm(wp.status)) ?? 0) + 1)
  }

  // OpenProject /api/v3/statuses plus any status only seen on a loaded work package.
  const discoveredStatuses = [...statuses]
  for (const wp of allWorkPackages) {
    if (wp.status && !discoveredStatuses.some((s) => norm(s.name) === norm(wp.status))) {
      discoveredStatuses.push({
        id: wp.statusId || discoveredStatuses.length + 100,
        name: wp.status,
        isClosed: isStatusClosedName(wp.status)
      })
    }
  }
  const filterableStatuses = discoveredStatuses.filter(
    (s) =>
      (statusCounts.get(norm(s.name)) ?? 0) > 0 ||
      !UNUSED_BOILERPLATE_STATUSES.has(norm(s.name))
  )
  const statusFilterOptions = [
    { value: 'all', label: tr('filters.allStatuses', { count: filterableStatuses.length }) },
    ...filterableStatuses.map((s) => {
      const count = statusCounts.get(norm(s.name)) ?? 0
      return {
        value: s.name,
        label: (s.isClosed ?? isStatusClosedName(s.name)) && count === 0
          ? s.name
          : `${s.name} (${count})`
      }
    })
  ]
  if (!statusFilterOptions.some((o) => o.value === statusFilter)) {
    statusFilterOptions.push({ value: statusFilter, label: statusFilter })
  }

  const discoveredPrincipals = new Map<string, string>()
  for (const p of principals) {
    if (p.id && p.name) discoveredPrincipals.set(String(p.id), p.name)
  }
  for (const wp of allWorkPackages) {
    if (wp.assigneeId && wp.assignee && wp.assignee !== 'Unassigned') {
      discoveredPrincipals.set(String(wp.assigneeId), wp.assignee)
    }
    if (wp.responsibleId && wp.responsible) {
      discoveredPrincipals.set(String(wp.responsibleId), wp.responsible)
    }
  }
  const memberOptions = [
    { value: '0', label: tr('filters.unassignedOption') },
    ...Array.from(discoveredPrincipals.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: id, label: name }))
  ]

  const projectOptions = [
    { value: 'all', label: tr('filters.allProjects', { count: projects.length }) },
    ...projects.map((p) => ({ value: p.identifier, label: p.name }))
  ]

  const view: WorkPackageView =
    scopeMode === 'my_todos' ? 'mine' : statusFilter === 'closed' ? 'closed' : 'open'

  const filteredTickets = projectScoped.filter((wp) => {
    if (scopeMode === 'my_todos') {
      if (isClosed(wp.status)) return false
      if (currentUserName) {
        if (
          !norm(wp.assignee).includes(currentUserName) &&
          !norm(wp.responsible).includes(currentUserName)
        ) {
          return false
        }
      } else if (wp.assignee === 'Unassigned' && !wp.responsible) {
        return false
      }
    }
    if (!statusFilter || statusFilter === 'all' || statusFilter === 'open') {
      if (isClosed(wp.status)) return false
    } else if (statusFilter === 'closed') {
      if (!isClosed(wp.status)) return false
    } else if (norm(wp.status) !== norm(statusFilter)) {
      return false
    }
    if (priorityFilter && priorityFilter !== 'all' && norm(wp.priority) !== norm(priorityFilter)) {
      return false
    }
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      const hay = `#${wp.id} ${wp.subject} ${wp.type} ${wp.project} ${wp.status} ${wp.priority || ''} ${wp.assignee} ${wp.responsible || ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const showingClosed = statusFilter === 'closed' || isClosed(statusFilter)
  const totalCount = projectScoped.filter((wp) =>
    showingClosed ? isClosed(wp.status) : !isClosed(wp.status)
  ).length

  const drawerFilterCount =
    (statusFilter !== 'all' && statusFilter !== 'closed' ? 1 : 0) +
    (priorityFilter !== 'all' ? 1 : 0)
  const hasAnyFilter =
    drawerFilterCount > 0 ||
    projectFilter !== 'all' ||
    scopeMode !== 'all' ||
    statusFilter !== 'all' ||
    searchQuery.trim().length > 0 ||
    tableSort !== null

  const pageLimit = Number(pageSize) || 100
  const ordered = orderWorkPackages(filteredTickets, tableSort, { statuses, priorities })
  const visible = ordered.slice(0, pageLimit)
  const nextPageSize = PAGE_SIZE_STEPS.find((s) => Number(s) > pageLimit)
  const hasMore =
    ordered.length > visible.length ||
    (nextPageSize !== undefined && allWorkPackages.length >= pageLimit)

  const detailOpen = Boolean(selectedTicket && ticketDetailExpanded)
  const listHeight = read(listHeightAtom)
  const stepListHeight = (delta: number) =>
    set(
      listHeightAtom,
      Math.min(LIST_HEIGHT_MAX, Math.max(LIST_HEIGHT_MIN, listHeight + delta))
    )

  const listBody =
    snapshot === null ? (
      <Spinner label={tr('tickets.loading')} />
    ) : !snapshot.config.hasToken && allWorkPackages.length === 0 ? (
      <Card title={tr('tickets.onboardingTitle')} description={tr('tickets.onboardingDesc')}>
        <Row gap="xs" align="center" wrap>
          <Button size="xs" tone="accent" onPress={() => set(activeTabAtom, 'setup')}>
            {tr('tickets.configureButton')}
          </Button>
        </Row>
      </Card>
    ) : filteredTickets.length === 0 ? (
      <EmptyState
        icon="search"
        title={tr('tickets.emptyTitle')}
        description={tr('tickets.emptyDesc')}
      />
    ) : (
      WorkPackageList({
        locale,
        rows: visible,
        baseUrl: snapshot.config.baseUrl,
        selectedId: detailOpen && selectedTicket ? selectedTicket.id : null,
        height: detailOpen ? listHeight : LIST_HEIGHT_MAX,
        hasMore,
        onLoadMore: () => {
          if (nextPageSize) void changePageSize(nextPageSize)
        }
      })
    )

  return (
    <Box direction="column" gap="sm">
      {WorkPackageHeader({
        locale,
        snapshot,
        shownCount: filteredTickets.length,
        totalCount,
        canCreate: canCreateAnyTask
      })}

      {feedback ? (
        <Callout tone={feedback.tone} title={tr('callout.statusTitle')}>
          <Text size="xs">{feedback.text}</Text>
        </Callout>
      ) : null}

      {snapshot?.lastError ? (
        <Callout tone="warning" title={tr('callout.providerWarningTitle')}>
          <Text size="xs">{snapshot.lastError}</Text>
        </Callout>
      ) : null}

      <Tabs
        label="OpenProject Views"
        value={activeTab}
        onChange={(nextTab) => set(activeTabAtom, nextTab)}
      >
        <Tab value="tickets" label={tr('tabs.tickets')}>
          <Box direction="column" gap="sm">
            {WorkPackageToolbar({
              locale,
              view,
              projectFilter,
              statusFilter,
              priorityFilter,
              pageSize,
              searchQuery,
              filterPanelOpen,
              activeFilterCount: drawerFilterCount,
              canReset: hasAnyFilter,
              sort: tableSort,
              priorities,
              projectOptions,
              statusFilterOptions
            })}

            {listBody}

            {detailOpen && selectedTicket ? (
              <Box direction="row" justify="center" gap="xs">
                <IconButton
                  size="xs"
                  variant="ghost"
                  icon="collapse"
                  label={tr('detail.shrinkList')}
                  tooltip={tr('detail.shrinkList')}
                  disabled={listHeight <= LIST_HEIGHT_MIN}
                  onPress={() => stepListHeight(-LIST_HEIGHT_STEP)}
                />
                <IconButton
                  size="xs"
                  variant="ghost"
                  icon="expand"
                  label={tr('detail.growList')}
                  tooltip={tr('detail.growList')}
                  disabled={listHeight >= LIST_HEIGHT_MAX}
                  onPress={() => stepListHeight(LIST_HEIGHT_STEP)}
                />
              </Box>
            ) : null}

            {detailOpen && selectedTicket
              ? TicketDetailView({
                  locale,
                  ticket: selectedTicket,
                  baseUrl: snapshot?.config.baseUrl ?? '',
                  allWorkPackages,
                  activities,
                  workspaces,
                  detectedAgents
                })
              : null}
          </Box>
        </Tab>

        <Tab value="create" label={tr('tabs.newTask')} disabled={!canCreateAnyTask}>
          {CreateTicketView({
            locale,
            writableProjects,
            allWorkPackages,
            types,
            priorities,
            memberOptions
          })}
        </Tab>

        <Tab value="setup" label={tr('tabs.setup')}>
          {SetupView({ locale, snapshot, detectedAgents })}
        </Tab>
      </Tabs>
    </Box>
  )
}
