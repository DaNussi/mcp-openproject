import {
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  KeyValue,
  Link,
  List,
  ListItem,
  Markdown,
  read,
  Row,
  Separator,
  set,
  shell,
  Stack,
  Tab,
  Tabs,
  Text,
  Textarea
} from 'orca'
import { createTranslator, type UiLocale } from '../i18n'
import type {
  DetectedAgentCli,
  OpenProjectActivity,
  OpenProjectWorkPackage,
  OpenProjectWorkspaceOption
} from '../protocol'
import {
  commentDraftAtom,
  detailTabAtom,
  launchPanelOpenAtom,
  postTicketComment,
  selectTicket,
  ticketDetailExpandedAtom
} from '../state/panel-state'
import {
  formatShortDate,
  getPriorityToneStyle,
  getStatusToneStyle,
  getTypeToneStyle
} from '../utils/openproject-tones'
import { workPackageUrl } from '../utils/work-package-table'
import { LaunchAgentDrawer } from './LaunchAgentDrawer'

export interface TicketDetailViewProps {
  locale: UiLocale
  ticket: OpenProjectWorkPackage
  baseUrl: string
  allWorkPackages: OpenProjectWorkPackage[]
  activities: OpenProjectActivity[]
  workspaces?: OpenProjectWorkspaceOption[]
  detectedAgents?: DetectedAgentCli[]
}

function SectionTitle(label: string) {
  return (
    <Stack gap="xs">
      <Text size="xs" weight="semibold" muted>
        {label.toUpperCase()}
      </Text>
      <Separator />
    </Stack>
  )
}

function personOrDash(name: string | undefined): string {
  return name && name !== 'Unassigned' ? name : '—'
}

/**
 * Read-only OpenProject work package view. Its one action is starting work: create a workspace
 * (or reuse one) and launch an agent. Commenting is the only write.
 */
