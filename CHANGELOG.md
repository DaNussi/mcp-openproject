# Changelog

All notable changes to **OpenProject MCP for Orca (`mcp-openproject`)** will be documented in this file.

## [0.2.0] - 2026-11-26 (fork: DaNussi/mcp-openproject)

### Changed
- **Sidebar rebuilt as an HTML panel**: OpenProject-style work package table (ID, Type, Status, Subject, Assignee) in OpenProject's own type and status colors, sortable headers, parent/child indentation, saved views, project filter, search and a filter drawer. Follows Orca's light/dark theme.
- **Stacked and Popover layouts**: table above the selected work package with a drag bar, or the work package in its own tab with **← Back to list**.
- **Read-only ticket view**: status, assignee and accountable are shown, not edited; commenting is the only write. Header shows type, #ID (opens OpenProject), project, parent, status, priority and last update.
- **People and Dates**: watchers and last activity next to assignee/accountable; start → finish, % done, estimate, version and created date.
- **Create workspace** is the main action and defaults to a new worktree.

### Added
- Full activity journal (comments and field changes) with resolved user names, loaded when a work package opens.
- Loading state while a workspace is created; plugin icon (work package + branch) for the plugin, sidebar button and status bar.

### Fixed
- **Create workspace now goes through Orca's plugin API** (`workspace.create`, `agent.launch`) instead of the `orca` CLI, whose errors were swallowed into "Failed to launch …". Orca's real error is shown.
- Launch used the stored default agent (e.g. an uninstalled `codex`) instead of the agent shown in the dropdown.
- Parallel launches for one ticket raced on the repository's git config; the panel locks its form and the worker refuses a second launch while one runs.
- Worker test no longer fires the removed `agent.launch.before` hook.

### Requirements
- Orca **1.4.274** or newer. New capabilities `workspace:create` and `workspace:write` need approval.

## [0.1.4] - 2026-04-11

### Security
- **Prompt Delimiter Hardening**: Escape look-alike `<untrusted_ticket_data>` and `</untrusted_ticket_data>` tags inside ticket subjects, subtasks, and descriptions in `buildAgentTicketPrompt` so untrusted issue content cannot break out of its delimiter block.
- **Hidden Field Query Protection**: Refuse `list_work_packages`, `search_work_packages`, and `list_my_open_work_packages` filter parameters (`status`, `open_only`, `type`, `priority`, `assignee`, `assignee_me`, `query`) when the target field is hidden via `OPENPROJECT_HIDE_WORK_PACKAGE_FIELDS`.
- **Credential Redaction in Debug Output**: Implement custom `fmt::Debug` for `OpenProjectConfig` so `api_token` is always formatted as `"[REDACTED]"`.

### Changed
- **Cleaner Bilingual UI (`en` / `vi`) & Docs**: Natural Vietnamese developer terminology in `vi.ts`, streamlined form placeholders/tooltips, and complete 17-tool documentation in `README.md`.

## [0.1.3] - 2026-04-11

### Added
- **Orca-Native Worktree & Agent Launch Drawer**:
  - Top-level mode switch between **Existing Workspace** (all open worktrees/branches) and **New Worktree** (deduplicated Repository selector + editable `op-<id>-<slug>` branch name).
  - Dynamic **Agent CLI** selector populated from locally detected agent binaries (`antigravity`/`agy`, `codex`, `claude`, `gemini`, `cursor-agent`, `opencode`, etc.).
- **Native Scroll-Anchoring Auto-Scroll**: Smoothly scroll to parent/child work packages without reordering the task list, and expand the subtask scrollable container height.

### Changed
- **Subtask Navigation**: Keep subtasks inside a bounded scrollable container and swap parent/child slots in-place when navigating task hierarchies.
- **Cleaner Bilingual UI Labels (`en` / `vi`)**: Removed redundant parenthetical explanations from form labels and dropdown options.

### Fixed
- **Zero Orphan Terminal Sessions on Agent Launch**:
  - Added Windows (`%LOCALAPPDATA%\Programs\orca\resources\bin\orca.exe`) and macOS (`/Applications/Orca.app/Contents/Resources/bin/orca`) CLI resolution in `resolveOrcaCliPath()`.
  - Resolved repository ID (`id:<repoId>`) when creating worktrees so creating a new worktree from a child worktree never fails or falls back to an unfocused session.
  - Automatically reuse and focus existing `op-<id>-<slug>` worktrees if already created.
- **Filter Bar Stability**: Keep `TicketFilters` mounted during scroll pulse animations and reset sibling `<Select>` portals cleanly.

## [0.1.2] - 2026-04-11

### Changed
- Streamlined Orca worker agent launch integration using the Orca host API.

## [0.1.1] - 2026-04-11

### Added
- **Parent/Child Task Navigation**: Auto-focus parent and child work packages in the ticket list and support smart worktree agent launch matching.

### Fixed
- **IPC Payload Cap**: Keep `OpenProjectStateSnapshot` under Orca's 256 KiB IPC limit and fix project filter reset behavior.

## [0.1.0] - 2026-04-10

### Added
- Initial release of **OpenProject MCP for Orca** (`IvanHa-dev/mcp-openproject`).
- **Orca Sidebar Plugin (`ui: "components"`)**: Browse projects and work packages, filter by project/status/priority/keyword, inspect ticket details and activity comments, and create/update work packages with Guarded 2-Step Writes (`Preview -> Confirm`).
- **Automatic Agent Environment Hook (`agent.launch.before`)**: Inject `OPENPROJECT_BASE_URL`, `OPENPROJECT_API_TOKEN`, `OPENPROJECT_READ_PROJECTS`, and `OPENPROJECT_WRITE_PROJECTS` automatically when Orca starts an agent CLI.
- **One-Click Global MCP Registration**: Register the OpenProject MCP server in `~/.claude.json`, `~/.codex/config.toml`, or `~/.gemini/config/mcp_config.json`.
- **Rust Stdio MCP Server (`mcp-openproject`)**: 17 MCP tools for OpenProject Community Edition (CE) with context-frugal HAL compaction, fail-closed project allowlists, and `lockVersion` optimistic concurrency.
