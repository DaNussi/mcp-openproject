import {
  Badge,
  Box,
  Button,
  Link,
  List,
  ListItem,
  Row,
  shell,
  Stack,
  Text
} from 'orca'
import { createTranslator, type UiLocale } from '../i18n'
import { selectTicket } from '../state/panel-state'
import {
  getPriorityToneStyle,
  getStatusToneStyle,
  getTypeToneStyle
} from '../utils/openproject-tones'
import { type OrderedWorkPackage, workPackageUrl } from '../utils/work-package-table'

export interface WorkPackageListProps {
  locale: UiLocale
  rows: OrderedWorkPackage[]
  baseUrl: string
  selectedId: number | null
  compact: boolean
  hasMore: boolean
  onLoadMore: () => void
}

const INDENT = '  '

/**
 * OpenProject-style work package rows: the #ID opens the work package in OpenProject, the rest of
 * the row opens it here. Type is colored like OpenProject's type label, status as a colored badge.
 */
export function WorkPackageList(props: WorkPackageListProps) {
  const tr = createTranslator(props.locale)

  return (
    <Box
      border="neutral"
      radius="sm"
      maxHeight={props.compact ? 280 : 640}
      scroll="y"
    >
      <Stack gap="none">
        {props.rows.map(({ wp, depth }) => {
          const url = workPackageUrl(props.baseUrl, wp.id)
          const typeTone = getTypeToneStyle(wp.type, wp.typeColor).textTone
          const statusTone = getStatusToneStyle(wp.status, wp.statusColor).border
          const prioTone = getPriorityToneStyle(wp.priority, wp.priorityColor).textTone
          const assignee =
            wp.assignee && wp.assignee !== 'Unassigned' ? wp.assignee : tr('filters.unassigned')
          const isSelected = props.selectedId === wp.id
          return (
            <Box
              key={String(wp.id)}
              direction="row"
              align="center"
              gap="xs"
              paddingX="xs"
              background={isSelected ? 'accent' : 'none'}
            >
              <Box width={58} shrink={false}>
                {url ? (
                  <Text size="xs" weight="medium">
                    <Link
                      onPress={() => {
                        void shell.openExternal(url)
                      }}
                    >
                      {`#${wp.id}`}
                    </Link>
                  </Text>
                ) : (
                  <Text size="xs" muted>{`#${wp.id}`}</Text>
                )}
              </Box>
              <Box grow>
                <List label={`#${wp.id}`}>
                  <ListItem
                    key={String(wp.id)}
                    current={isSelected}
                    title={
                      depth > 0
                        ? `${INDENT.repeat(depth - 1)}└ ${wp.subject}`
                        : wp.subject
                    }
                    onPress={() => selectTicket(wp.id)}
                  >
                    <Row gap="xs" align="center" wrap>
                      <Text size="xs" weight="semibold" tone={typeTone}>
                        {(wp.type || 'Task').toUpperCase()}
                      </Text>
                      <Badge tone={statusTone}>{wp.status}</Badge>
                      {wp.priority ? (
                        <Text size="xs" tone={prioTone}>
                          {wp.priority}
                        </Text>
                      ) : null}
                      <Text size="xs" muted truncate>
                        {assignee}
                      </Text>
                    </Row>
                  </ListItem>
                </List>
              </Box>
            </Box>
          )
        })}
        {props.hasMore ? (
          <Box padding="xs">
            <Button size="xs" variant="ghost" icon="expand" onPress={props.onLoadMore}>
              {tr('wp.loadMore')}
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Box>
  )
}
