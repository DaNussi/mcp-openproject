import type { TableColumn, TableRow, TableSort } from 'orca'
import type {
  OpenProjectPriorityItem,
  OpenProjectStatusItem,
  OpenProjectWorkPackage
} from '../protocol'
import { buildHierarchicalTicketList } from './openproject-tones'

export type WorkPackageColumnKey =
  | 'id'
  | 'type'
  | 'subject'
  | 'status'
  | 'assignee'
  | 'priority'

/** OpenProject's default work package table columns, ordered as OpenProject shows them. */
export function buildWorkPackageColumns(
  labels: Record<WorkPackageColumnKey, string>
): TableColumn[] {
  return [
    { key: 'id', label: labels.id, width: 'xs', sortable: true },
    { key: 'type', label: labels.type, width: 'sm', hideBelow: 'md', sortable: true },
    { key: 'subject', label: labels.subject, width: 'auto', minWidth: 'md', sortable: true },
    { key: 'status', label: labels.status, width: 'sm', sortable: true },
    { key: 'assignee', label: labels.assignee, width: 'sm', hideBelow: 'md', sortable: true },
    { key: 'priority', label: labels.priority, width: 'sm', hideBelow: 'md', sortable: true }
  ]
}

export interface WorkPackageOrderContext {
  statuses: OpenProjectStatusItem[]
  priorities: OpenProjectPriorityItem[]
}

function rankOf(names: string[], value: string): number {
  const idx = names.findIndex(
    (n) => n.toLowerCase().trim() === value.toLowerCase().trim()
  )
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function compareWorkPackages(
  a: OpenProjectWorkPackage,
  b: OpenProjectWorkPackage,
  column: string,
  ctx: WorkPackageOrderContext
): number {
  switch (column) {
    case 'id':
      return a.id - b.id
    case 'type':
      return a.type.localeCompare(b.type)
    case 'subject':
      return a.subject.localeCompare(b.subject)
    case 'status': {
      const names = ctx.statuses.map((s) => s.name)
      return rankOf(names, a.status) - rankOf(names, b.status) ||
        a.status.localeCompare(b.status)
    }
    case 'assignee':
      return displayAssignee(a).localeCompare(displayAssignee(b))
    case 'priority': {
      const names = ctx.priorities.map((p) => p.name)
      return rankOf(names, a.priority) - rankOf(names, b.priority) ||
        a.priority.localeCompare(b.priority)
    }
    default:
      return 0
  }
}

function displayAssignee(wp: OpenProjectWorkPackage): string {
  return wp.assignee && wp.assignee !== 'Unassigned' ? wp.assignee : ''
}

export interface OrderedWorkPackage {
  wp: OpenProjectWorkPackage
  depth: number
}

/**
 * With no sort, OpenProject's hierarchy order: parents followed by their children.
 * With a sort, a flat list ordered by that column (ties broken by id).
 */
export function orderWorkPackages(
  workPackages: OpenProjectWorkPackage[],
  sort: TableSort | null,
  ctx: WorkPackageOrderContext
): OrderedWorkPackage[] {
  if (!sort) {
    return buildHierarchicalTicketList(workPackages, []).map((row) => ({
      wp: row.wp,
      depth: row.depth
    }))
  }
  const factor = sort.direction === 'desc' ? -1 : 1
  return [...workPackages]
    .sort(
      (a, b) =>
        factor * (compareWorkPackages(a, b, sort.column, ctx) || a.id - b.id)
    )
    .map((wp) => ({ wp, depth: 0 }))
}

const INDENT = '   '

export function buildWorkPackageRows(
  ordered: OrderedWorkPackage[],
  unassignedLabel: string
): TableRow[] {
  return ordered.map(({ wp, depth }) => ({
    key: String(wp.id),
    cells: {
      id: wp.id,
      type: (wp.type || '').toUpperCase(),
      subject:
        depth > 0 ? `${INDENT.repeat(depth - 1)}└ ${wp.subject}` : wp.subject,
      status: wp.status,
      assignee: displayAssignee(wp) || unassignedLabel,
      priority: wp.priority || ''
    }
  }))
}

export function workPackageUrl(baseUrl: string, id: number): string | null {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(clean)) return null
  return `${clean}/work_packages/${id}`
}
