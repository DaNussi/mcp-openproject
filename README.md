# OpenProject MCP for Orca (`mcp-openproject`)

A hybrid **Orca Sidebar Plugin + Rust MCP Server** for **OpenProject Community Edition (CE)**.

> **Fork note:** this is [DaNussi/mcp-openproject](https://github.com/DaNussi/mcp-openproject), a fork of [IvanHa-dev/mcp-openproject](https://github.com/IvanHa-dev/mcp-openproject). The fork rebuilds the sidebar as a read-only work package viewer whose main job is turning a work package into an Orca workspace; see [CHANGELOG.md](CHANGELOG.md) (0.2.0). The Rust MCP server is unchanged.

OpenProject's official built-in MCP server requires a paid Enterprise plan. This project connects coding agents and Orca directly to any self-hosted **OpenProject Community Edition (CE)** instance for free using standard OpenProject API v3 tokens.

---

## Architecture & Key Features

### 1. Orca Sidebar Plugin ([`orca-plugin.json`](orca-plugin.json), [`src/ui/`](src/ui), [`src/worker.ts`](src/worker.ts))
- **Work package viewer (HTML panel)**: An OpenProject-style table (ID, Type, Status, Subject, Assignee) in OpenProject's own type and status colors, with saved views (*All open*, *Assigned to me*, *Closed*), project filter, search, a filter drawer (status, priority, sort, page size), sortable column headers and parent/child indentation. Follows Orca's light and dark theme.
- **Two layouts**: **Stacked** puts the table on top and the selected work package below, with a drag bar between them; **Popover** opens a work package in its own tab next to *Tickets*, with **← Back to list**.
- **Read-only ticket view**: Type, #ID (opens the work package in OpenProject), project and parent; status, priority and last update; **People** (assignee, accountable, watchers, last activity) next to **Dates** (start → finish, % done, estimate, version, created); the description; the full activity journal (comments and field changes); and parent/child relations. Commenting is the only write.
- **Create workspace**: One click turns a work package into an Orca workspace. By default Orca creates a new worktree (branch `op-<id>-<slug>`) in the matching repository and starts the chosen agent there with the ticket as its prompt; an existing worktree for that branch is reused. You can also start the agent in an existing workspace. This goes through Orca's plugin API (`workspace.create`, `agent.launch`), so Orca's own errors are shown.
- **1-Click Global MCP Registration**: Configure your OpenProject `Base URL` and `API Token` once in the **Setup** tab, then click **Register MCP** to write the MCP server config and `OPENPROJECT_*` environment variables directly to your agent's global config file (`~/.claude.json`, `~/.codex/config.toml`, or `~/.gemini/config/mcp_config.json`).
- **Create work packages**: The **New Task** tab creates work packages and subtasks (guarded by the write allowlist).
- **Bilingual UI (`EN` / `VI`)**: Switch between English and natural Vietnamese developer terminology from the header bar.

### 2. Rust Stdio MCP Server ([`Cargo.toml`](Cargo.toml), [`rust/main.rs`](rust/main.rs), [`rust/tools.rs`](rust/tools.rs))
- **Fast Single-Binary Server**: Model Context Protocol (`JSON-RPC 2.0` over stdio) server written in Rust.
- **Context-Frugal HAL Compaction**: Supports `select` field projection to minimize LLM token usage.
- **Defense-in-Depth Project Allowlists**: Enforces fail-closed `OPENPROJECT_READ_PROJECTS` and `OPENPROJECT_WRITE_PROJECTS` scope checks.
- **Guarded 2-Step Agent Writes (`Preview -> Confirm`)**: All MCP write tools called by AI agents validate against OpenProject `/form` schemas and check `lockVersion` optimistic concurrency (`confirm=false` to preview changes, then `confirm=true` to execute).

---

## Included MCP Tools (17 Tools in Rust Binary)

| Tool | Category | Description |
| :--- | :--- | :--- |
| `get_current_user` | Meta | Verify authentication and inspect the current OpenProject user |
| `list_statuses` | Meta | List workflow statuses (`New`, `In progress`, `Developed`, `Closed`, etc.) |
| `list_types` | Meta | List work package types (`Task`, `Bug`, `Feature`, `Epic`, `Milestone`, etc.) |
| `list_priorities` | Meta | List work package priorities (`Low`, `Normal`, `High`, `Immediate`) |
| `list_projects` | Project Read | List accessible projects filtered by `OPENPROJECT_READ_PROJECTS` |
| `get_project` | Project Read | Get project metadata by identifier, name, or numeric ID |
| `get_project_work_package_context` | Project Read | Inspect project statuses, types, priorities, and write permissions |
| `list_work_packages` | Ticket Read | List work packages by `project`, `status`, `type`, `priority`, `assignee`, `limit`, and `select` |
| `search_work_packages` | Ticket Read | Search work packages by keyword across subject and description |
| `list_my_open_work_packages` | Ticket Read | List open work packages assigned to the authenticated user |
| `get_work_package` | Ticket Read | Fetch full details of a work package by `id` (supports `select`) |
| `get_work_packages` | Ticket Read | Batch-read multiple work packages by numeric `ids` (supports `select`) |
| `get_work_package_activities` | Ticket Read | Fetch comments and activity history for a work package |
| `create_work_package` | Guarded Write | Preview (`confirm=false`) then create (`confirm=true`) a work package |
| `create_subtask` | Guarded Write | Preview (`confirm=false`) then create (`confirm=true`) a child task under `parent_work_package_id` |
| `update_work_package` | Guarded Write | Preview (`confirm=false`) then update (`confirm=true`) status, subject, description, or comment |
| `add_work_package_comment` | Guarded Write | Preview (`confirm=false`) then post (`confirm=true`) a markdown comment |

---

## Quick Start

### Step 1: Install the Rust MCP Binary (`mcp-openproject`)

```bash
# Clone the repository and install the binary into ~/.cargo/bin/mcp-openproject
git clone https://github.com/DaNussi/mcp-openproject.git
cd mcp-openproject
cargo install --path .
```

### Step 2: Configure in the Orca Plugin (Recommended — 1-Click Setup)

1. Install this fork in Orca from Git (Orca 1.4.274 or newer): `orca plugin install https://github.com/DaNussi/mcp-openproject` — or load a local clone with `orca plugin dev load <path>`. Orca asks you to approve the plugin's access first. (The marketplace entry `IvanHa-dev/mcp-openproject` installs the original, not this fork.)
2. Open the **OpenProject** sidebar panel and go to the **Setup** tab.
3. Enter your **Base URL** (e.g. `https://openproject.example.com`) and your OpenProject **API Token** (generated under *OpenProject -> My Account -> Access tokens -> API*).
4. Select your **Default Agent CLI** and click **Save Settings**, then click **Register MCP**.
   - This automatically registers `mcp-openproject` in your agent's global configuration (`~/.claude.json`, `~/.codex/config.toml`, or `~/.gemini/config/mcp_config.json`), including the `OPENPROJECT_*` credentials, so every agent you start (in any worktree) can use the OpenProject MCP tools.
5. Pick a work package and click **Create workspace**.

---

## Manual MCP Configuration (Without Orca or for Other MCP Clients)

If you prefer to configure your coding agent manually:

### Antigravity / Gemini CLI (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "openproject": {
      "command": "mcp-openproject",
      "args": [],
      "env": {
        "OPENPROJECT_BASE_URL": "https://openproject.example.com",
        "OPENPROJECT_API_TOKEN": "opapi-...",
        "OPENPROJECT_READ_PROJECTS": "*",
        "OPENPROJECT_WRITE_PROJECTS": "*"
      }
    }
  }
}
```

### Claude Code (`~/.claude.json`)

```json
{
  "mcpServers": {
    "openproject": {
      "command": "mcp-openproject",
      "env": {
        "OPENPROJECT_BASE_URL": "https://openproject.example.com",
        "OPENPROJECT_API_TOKEN": "opapi-...",
        "OPENPROJECT_READ_PROJECTS": "*",
        "OPENPROJECT_WRITE_PROJECTS": "*"
      }
    }
  }
}
```

### OpenAI Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.openproject]
command = "mcp-openproject"

[mcp_servers.openproject.env]
OPENPROJECT_BASE_URL = "https://openproject.example.com"
OPENPROJECT_API_TOKEN = "opapi-..."
OPENPROJECT_READ_PROJECTS = "*"
OPENPROJECT_WRITE_PROJECTS = "*"
```

---

## Development & Testing

```bash
# Run Rust MCP server unit and mock HTTP integration tests
cargo test

# Validate Orca plugin manifest offline
orca plugin validate . --json

# Validate the plugin and run the worker (the panel is an HTML page; check does not render it)
orca plugin check . --json

# Run the panel view-model, Markdown and worker test suites
orca plugin test . --json

# Screenshot the panel as Orca draws it
orca plugin shot local.openproject --panel openproject --json

# Load or reload in Orca for local development
orca plugin dev reload . --json
```

---

## Acknowledgments & License

Fork of [IvanHa-dev/mcp-openproject](https://github.com/IvanHa-dev/mcp-openproject) (MIT License).
Inspired by [jtauschl/openproject-ce-mcp](https://github.com/jtauschl/openproject-ce-mcp) (MIT License).
Licensed under the [MIT License](LICENSE).
