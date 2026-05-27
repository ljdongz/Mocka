<div align="center">

# Mocka

**AI-powered local mock server — describe your API, get a working mock**

[한국어](docs/README.ko.md)

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Mocka Screenshot](docs/screenshot.png)

</div>

## Introduction

Mocka is a local mock server that AI agents can set up for you. Connect it to your coding assistant via [MCP](https://modelcontextprotocol.io/), and the AI reads your project's API calls and builds matching mock endpoints automatically — no manual configuration needed.

You can also use the web UI to create and manage endpoints by hand. Either way, Mocka runs entirely on your machine with no cloud dependency, and real devices on the same network can call the mock API directly.

```
┌──────────────────────────────────────────────────┐
│  "Set up mocks for my auth API —                 │
│   first call returns 401, retry returns 200"     │
└──────────────────┬───────────────────────────────┘
                   │ MCP
                   ▼
            ┌─────────────┐        ┌──────────────┐
            │  Mocka       │        │  Your App    │
            │  Mock Server │◄───────│  (iOS, Web,  │
            │  :4650       │  HTTP  │   Android)   │
            └─────────────┘        └──────────────┘
```

## Features

### AI-Driven Mock Setup
- **MCP Server (41 tools)** — AI agents (Claude Code, Codex, Gemini, etc.) read your source code and create matching mock endpoints, configure response sequences, and manage collections — all through natural language
- **Sequence Presets** — Named response scenarios (e.g. "Token Expired Flow") with sequential or loop modes. The AI can set up multi-step flows like `401 → token refresh → 200` in one conversation

### Manual Control
- **Web UI** — Create and manage endpoints from your browser with a visual editor
- **Multiple Response Variants** — Define multiple responses per endpoint and switch between them with a single click
- **Conditional Matching** — Auto-select response variants based on request body, headers, query/path params with AND/OR rule logic

### Mock Server Capabilities
- **Dynamic Templates** — 30+ built-in variables (`{{$randomUUID}}`, `{{$randomEmail}}`, etc.) and request context helpers (`{{$body 'field'}}`, `{{$pathParams 'id'}}`)
- **Path Parameters** — Dynamic routes with `:param` or `{param}` syntax
- **Environments** — Manage variables across dev/staging/production and switch instantly
- **WebSocket Mock** — WebSocket endpoints with response frames, conditional matching, and periodic sending
- **Response Delay** — Simulate latency per-variant or globally
- **Real-time Logging** — Monitor incoming requests live
- **Import / Export** — Share mock configurations as JSON
- **Fully Local** — No cloud, no account, no rate limits. Works offline and over your local network

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                    │
│  http://localhost:5173 (dev) / http://localhost:4649     │
└──────────┬──────────────────────────────────────────────┘
           │ REST API + WebSocket
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│  Admin API (:4649)   │       │  Mock Server (:4650)  │
│  - Endpoint CRUD     │       │  - Serves mock        │
│  - Collection mgmt   │       │    responses (HTTP/WS) │
│  - Settings          │       │  - Logs requests       │
│  - Static files      │       │                        │
└──────────┬───────────┘       └────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │  SQLite DB   │
    └──────────────┘
```

The Admin API manages endpoint configurations and serves the frontend, while the Mock Server dynamically routes incoming requests to the appropriate configured responses.

## Tech Stack

| Area | Technologies |
|------|-------------|
| Backend | Node.js, Fastify, TypeScript, better-sqlite3 |
| Frontend | React, Vite, Zustand, Tailwind CSS, Monaco Editor |
| Infra | npm workspaces, SQLite |

## Getting Started

### Install via Homebrew

```bash
brew tap ljdongz/tap
brew install mocka
```

### Start / Stop

```bash
mocka start           # Start in foreground
mocka start -d        # Start in background (daemon)
mocka stop            # Stop the running instance
mocka status          # Check if Mocka is running
```

The admin UI and mock server will be available at:

| Service | URL | Description |
|---------|-----|-------------|
| Admin UI | `http://localhost:4649` | Management UI + REST API |
| Mock Server | `http://localhost:4650` | Serves mock responses |

### Port Configuration

Default ports: **Admin 4649**, **Mock 4650**. Change them with:

```bash
mocka config                                # View current settings
mocka config admin_port=5000 mock_port=5001  # Set custom ports
```

Environment variables (`ADMIN_PORT`, `MOCK_PORT`) override saved config for a single run.

If the mock server port is in use, Mocka automatically tries the next available port.

### MCP (AI Agent Integration)

Mocka includes a built-in [MCP](https://modelcontextprotocol.io/) server that lets AI agents (Claude Code, Codex CLI, Gemini CLI, etc.) manage mock endpoints directly.

**Interactive setup:**

```bash
mocka mcp install
```

This walks you through selecting an AI client and scope. Or configure manually:

```bash
# Claude Code
claude mcp add mocka -- mocka mcp

# Codex CLI
codex mcp add mocka -- mocka mcp
```

Once configured, AI agents can create endpoints, set up sequence presets, configure response bodies, and manage collections — all through natural language.

**Available tools (41):** `list_endpoints`, `create_endpoint`, `add_variant`, `update_variant`, `create_preset`, `set_active_preset`, `create_collection`, `move_endpoint`, `get_server_status`, `get_sequence_state`, `export_data`, `import_data`, and more.

### Development

If you want to contribute to Mocka, clone the repository and use development mode:

```bash
git clone https://github.com/ljdongz/Mocka.git
cd Mocka
npm install
npm run dev
```

This starts three servers concurrently:

| Service | URL | Description |
|---------|-----|-------------|
| Vite Dev Server | `http://localhost:5173` | Frontend with HMR |
| Admin API | `http://localhost:4649` | REST API + WebSocket |
| Mock Server | `http://localhost:4650` | Serves mock responses |

## Usage

1. **Open the admin UI** at `http://localhost:4649`
2. **Create a collection** to organize your endpoints
3. **Add a mock endpoint** — set the method, path, status code, headers, and response body
4. **Send requests** to the mock server:

```bash
# Example: GET request to a mock endpoint
curl http://localhost:4650/api/users

# Example: POST request
curl -X POST http://localhost:4650/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John"}'

# Example: Path parameter — matches an endpoint defined as /api/users/:id
curl http://localhost:4650/api/users/42

# Example: Override response variant via headers
curl http://localhost:4650/api/users \
  -H "x-mock-response-code: 404"

curl http://localhost:4650/api/users \
  -H "x-mock-response-name: error" \
  -H "x-mock-response-delay: 2"
```

5. **Use template variables** in response bodies for dynamic data:

```json
{
  "id": "{{$randomUUID}}",
  "name": "{{$randomFullName}}",
  "email": "{{$randomEmail}}",
  "createdAt": "{{$isoTimestamp}}"
}
```

6. **Echo request data** back in responses using context helpers:

```json
{
  "receivedName": "{{$body 'user.name'}}",
  "authToken": "{{$headers 'authorization'}}",
  "searchQuery": "{{$queryParams 'q'}}",
  "userId": "{{$pathParams 'id'}}"
}
```

7. **Set up environments** to manage variables across different configurations (dev, staging, production). Use `{{variableName}}` in response bodies to reference them.

> **Tip:** The mock server also listens on your local network IP (shown in the console on startup), so you can send requests from other devices on the same network — for example, `curl http://192.168.x.x:4650/api/users`. This is especially useful for testing mobile apps or other clients.

8. **Monitor requests** in real time from the admin UI's request log

## Project Structure

```
mocka/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/            # API client functions
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── i18n/           # Translations (en, ko)
│   │   ├── stores/         # Zustand stores
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── vite.config.ts
├── server/                 # Fastify backend
│   ├── src/
│   │   ├── db/             # Database connection & schema
│   │   ├── mcp/            # MCP server & tools
│   │   ├── models/         # Data models
│   │   ├── plugins/        # Fastify plugins (WebSocket, etc.)
│   │   ├── repositories/   # Data access layer
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   ├── __tests__/      # Unit tests (Vitest)
│   │   ├── admin-server.ts # Admin API server
│   │   ├── mock-server.ts  # Mock server
│   │   ├── cli.ts          # CLI entry point
│   │   └── index.ts        # Server entry point
│   └── data/               # SQLite database files (dev)
└── package.json            # Workspace root
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `mocka start` | Start Mocka (foreground) |
| `mocka start -d` | Start Mocka in background |
| `mocka stop` | Stop the running instance |
| `mocka status` | Check if Mocka is running |
| `mocka config` | Show current configuration |
| `mocka config k=v` | Set configuration (admin_port, mock_port) |
| `mocka mcp` | Start the MCP server (stdio) |
| `mocka mcp install` | Register Mocka MCP with an AI client |
| `mocka mcp uninstall` | Remove Mocka MCP from an AI client |

### Development Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both servers in development mode |
| `npm run build` | Build both client and server for production |
| `npm test -w server` | Run server unit tests |

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/my-feature`)
3. **Commit** your changes (`git commit -m 'Add my feature'`)
4. **Push** to the branch (`git push origin feature/my-feature`)
5. **Open a Pull Request**

## License

This project is licensed under the [MIT License](LICENSE).
