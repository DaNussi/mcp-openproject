import type {
  OpenProjectPriorityItem,
  OpenProjectStatusItem,
  OpenProjectWorkPackage
} from '../protocol'
import { buildHierarchicalTicketList } from './openproject-tones'

export type WorkPackageSort = { column: string; direction: 'asc' | 'desc' }

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
  sort: WorkPackageSort | null,
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

export function workPackageUrl(baseUrl: string, id: number): string | null {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(clean)) return null
  return `${clean}/work_packages/${id}`
}
