import {
  Badge,
  Box,
  Button,
  Link,
  List,
  ListItem,
  Separator,
  shell,
  Stack,
  Text
} from 'orca'
import { createTranslator, type UiLocale } from '../i18n'
import { selectTicket } from '../state/panel-state'
import { getStatusToneStyle, getTypeToneStyle } from '../utils/openproject-tones'
import { type OrderedWorkPackage, workPackageUrl } from '../utils/work-package-table'

export interface WorkPackageListProps {
  locale: UiLocale
  rows: OrderedWorkPackage[]
  baseUrl: string
  selectedId: number | null
  /** List height in px; the rows scroll inside it. */
  height: number
  hasMore: boolean
  onLoadMore: () => void
}

const ID_WIDTH = 64
const TYPE_WIDTH = 88
const STATUS_WIDTH = 116
const INDENT = '  '

function HeaderCell(label: string, width?: number) {
  return (
    <Box width={width} grow={width === undefined} shrink={false}>
      <Text size="xs" weight="semibold" muted truncate>
        {label.toUpperCase()}
      </Text>
    </Box>
  )
}

/**
 * OpenProject's work package table: ID | TYPE | SUBJECT | STATUS. The ID opens the work package
 * in OpenProject; the subject opens it in the details pane. Type and status carry their colors.
 */
export function WorkPackageList(props: WorkPackageListProps) {
  const tr = createTranslator(props.locale)

  return (
    <Box
      border="neutral"
      radius="sm"
      direction="column"
      height={props.height}
    >
      <Box direction="row" align="center" gap="xs" paddingX="sm" paddingY="xs" background="muted">
        {HeaderCell(tr('wp.colId'), ID_WIDTH)}
        {HeaderCell(tr('wp.colType'), TYPE_WIDTH)}
        {HeaderCell(tr('wp.colSubject'))}
        {HeaderCell(tr('wp.colStatus'), STATUS_WIDTH)}
      </Box>
      <Box scroll="y" height={Math.max(props.height - 34, 60)}>
        <Stack gap="none">
          {props.rows.map(({ wp, depth }, index) => {
            const url = workPackageUrl(props.baseUrl, wp.id)
            const typeTone = getTypeToneStyle(wp.type, wp.typeColor).textTone
            const statusTone = getStatusToneStyle(wp.status, wp.statusColor).border
            const isSelected = props.selectedId === wp.id
            return (
              <Stack key={String(wp.id)} gap="none">
                {index > 0 ? <Separator /> : null}
                <Box
                  direction="row"
                  align="center"
                  gap="xs"
                  paddingX="sm"
                  background={isSelected ? 'accent' : 'none'}
                >
                  <Box width={ID_WIDTH} shrink={false}>
                    {url ? (
                      <Text size="xs" weight="medium">
                        <Link
                          onPress={() => {
                            void shell.openExternal(url)
                          }}
                        >
                          {String(wp.id)}
                        </Link>
                      </Text>
                    ) : (
                      <Text size="xs" muted>
                        {String(wp.id)}
                      </Text>
                    )}
                  </Box>
                  <Box width={TYPE_WIDTH} shrink={false}>
                    <Text size="xs" weight="semibold" tone={typeTone} truncate>
                      {(wp.type || 'Task').toUpperCase()}
                    </Text>
                  </Box>
                  <Box grow minWidth={0}>
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
                      />
                    </List>
                  </Box>
                  <Box width={STATUS_WIDTH} shrink={false}>
                    <Badge tone={statusTone}>{wp.status}</Badge>
                  </Box>
                </Box>
              </Stack>
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
    </Box>
  )
}
