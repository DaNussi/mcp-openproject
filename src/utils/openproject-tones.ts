import type { OpenProjectTypeItem, OpenProjectWorkPackage } from '../protocol'

export const DEFAULT_OPENPROJECT_TYPES: OpenProjectTypeItem[] = [
  { id: 1, name: 'Task', color: '#1A67A3', isDefault: true, isMilestone: false },
  { id: 2, name: 'Milestone', color: '#35C53F', isDefault: false, isMilestone: true },
  { id: 3, name: 'Phase', color: '#008BD0', isDefault: false, isMilestone: false },
  { id: 4, name: 'Feature', color: '#9775FA', isDefault: false, isMilestone: false },
  { id: 5, name: 'Epic', color: '#F0AD4E', isDefault: false, isMilestone: false },
  { id: 6, name: 'User story', color: '#748FFC', isDefault: false, isMilestone: false },
  { id: 7, name: 'Bug', color: '#D9534F', isDefault: false, isMilestone: false }
]

export const UNUSED_BOILERPLATE_STATUSES = new Set([
  'in specification',
  'specified',
  'confirmed',
  'to be scheduled',
  'scheduled'
])

export function isStatusClosedName(status: string): boolean {
  const s = status.toLowerCase().trim()
  return s === 'closed' || s === 'rejected' || s === 'resolved'
}

export interface HierarchicalTicketRow {
  wp: OpenProjectWorkPackage
  depth: number
  childCount: number
  isCollapsed: boolean
}

export function buildHierarchicalTicketList(
  tickets: OpenProjectWorkPackage[],
  collapsedParentIds: number[]
): HierarchicalTicketRow[] {
  const ticketById = new Map<number, OpenProjectWorkPackage>()
  for (const t of tickets) {
    ticketById.set(t.id, t)
  }

  const childrenByParentId = new Map<number, OpenProjectWorkPackage[]>()
  const roots: OpenProjectWorkPackage[] = []

  for (const t of tickets) {
    if (t.parentId && t.parentId !== t.id && ticketById.has(t.parentId)) {
      const list = childrenByParentId.get(t.parentId) ?? []
      list.push(t)
      childrenByParentId.set(t.parentId, list)
    } else {
      roots.push(t)
    }
  }

  for (const [, children] of childrenByParentId) {
    children.sort((a, b) => a.id - b.id)
  }

  const collapsedSet = new Set<number>(collapsedParentIds)
  const visited = new Set<number>()
  const rows: HierarchicalTicketRow[] = []

  function visit(node: OpenProjectWorkPackage, depth: number): void {
    if (visited.has(node.id)) return
    visited.add(node.id)
    const directChildren = childrenByParentId.get(node.id) ?? []
    const totalChildCount = Math.max(
      directChildren.length,
      node.childIds ? node.childIds.length : 0
    )
    const isCollapsed = collapsedSet.has(node.id)
    rows.push({
      wp: node,
      depth,
      childCount: totalChildCount,
      isCollapsed
    })
    if (!isCollapsed && directChildren.length > 0) {
      for (const child of directChildren) {
        visit(child, depth + 1)
      }
    }
  }

  for (const root of roots) {
    visit(root, 0)
  }
  for (const t of tickets) {
    if (!visited.has(t.id)) {
      visit(t, 0)
    }
  }

  return rows
}

export function formatShortDate(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}
