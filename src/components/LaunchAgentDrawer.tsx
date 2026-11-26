import { Box, Button, Input, read, Row, Select, set, Stack } from 'orca'
import { createTranslator, type UiLocale } from '../i18n'
import {
  formatWorktreeBranchSlug,
  matchBestWorkspaceForTicket
} from '../openproject-api'
import type {
  DetectedAgentCli,
  OpenProjectWorkPackage,
  OpenProjectWorkspaceOption
} from '../protocol'
import {
  configAgentDraftAtom,
  launchAgentForSelectedTicket,
  launchBranchDraftAtom,
  launchCreateWorktreeAtom,
  launchPanelOpenAtom,
  targetWorkspaceIdAtom
} from '../state/panel-state'

export interface LaunchAgentDrawerProps {
  locale: UiLocale
  ticket: OpenProjectWorkPackage
  workspaces: OpenProjectWorkspaceOption[]
  detectedAgents: DetectedAgentCli[]
}

interface RepoGroup {
  key: string
  label: string
  representative: OpenProjectWorkspaceOption
  worktrees: OpenProjectWorkspaceOption[]
  hasFocused: boolean
  matchesProject: boolean
}

const FALLBACK_AGENT_OPTIONS = [
  { value: 'antigravity', label: 'Antigravity (agy)' },
  { value: 'codex', label: 'OpenAI Codex (codex)' },
  { value: 'claude', label: 'Claude Code (claude)' },
  { value: 'gemini', label: 'Gemini CLI (gemini)' },
  { value: 'cursor-agent', label: 'Cursor Agent (cursor-agent)' },
  { value: 'opencode', label: 'OpenCode (opencode)' }
]

function getRepoKey(ws: OpenProjectWorkspaceOption): string {
  return (ws.repoName || ws.repoId || ws.name).toLowerCase()
}

