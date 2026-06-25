# Mocka MCP Server

**Let AI agents build and drive your mock server through natural language.**

[한국어](README.ko.md) · [← Back to README](../../README.md) · [Usage Guide](../usage/README.md)

---

## Overview

Mocka ships with a built-in [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) server. Once registered with an AI client, agents like **Claude Code**, **Codex CLI**, and **Gemini CLI** can read your project's API calls and create matching mock endpoints, configure response sequences, manage collections, seed datasets — all through conversation, with no manual UI work.

The MCP server exposes **42 tools** that map 1:1 to Mocka's admin REST API, so anything you can do in the web UI, an agent can do through MCP — under the exact same matching, precedence, and resolution rules.

> Example prompt:
> *"Set up mocks for my auth API — the first `/login` call returns 401, retrying returns 200. Then add a `/users/:id` endpoint backed by a shared dataset."*

---

## How it works

```
┌──────────────┐   stdio    ┌──────────────────┐   HTTP    ┌─────────────────┐
│  AI Client   │  (MCP)     │  mocka mcp       │  REST     │  Mocka Admin    │
│ Claude/Codex │ ─────────► │  (stdio server)  │ ────────► │  API  :4649     │
│ /Gemini      │            │                  │           │  (mocka start)  │
└──────────────┘            └──────────────────┘           └─────────────────┘
```

- **Transport:** stdio. `mocka mcp` launches an MCP server (named `mocka`) built on `@modelcontextprotocol/sdk` using `StdioServerTransport`.
- **Data path:** the MCP process holds **no data of its own**. Every tool call is an HTTP request to the Mocka **Admin API** (default `http://localhost:4649`). At launch it reads the saved `admin_port` from settings once (to discover the port), then talks purely over HTTP.
- **It does not auto-start Mocka.** The `mocka mcp` process and the `mocka start` server are separate. Tools only work while the admin server is running.

> [!IMPORTANT]
> **You must run `mocka start` for the tools to work.** If the admin server is unreachable, every tool fails with:
> "Mocka server is not reachable at http://localhost:4649. Run `mocka start` first."

### Targeting a custom port

If you changed the admin port (`mocka config admin_port=5000`), the MCP server discovers it automatically from settings. To override explicitly, set an env var before launch:

- `MOCKA_ADMIN_URL=http://localhost:5000` — full base URL, or
- `ADMIN_PORT=5000` — port only (host defaults to `localhost`)

---

## Prerequisites

1. **Mocka installed** (`brew install mocka`) and started (`mocka start` or `mocka start -d`).
2. **An AI client CLI** on your `PATH`:
   - Claude Code — `claude`
   - Codex CLI — `codex` (`npm install -g @openai/codex`)
   - Gemini CLI — no binary needed (Mocka writes the config file directly)

---

## Installation

### Interactive (recommended)

```bash
mocka mcp install
```

This walks you through picking a client (and scope, for Claude Code) and registers Mocka for you. To remove it later:

```bash
mocka mcp uninstall
```

### Manual setup

<details open>
<summary><b>Claude Code</b></summary>

```bash
# User scope (available in all projects) — default
claude mcp add mocka -- mocka mcp

# Project scope (current directory only)
claude mcp add --scope project mocka -- mocka mcp
```