export function TicketDetailView({
  locale,
  ticket,
  baseUrl,
  allWorkPackages,
  activities,
  workspaces = [],
  detectedAgents = []
}: TicketDetailViewProps) {
  const tr = createTranslator(locale)
  const detailTab = read(detailTabAtom)
  const launchPanelOpen = read(launchPanelOpenAtom)
  const commentDraft = read(commentDraftAtom)

  const typeTone = getTypeToneStyle(ticket.type, ticket.typeColor).textTone
  const statusTone = getStatusToneStyle(ticket.status, ticket.statusColor).border
  const prioTone = getPriorityToneStyle(ticket.priority, ticket.priorityColor).textTone
  const externalUrl = workPackageUrl(baseUrl, ticket.id)
  const openExternal = externalUrl
    ? () => {
        void shell.openExternal(externalUrl)
      }
    : undefined

  const parentWp = ticket.parentId
    ? allWorkPackages.find((w) => w.id === ticket.parentId)
    : undefined
  const parentSubject = ticket.parentSubject || parentWp?.subject || ''
  const children = allWorkPackages
    .filter((w) => w.parentId === ticket.id)
    .sort((a, b) => a.id - b.id)
  const relationCount = children.length + (ticket.parentId ? 1 : 0)
  const sortedActivities = [...activities].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )

  return (
    <Box
      border="neutral"
      background="card"
      radius="md"
      padding="sm"
      minHeight={480}
    >
      <Stack gap="sm">
        <Box direction="row" align="start" justify="between" gap="sm">
          <Box grow minWidth={0}>
            <Stack gap="xs">
              <Row gap="xs" align="center">
                <Text size="xs" weight="semibold" tone={typeTone}>
                  {(ticket.type || 'Task').toUpperCase()}
                </Text>
                {openExternal ? (
                  <Text size="xs">
                    <Link onPress={openExternal}>{`#${ticket.id}`}</Link>
                  </Text>
                ) : (
                  <Text size="xs" muted>{`#${ticket.id}`}</Text>
                )}
                {ticket.parentId ? (
                  <Text size="xs" muted truncate>
                    {'· ↑ '}
                    <Link onPress={() => selectTicket(ticket.parentId!)}>
                      {parentSubject
                        ? `#${ticket.parentId} ${parentSubject}`
                        : `#${ticket.parentId}`}
                    </Link>
                  </Text>
                ) : null}
              </Row>
              <Heading level={2}>{ticket.subject}</Heading>
              <Row gap="xs" align="center" wrap>
                <Badge tone={statusTone}>{ticket.status}</Badge>
                {ticket.priority ? <Badge tone={prioTone}>{ticket.priority}</Badge> : null}
                {ticket.updatedAt ? (
                  <Text size="xs" muted>
                    {tr('detail.updatedOn', { date: formatShortDate(ticket.updatedAt) })}
                  </Text>
                ) : null}
              </Row>
            </Stack>
          </Box>
          <Box shrink={false} align="end" gap="xs">
            <Row gap="xs" align="center">
              {openExternal ? (
                <IconButton
                  size="xs"
                  variant="ghost"
                  icon="open-external"
                  label={tr('detail.openInOpenProject')}
                  tooltip={tr('detail.openInOpenProject')}
                  onPress={openExternal}
                />
              ) : null}
              <IconButton
                size="xs"
                variant="ghost"
                icon="close"
                label={tr('ticket.close')}
                tooltip={tr('ticket.close')}
                onPress={() => set(ticketDetailExpandedAtom, false)}
              />
            </Row>
            <Button
              size="sm"
              icon="branch"
              tone="accent"
              variant={launchPanelOpen ? 'outline' : 'solid'}
              onPress={() => set(launchPanelOpenAtom, !launchPanelOpen)}
            >
              {tr('ticket.launchAgent')}
            </Button>
          </Box>
        </Box>

        {launchPanelOpen
          ? LaunchAgentDrawer({ locale, ticket, workspaces, detectedAgents })
          : null}

        <Tabs
          label={tr('detail.tabsLabel')}
          value={detailTab}
          onChange={(next) => set(detailTabAtom, next)}
        >
          <Tab value="overview" label={tr('detail.tabOverview')}>
            <Stack gap="md">
              <Stack gap="xs">
                {SectionTitle(tr('ticket.description'))}
                {ticket.description ? (
                  <Box padding="xs">
                    <Markdown content={ticket.description} />
                  </Box>
                ) : (
                  <Text size="xs" muted>
                    {tr('detail.noDescription')}
                  </Text>
                )}
              </Stack>

              <Stack gap="xs">
                {SectionTitle(tr('detail.sectionPeople'))}
                <KeyValue
                  label={tr('detail.sectionPeople')}
                  items={[
                    { label: tr('ticket.assignee'), value: personOrDash(ticket.assignee) },
                    { label: tr('ticket.responsible'), value: personOrDash(ticket.responsible) }
                  ]}
                />
              </Stack>

              <Stack gap="xs">
                {SectionTitle(tr('detail.sectionDetails'))}
                <KeyValue
                  label={tr('detail.sectionDetails')}
                  items={[
                    { label: tr('detail.type'), value: ticket.type, tone: typeTone },
                    { label: tr('detail.status'), value: ticket.status, tone: statusTone },
                    { label: tr('detail.priority'), value: ticket.priority, tone: prioTone },
                    { label: tr('detail.project'), value: ticket.project },
                    {
                      label: tr('detail.updated'),
                      value: ticket.updatedAt ? formatShortDate(ticket.updatedAt) : '—'
                    }
                  ]}
                />
              </Stack>
            </Stack>
          </Tab>

          <Tab value="activity" label={tr('detail.tabActivity', { count: activities.length })}>
            <Stack gap="sm">
              <Textarea
                label={tr('ticket.comment')}
                labelHidden
                placeholder={tr('detail.commentPlaceholder')}
                rows={3}
                value={commentDraft}
                onChange={(val) => set(commentDraftAtom, val)}
              />
              <Row gap="xs">
                <Button
                  size="xs"
                  tone="accent"
                  disabled={!commentDraft.trim()}
                  onPress={() => postTicketComment(ticket.id)}
                >
                  {tr('detail.postComment')}
                </Button>
              </Row>
              {sortedActivities.length === 0 ? (
                <Text size="xs" muted>
                  {tr('detail.noActivity')}
                </Text>
              ) : (
                <Stack gap="xs">
                  {sortedActivities.map((act) => (
                    <Box key={String(act.id)} border="neutral" radius="sm" padding="xs">
                      <Stack gap="xs">
                        <Row justify="between" align="center" gap="xs">
                          <Text size="xs" weight="semibold">
                            {act.user}
                          </Text>
                          <Text size="xs" muted>
                            {formatShortDate(act.createdAt)}
                          </Text>
                        </Row>
                        <Markdown content={act.comment} />
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          </Tab>

          <Tab value="relations" label={tr('detail.tabRelations', { count: relationCount })}>
            <Stack gap="sm">
              {ticket.parentId ? (
                <Stack gap="xs">
                  {SectionTitle(tr('detail.parent'))}
                  <List label={tr('detail.parent')}>
                    <ListItem
                      key={`parent-${ticket.parentId}`}
                      icon="layers"
                      title={`#${ticket.parentId} ${parentSubject}`.trim()}
                      description={parentWp ? `${parentWp.type} · ${parentWp.status}` : undefined}
                      onPress={() => selectTicket(ticket.parentId!)}
                    />
                  </List>
                </Stack>
              ) : null}
              <Stack gap="xs">
                {SectionTitle(tr('detail.children', { count: children.length }))}
                {children.length > 0 ? (
                  <List label={tr('detail.children', { count: children.length })}>
                    {children.map((child) => (
                      <ListItem
                        key={String(child.id)}
                        title={`↳ #${child.id} ${child.subject}`}
                        description={[child.type, child.status, personOrDash(child.assignee)].join(' · ')}
                        onPress={() => selectTicket(child.id)}
                      />
                    ))}
                  </List>
                ) : (
                  <Text size="xs" muted>
                    {tr('detail.noChildren')}
                  </Text>
                )}
              </Stack>
            </Stack>
          </Tab>
        </Tabs>
      </Stack>
    </Box>
  )
}