/** Orca-specific: pick repository/worktree + agent CLI and start work on the ticket. */
export function LaunchAgentDrawer({
  locale,
  ticket,
  workspaces,
  detectedAgents
}: LaunchAgentDrawerProps) {
  const tr = createTranslator(locale)
  const branchSlug = formatWorktreeBranchSlug(ticket.id, ticket.subject)

  const bestMatchedWs = matchBestWorkspaceForTicket(ticket, workspaces)
  const selectedWsId =
    read(targetWorkspaceIdAtom) || bestMatchedWs?.id || workspaces[0]?.id || ''
  const selectedWsObj =
    workspaces.find((w) => w.id === selectedWsId) ?? bestMatchedWs
  const selectedWsLabel =
    selectedWsObj?.repoName &&
    selectedWsObj?.name &&
    selectedWsObj.name !== selectedWsObj.repoName
      ? `${selectedWsObj.repoName}/${selectedWsObj.name}`
      : selectedWsObj?.repoName || selectedWsObj?.name || 'default'

  const createWorktree = read(launchCreateWorktreeAtom)
  const branchDraft = read(launchBranchDraftAtom) || branchSlug
  const selectedAgent = read(configAgentDraftAtom) || 'codex'

  const projTokens = `${ticket.projectIdentifier} ${ticket.project}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && t !== 'project')

  const groupMap = new Map<string, RepoGroup>()
  for (const ws of workspaces) {
    const key = getRepoKey(ws)
    const existing = groupMap.get(key)
    if (!existing) {
      groupMap.set(key, {
        key,
        label: ws.repoName || ws.name,
        representative: ws,
        worktrees: [ws],
        hasFocused: Boolean(ws.isFocused),
        matchesProject: projTokens.some((tok) => key.includes(tok))
      })
    } else {
      existing.worktrees.push(ws)
      if (ws.isFocused) existing.hasFocused = true
      if (ws.isMainWorktree && !existing.representative.isMainWorktree) {
        existing.representative = ws
      }
    }
  }
  const repoGroups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.matchesProject !== b.matchesProject) return a.matchesProject ? -1 : 1
    if (a.hasFocused !== b.hasFocused) return a.hasFocused ? -1 : 1
    return a.label.localeCompare(b.label)
  })

  const activeRepoGroup =
    (selectedWsObj
      ? repoGroups.find((g) => g.key === getRepoKey(selectedWsObj))
      : undefined) ?? repoGroups[0]

  const repoSelectOptions =
    repoGroups.length > 0
      ? repoGroups.map((g) => ({
          value: g.representative.id,
          label: `${g.label}${g.hasFocused ? ' ★' : ''}`
        }))
      : [{ value: selectedWsId || 'default-workspace', label: selectedWsLabel }]

  const selectedRepoRepId =
    activeRepoGroup?.representative.id ||
    repoSelectOptions[0]?.value ||
    selectedWsId

  const worktreeOptionsForRepo =
    activeRepoGroup && activeRepoGroup.worktrees.length > 0
      ? activeRepoGroup.worktrees.map((ws) => {
          const wtName = ws.name || ws.branch || ws.repoName || ws.id
          const branchInfo =
            ws.branch && ws.branch !== wtName ? ` (${ws.branch})` : ''
          const mainTag = ws.isMainWorktree ? ' [main]' : ''
          const activeTag = ws.isFocused ? ' ★' : ''
          return {
            value: ws.id,
            label: `${wtName}${branchInfo}${mainTag}${activeTag}`
          }
        })
      : [{ value: selectedWsId || 'default-workspace', label: selectedWsLabel }]

  const effectiveSelectedWsId = worktreeOptionsForRepo.some(
    (o) => o.value === selectedWsId
  )
    ? selectedWsId
    : (activeRepoGroup
        ? matchBestWorkspaceForTicket(ticket, activeRepoGroup.worktrees)?.id
        : undefined) ||
      worktreeOptionsForRepo[0]?.value ||
      selectedWsId

  const installedAgents = detectedAgents.filter((a) => a.installed)
  const agentSource = installedAgents.length > 0 ? installedAgents : detectedAgents
  const agentOptions =
    agentSource.length > 0
      ? agentSource.map((a) => ({
          value: a.id,
          label: a.installed ? a.label : `${a.label}${tr('agent.notDetectedSuffix')}`
        }))
      : FALLBACK_AGENT_OPTIONS

  return (
    <Box border="accent" background="card" radius="sm" padding="sm">
      <Stack gap="xs">
        <Row gap="xs" align="center" wrap>
          <Button
            size="xs"
            tone={!createWorktree ? 'accent' : undefined}
            variant={!createWorktree ? 'solid' : 'outline'}
            onPress={() => set(launchCreateWorktreeAtom, false)}
          >
            {tr('ticket.launchModeExisting')}
          </Button>
          <Button
            size="xs"
            tone={createWorktree ? 'accent' : undefined}
            variant={createWorktree ? 'solid' : 'outline'}
            onPress={() => set(launchCreateWorktreeAtom, true)}
          >
            {tr('ticket.launchModeWorktree')}
          </Button>
        </Row>
        <Select
          label={tr('ticket.targetRepoLabel')}
          value={selectedRepoRepId}
          options={repoSelectOptions}
          onChange={(repId) => {
            const nextGroup = repoGroups.find((g) => g.representative.id === repId)
            if (nextGroup) {
              const bestInRepo =
                matchBestWorkspaceForTicket(ticket, nextGroup.worktrees) ??
                nextGroup.representative
              set(targetWorkspaceIdAtom, bestInRepo.id)
            } else {
              set(targetWorkspaceIdAtom, repId)
            }
          }}
        />
        {createWorktree ? (
          <Input
            label={tr('ticket.worktreeBranchLabel')}
            value={branchDraft}
            onChange={(val) => set(launchBranchDraftAtom, val)}
          />
        ) : (
          <Select
            label={tr('ticket.targetWorkspaceLabel')}
            value={effectiveSelectedWsId}
            options={worktreeOptionsForRepo}
            onChange={(v) => set(targetWorkspaceIdAtom, v)}
          />
        )}
        <Select
          label={tr('ticket.launchAgentSelectLabel')}
          value={selectedAgent}
          options={agentOptions}
          onChange={(v) => set(configAgentDraftAtom, v)}
        />
        <Row gap="xs" align="center">
          <Button
            size="xs"
            tone="accent"
            icon="play"
            onPress={() => {
              if (effectiveSelectedWsId !== selectedWsId) {
                set(targetWorkspaceIdAtom, effectiveSelectedWsId)
              }
              void launchAgentForSelectedTicket(ticket.id)
            }}
          >
            {createWorktree
              ? tr('ticket.createAndStartButton')
              : tr('ticket.startAgentButton')}
          </Button>
          <Button
            size="xs"
            variant="outline"
            onPress={() => set(launchPanelOpenAtom, false)}
          >
            {tr('ticket.cancelLaunchButton')}
          </Button>
        </Row>
      </Stack>
    </Box>
  )
}
