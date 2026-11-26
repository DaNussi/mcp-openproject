import {
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
  Select,
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
  OpenProjectPrincipalItem,
  OpenProjectWorkPackage,
  OpenProjectWorkspaceOption
} from '../protocol'
import {
  commentDraftAtom,
  detailTabAtom,
  launchPanelOpenAtom,
  nextAssigneeDraftAtom,
  nextResponsibleDraftAtom,
  nextStatusDraftAtom,
  postTicketComment,
  saveTicketChanges,
  selectTicket,
  startCreatingSubtask,
  ticketDetailExpandedAtom
} from '../state/panel-state'
import {
  formatShortDate,
  getPriorityToneStyle,
  getStatusToneStyle,
  getTypeToneStyle,
  resolvePrincipalIdString
} from '../utils/openproject-tones'
import { workPackageUrl } from '../utils/work-package-table'
import { LaunchAgentDrawer } from './LaunchAgentDrawer'

export interface TicketDetailViewProps {
  locale: UiLocale
  ticket: OpenProjectWorkPackage
  baseUrl: string
  allWorkPackages: OpenProjectWorkPackage[]
  canCreateSubtask?: boolean
  activities: OpenProjectActivity[]
  principals: OpenProjectPrincipalItem[]
  statusTransitionOptions: Array<{ value: string; label: string; color?: string }>
  memberOptions: Array<{ value: string; label: string }>
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

function sameName(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim()
}

/** OpenProject's split-screen work package view: header, status, Overview / Activity / Relations. */
export function TicketDetailView({
  locale,
  ticket,
  baseUrl,
  allWorkPackages,
  canCreateSubtask,
  activities,
  principals,
  statusTransitionOptions,
  memberOptions,
  workspaces = [],
  detectedAgents = []
}: TicketDetailViewProps) {
  const tr = createTranslator(locale)
  const detailTab = read(detailTabAtom)
  const launchPanelOpen = read(launchPanelOpenAtom)
  const statusDraft = read(nextStatusDraftAtom) || ticket.status
  const assigneeDraft = read(nextAssigneeDraftAtom) || '0'
  const responsibleDraft = read(nextResponsibleDraftAtom) || '0'
  const commentDraft = read(commentDraftAtom)

  const currentAssignee = resolvePrincipalIdString(
    ticket.assigneeId,
    ticket.assignee,
    principals
  )
  const currentResponsible = resolvePrincipalIdString(
    ticket.responsibleId,
    ticket.responsible,
    principals
  )
  const isDirty =
    !sameName(statusDraft, ticket.status) ||
    assigneeDraft !== currentAssignee ||
    responsibleDraft !== currentResponsible

  const ticketMemberOptions = [...memberOptions]
  if (
    ticket.assigneeId &&
    !ticketMemberOptions.some((o) => o.value === String(ticket.assigneeId))
  ) {
    ticketMemberOptions.push({ value: String(ticket.assigneeId), label: ticket.assignee })
  }
  if (
    ticket.responsibleId &&
    !ticketMemberOptions.some((o) => o.value === String(ticket.responsibleId))
  ) {
    ticketMemberOptions.push({
      value: String(ticket.responsibleId),
      label: ticket.responsible || `User #${ticket.responsibleId}`
    })
  }

  const statusOptions = statusTransitionOptions.some((o) =>
    sameName(o.value, statusDraft)
  )
    ? statusTransitionOptions
    : [{ value: statusDraft, label: statusDraft }, ...statusTransitionOptions]
  const statusSelectValue =
    statusOptions.find((o) => sameName(o.value, statusDraft))?.value ?? statusDraft

  const typeStyle = getTypeToneStyle(ticket.type, ticket.typeColor)
  const statusStyle = getStatusToneStyle(ticket.status, ticket.statusColor)
  const prioStyle = getPriorityToneStyle(ticket.priority, ticket.priorityColor)
  const externalUrl = workPackageUrl(baseUrl, ticket.id)

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
    <Box border="neutral" background="card" radius="md" padding="sm">
      <Stack gap="sm">
        <Row justify="between" align="center" gap="xs">
          <Row gap="xs" align="center">
            <Text size="xs" weight="semibold" tone={typeStyle.textTone}>
              {(ticket.type || 'Task').toUpperCase()}
            </Text>
            <Text size="xs" muted>
              #{ticket.id}
            </Text>
          </Row>
          <Row gap="xs" align="center">
            {externalUrl ? (
              <IconButton
                size="xs"
                variant="ghost"
                icon="open-external"
                label={tr('detail.openInOpenProject')}
                tooltip={tr('detail.openInOpenProject')}
                onPress={() => {
                  void shell.openExternal(externalUrl)
                }}
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
        </Row>

        {ticket.parentId ? (
          <Text size="xs" muted>
            {'↑ '}
            <Link onPress={() => selectTicket(ticket.parentId!)}>
              {parentSubject
                ? `#${ticket.parentId} ${parentSubject}`
                : `#${ticket.parentId}`}
            </Link>
          </Text>
        ) : null}

        <Heading level={2}>{ticket.subject}</Heading>

        <Row gap="xs" align="end" wrap>
          <Box minWidth={150}>
            <Select
              label={tr('detail.statusLabel')}
              labelHidden
              value={statusSelectValue}
              options={statusOptions.map((o) => ({ value: o.value, label: o.label }))}
              onChange={(val) => set(nextStatusDraftAtom, val)}
            />
          </Box>
          <Button
            size="sm"
            icon="agent"
            tone="accent"
            variant={launchPanelOpen ? 'solid' : 'outline'}
            onPress={() => set(launchPanelOpenAtom, !launchPanelOpen)}
          >
            {tr('ticket.launchAgent')}
          </Button>
        </Row>

        {ticket.updatedAt ? (
          <Text size="xs" muted>
            {tr('detail.updatedOn', { date: formatShortDate(ticket.updatedAt) })}
          </Text>
        ) : null}

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
                  <Box maxHeight={240} scroll="y" padding="xs">
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
                <Box columns={2} gap="xs">
                  <Select
                    label={tr('ticket.assignee')}
                    value={assigneeDraft}
                    options={ticketMemberOptions}
                    onChange={(val) => set(nextAssigneeDraftAtom, val)}
                  />
                  <Select
                    label={tr('ticket.responsible')}
                    value={responsibleDraft}
                    options={ticketMemberOptions}
                    onChange={(val) => set(nextResponsibleDraftAtom, val)}
                  />
                </Box>
              </Stack>

              <Stack gap="xs">
                {SectionTitle(tr('detail.sectionDetails'))}
                <KeyValue
                  label={tr('detail.sectionDetails')}
                  items={[
                    { label: tr('detail.type'), value: ticket.type, tone: typeStyle.textTone },
                    { label: tr('detail.status'), value: ticket.status, tone: statusStyle.textTone },
                    { label: tr('detail.priority'), value: ticket.priority, tone: prioStyle.textTone },
                    { label: tr('detail.project'), value: ticket.project },
                    {
                      label: tr('detail.updated'),
                      value: ticket.updatedAt ? formatShortDate(ticket.updatedAt) : '—'
                    }
                  ]}
                />
              </Stack>

              <Row gap="xs" align="center">
                <Button
                  size="xs"
                  tone="accent"
                  icon="check"
                  disabled={!isDirty}
                  onPress={() => saveTicketChanges(ticket.id)}
                >
                  {tr('detail.save')}
                </Button>
                {isDirty ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onPress={() => {
                      set(nextStatusDraftAtom, ticket.status)
                      set(nextAssigneeDraftAtom, currentAssignee)
                      set(nextResponsibleDraftAtom, currentResponsible)
                    }}
                  >
                    {tr('detail.discard')}
                  </Button>
                ) : null}
              </Row>
            </Stack>
          </Tab>

          <Tab
            value="activity"
            label={tr('detail.tabActivity', { count: activities.length })}
          >
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
                    <Box
                      key={String(act.id)}
                      border="neutral"
                      radius="sm"
                      padding="xs"
                    >
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

          <Tab
            value="relations"
            label={tr('detail.tabRelations', { count: relationCount })}
          >
            <Stack gap="sm">
              {ticket.parentId ? (
                <Stack gap="xs">
                  {SectionTitle(tr('detail.parent'))}
                  <List label={tr('detail.parent')}>
                    <ListItem
                      key={`parent-${ticket.parentId}`}
                      icon="layers"
                      title={`#${ticket.parentId} ${parentSubject}`.trim()}
                      description={
                        parentWp ? `${parentWp.type} · ${parentWp.status}` : undefined
                      }
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
                        description={[
                          child.type,
                          child.status,
                          child.assignee && child.assignee !== 'Unassigned'
                            ? child.assignee
                            : tr('filters.unassigned')
                        ].join(' · ')}
                        onPress={() => selectTicket(child.id)}
                      />
                    ))}
                  </List>
                ) : (
                  <Text size="xs" muted>
                    {tr('detail.noChildren')}
                  </Text>
                )}
                {canCreateSubtask ? (
                  <Row>
                    <Button
                      size="xs"
                      variant="outline"
                      icon="add"
                      onPress={() =>
                        startCreatingSubtask(ticket.projectIdentifier, ticket.id)
                      }
                    >
                      {tr('ticket.addSubtask')}
                    </Button>
                  </Row>
                ) : null}
              </Stack>
            </Stack>
          </Tab>
        </Tabs>
      </Stack>
    </Box>
  )
}
