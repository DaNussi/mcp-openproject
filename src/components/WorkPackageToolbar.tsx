import {
  Badge,
  Box,
  Button,
  Heading,
  Input,
  Row,
  Select,
  set,
  Stack
} from 'orca'
import { createTranslator, type UiLocale } from '../i18n'
import type { OpenProjectPriorityItem, OpenProjectStateSnapshot } from '../protocol'
import {
  activeTabAtom,
  changePageSize,
  changeProjectFilter,
  changeStatusFilter,
  filterPanelOpenAtom,
  localeAtom,
  priorityFilterAtom,
  refreshAll,
  resetAllFilters,
  scopeModeAtom,
  searchQueryAtom
} from '../state/panel-state'

export type WorkPackageView = 'open' | 'mine' | 'closed'

export interface WorkPackageHeaderProps {
  locale: UiLocale
  snapshot: OpenProjectStateSnapshot | null
  shownCount: number
  totalCount: number
  canCreate: boolean
}

/** OpenProject's page header: title, result count, the green + Create button, sync and language. */
export function WorkPackageHeader(props: WorkPackageHeaderProps) {
  const tr = createTranslator(props.locale)
  const { snapshot } = props
  const countText =
    snapshot === null
      ? '…'
      : !snapshot.config.hasToken
        ? tr('header.setupBadge')
        : props.shownCount !== props.totalCount
          ? `${props.shownCount} / ${props.totalCount}`
          : String(props.totalCount)

  return (
    <Row justify="between" align="center" gap="xs" wrap>
      <Row gap="xs" align="center">
        <Heading level={3}>{tr('wp.title')}</Heading>
        <Badge
          tone={
            snapshot === null
              ? 'neutral'
              : snapshot.config.hasToken
                ? 'accent'
                : 'warning'
          }
        >
          {countText}
        </Badge>
      </Row>
      <Row gap="xs" align="center">
        <Button
          size="xs"
          tone="success"
          icon="add"
          disabled={!props.canCreate}
          onPress={() => set(activeTabAtom, 'create')}
        >
          {tr('wp.create')}
        </Button>
        <Button size="xs" variant="outline" icon="refresh" onPress={refreshAll}>
          {tr('header.syncButton')}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onPress={() => set(localeAtom, props.locale === 'vi' ? 'en' : 'vi')}
        >
          {props.locale.toUpperCase()}
        </Button>
      </Row>
    </Row>
  )
}

export interface WorkPackageToolbarProps {
  locale: UiLocale
  view: WorkPackageView
  projectFilter: string
  statusFilter: string
  priorityFilter: string
  pageSize: string
  searchQuery: string
  filterPanelOpen: boolean
  /** Filters set inside the drawer (status, priority), shown on the Filter button. */
  activeFilterCount: number
  /** Anything differs from the defaults: view, project, search, drawer filters or sort. */
  canReset: boolean
  priorities: OpenProjectPriorityItem[]
  projectOptions: Array<{ value: string; label: string }>
  statusFilterOptions: Array<{ value: string; label: string }>
}

const PAGE_SIZES = ['50', '100', '200'] as const

function changeView(next: string): void {
  if (next === 'mine') {
    set(scopeModeAtom, 'my_todos')
    void changeStatusFilter('all')
  } else if (next === 'closed') {
    set(scopeModeAtom, 'all')
    void changeStatusFilter('closed')
  } else {
    set(scopeModeAtom, 'all')
    void changeStatusFilter('all')
  }
}

/** OpenProject's work package toolbar: saved views, project, search and the filter drawer. */
export function WorkPackageToolbar(props: WorkPackageToolbarProps) {
  const tr = createTranslator(props.locale)

  return (
    <Stack gap="sm">
      <Box columns={2} gap="xs">
        <Select
          label={tr('wp.viewLabel')}
          labelHidden
          value={props.view}
          options={[
            { value: 'open', label: tr('wp.viewOpen') },
            { value: 'mine', label: tr('wp.viewMine') },
            { value: 'closed', label: tr('wp.viewClosed') }
          ]}
          onChange={changeView}
        />
        <Select
          label={tr('filters.projectLabel')}
          labelHidden
          value={props.projectFilter}
          options={props.projectOptions}
          onChange={(val) => {
            void changeProjectFilter(val)
          }}
        />
      </Box>

      <Box direction="row" gap="xs" align="center">
        <Box grow>
          <Input
            label={tr('filters.searchLabel')}
            labelHidden
            type="search"
            placeholder={tr('filters.searchPlaceholder')}
            value={props.searchQuery}
            onChange={(val) => set(searchQueryAtom, val)}
          />
        </Box>
        <Button
          size="sm"
          icon="filter"
          variant={props.filterPanelOpen ? 'solid' : 'outline'}
          tone={props.filterPanelOpen ? 'accent' : 'neutral'}
          onPress={() => set(filterPanelOpenAtom, !props.filterPanelOpen)}
        >
          {props.activeFilterCount > 0
            ? tr('wp.filterCount', { count: props.activeFilterCount })
            : tr('wp.filter')}
        </Button>
      </Box>

      {props.filterPanelOpen ? (
        <Box border="neutral" background="muted" radius="sm" padding="sm">
          <Stack gap="xs">
            <Box columns={2} gap="xs">
              <Select
                key={`status-filter-${props.projectFilter}`}
                label={tr('filters.statusLabel')}
                value={props.statusFilter}
                options={props.statusFilterOptions}
                onChange={(val) => {
                  void changeStatusFilter(val)
                }}
              />
              <Select
                label={tr('wp.priorityFilterLabel')}
                value={props.priorityFilter}
                options={[
                  { value: 'all', label: tr('filters.allPriority') },
                  ...props.priorities.map((p) => ({ value: p.name, label: p.name }))
                ]}
                onChange={(val) => set(priorityFilterAtom, val)}
              />
            </Box>
            <Row justify="between" align="end" gap="xs" wrap>
              <Select
                label={tr('filters.pageSizeLabel')}
                value={props.pageSize}
                options={PAGE_SIZES.map((size) => ({
                  value: size,
                  label: tr('filters.pageSizeOption', { size })
                }))}
                onChange={(val) => {
                  if (val !== props.pageSize) void changePageSize(val)
                }}
              />
              <Button
                size="xs"
                variant="ghost"
                icon="close"
                disabled={!props.canReset}
                onPress={resetAllFilters}
              >
                {tr('filters.reset')}
              </Button>
            </Row>
          </Stack>
        </Box>
      ) : null}
    </Stack>
  )
}