Claude Code owns the config file; Mocka just shells out to `claude mcp add`.
</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
codex mcp add mocka -- mocka mcp
```

Requires the `codex` binary on your `PATH`. Scope follows the `codex` default (the installer does not pass a scope flag).
</details>

<details>
<summary><b>Gemini CLI</b></summary>

Gemini has no `mcp add` command, so Mocka writes the config directly. Add this block to `~/.gemini/settings.json` (Mocka's installer does the merge for you, preserving existing keys):

```json
{
  "mcpServers": {
    "mocka": {
      "command": "mocka",
      "args": ["mcp"]
    }
  }
}
```

**User scope only** — Gemini does not support project scope here.
</details>

### Verify

After registering, start Mocka and ask your agent to call `get_server_status` (or, in Claude Code, run `claude mcp list` and confirm `mocka` is listed). A healthy response reports `running: true`, the mock port, and your local network IP.

---

## Tool reference (42 tools)

All tools are exposed as `mcp__mocka__<name>`. IDs referenced below are returned by the corresponding `list_*` / `get_*` / `create_*` tools.

### Endpoints (6)

| Tool | Description | Key params |
|------|-------------|------------|
| `list_endpoints` | List all endpoints with their variants | — |
| `get_endpoint` | Get one endpoint (variants + match rules) | `id` |
| `create_endpoint` | Create an endpoint; a default 200 variant is auto-created | `method`, `path`, `name?`, `collectionId?` |
| `update_endpoint` | Update method/path/name/`sequenceMode`/`isEnabled` | `id`, …optional |
| `delete_endpoint` | Delete an endpoint and all its variants | `id` |
| `toggle_endpoint` | Flip enabled/disabled (disabled → 404) | `id` |

> `method` ∈ `GET｜POST｜PUT｜DELETE｜PATCH`. `sequenceMode` ∈ `off｜on` (`on` uses the active preset).

### Response Variants (4)

| Tool | Description | Key params |
|------|-------------|------------|
| `add_variant` | Add a variant (standard, or to a preset via `presetId`) | `endpointId?`, `presetId?`, `statusCode?`, `description?` |
| `update_variant` | Update body, headers, delay, memo, match rules, dataset binding, preset link | `id`, …optional |
| `delete_variant` | Delete a variant | `id` |
| `set_active_variant` | Set the default variant (used in standard mode when no rule matches) | `endpointId`, `variantId` (nullable) |

> `update_variant.body` supports template helpers (`{{$body 'field'}}`, …) and the `{{$dataset}}` token. `matchRules` and `datasetBinding` are objects — see the [Usage Guide](../usage/README.md) for their shapes.

### Sequences & Presets (8)

| Tool | Description | Key params |
|------|-------------|------------|
| `list_presets` | List sequence presets for an endpoint | `endpointId` |
| `create_preset` | Create a preset (first one is auto-activated) | `endpointId`, `name?`, `mode?` |
| `update_preset` | Rename / change mode | `presetId`, `name?`, `mode?` |
| `delete_preset` | Delete a preset and its variants | `presetId` |
| `set_active_preset` | Activate a preset for an endpoint | `endpointId`, `presetId` |
| `get_sequence_state` | Current index, mode, active preset | `endpointId` |
| `reset_sequence` | Reset the counter back to the first variant | `endpointId`, `presetId?` |
| `reset_all_sequences` | Reset every endpoint's counter | — |

> `mode` ∈ `sequential` (clamp on the last variant) ｜ `loop` (wrap around).

### Environments (5)

| Tool | Description | Key params |
|------|-------------|------------|
| `list_environments` | List environments and their variables | — |
| `create_environment` | Create an environment (first is auto-activated) | `name` |
| `update_environment` | Rename / set variables (`{{varName}}` in bodies) | `id`, `name?`, `variables?` |
| `delete_environment` | Delete an environment | `id` |
| `set_active_environment` | Activate one, or `null` to deactivate all | `id` (nullable) |

### Collections (8)

| Tool | Description | Key params |
|------|-------------|------------|
| `list_collections` | List collections and their endpoint IDs | — |
| `create_collection` | Create a collection | `name` |
| `update_collection` | Rename a collection | `id`, `name` |
| `delete_collection` | Delete a collection (endpoints are kept, just ungrouped) | `id` |
| `reorder_collections` | Reorder by full ordered ID list | `orderedIds` |
| `reorder_collection_endpoints` | Reorder endpoints inside a collection | `collectionId`, `orderedEndpointIds` |
| `move_endpoint` | Move an endpoint between collections | `endpointId`, `fromCollectionId`, `toCollectionId`, `sortOrder?` |
| `remove_endpoint_from_collection` | Ungroup without deleting | `collectionId`, `endpointId` |

### Datasets (5)

| Tool | Description | Key params |
|------|-------------|------------|
| `list_datasets` | List shared datasets (id, name, keyField, records) | — |
| `get_dataset` | Get one dataset with all records | `id` |
| `create_dataset` | Create a shared dataset | `name`, `keyField`, `records?` |
| `update_dataset` | Update name/keyField/records (records fully replaces) | `id`, …optional |
| `delete_dataset` | Delete a dataset | `id` |

### Import / Export (2)

| Tool | Description | Key params |
|------|-------------|------------|
| `export_data` | Export endpoints + collections as JSON (optionally filtered) | `collectionIds?` |
| `import_data` | Import an exported JSON with a conflict policy | `data`, `conflictPolicy?` |

> `conflictPolicy` ∈ `overwrite｜skip｜merge` (default `skip`). Datasets, dataset bindings, environments, and history are **not** included in export/import.

### History (2)

| Tool | Description | Key params |
|------|-------------|------------|
| `get_history` | Recent request log (method, path, status, timestamps) | `method?`, `search?`, `limit?`, `offset?` |
| `clear_history` | Clear all request history | — |

### Server (2)

| Tool | Description | Key params |
|------|-------------|------------|
| `get_server_status` | Running state, current mock port, local IP | — |
| `restart_server` | Restart the mock listener (after a port change) | — |

---

## Example agent workflows

These are natural-language prompts and the tool sequence an agent typically runs.

**1. "Mock my login flow: first call 401, then 200."**
```
create_endpoint(POST /api/login)
create_preset(endpointId, name="Token Expired Flow", mode="sequential")
add_variant(presetId, statusCode=401, description="Unauthorized")
add_variant(presetId, statusCode=200, description="OK")
update_endpoint(id, sequenceMode="on")        # activate sequence mode
```

**2. "Build a users list + detail from one dataset."**
```
create_dataset(name="users", keyField="id", records=[…])
create_endpoint(GET /api/users)        → add_variant + update_variant(datasetBinding {mode:"list"})
create_endpoint(GET /api/users/:id)    → add_variant + update_variant(datasetBinding {mode:"detail", keySource:{from:"path", field:"id"}})
```

**3. "Show me what my app has been hitting."**
```
get_history(limit=50)                  # inspect recent requests, statuses, resolved bodies
```

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `Mocka server is not reachable …` | The admin server isn't running. Run `mocka start` (or `mocka start -d`). |
| Tools target the wrong port | Set `MOCKA_ADMIN_URL` or `ADMIN_PORT`, or fix `mocka config admin_port=…`. |
| `Claude Code CLI not found` | Install Claude Code and ensure `claude` is on your `PATH`. |
| `Codex CLI not found` | `npm install -g @openai/codex`. |
| Agent doesn't see the tools | Re-run `mocka mcp install`, then restart the AI client so it reloads MCP servers. |
| Changed the mock port, requests still 404 | Call `restart_server` (or `mocka restart`) to rebind the mock listener. |

> Reported MCP server version is `1.0.0` (independent of the Mocka release version).

---

## See also

- [Usage Guide](../usage/README.md) — concepts, matching rules, templates, and the full response-resolution order the tools operate under.
- [Main README](../../README.md) — install, CLI commands, architecture.
