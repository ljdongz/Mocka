<div align="center">

# Mocka

**A cross-platform, web-based HTTP mock server**

[한국어](README.ko.md)

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

## Introduction

Mocka is a web-based HTTP mock server that lets you create, manage, and serve mock API endpoints from your browser. Define endpoints with custom methods, paths, status codes, headers, and response bodies — then point your client applications at the mock server to receive the configured responses.

The application runs two servers: an **Admin API** (default port 3000) that serves the management UI and REST API, and a **Mock Server** (default port 8080) that dynamically handles incoming requests based on your configured endpoints. All data is persisted in a local SQLite database, so your mock configurations survive restarts.

Mocka was originally inspired by SwiftMocker (a macOS-only native app) and rebuilt as a cross-platform web application that runs anywhere Node.js does.

## Features

- **Mock Endpoint Management** — Create endpoints with any HTTP method (GET, POST, PUT, DELETE, PATCH)
- **Multiple Response Variants** — Define several response variants per endpoint and switch between them
- **Collections** — Organize endpoints into groups with drag-and-drop reordering
- **Real-time Request Logging** — Monitor incoming requests via WebSocket in real time
- **Response Delay** — Simulate network latency with configurable delays
- **Monaco Editor** — Edit JSON response bodies with syntax highlighting and validation
- **SQLite Persistence** — All configurations are stored in a local SQLite database
- **Cross-platform** — Runs on macOS, Linux, and Windows

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                    │
│  http://localhost:5173 (dev) / http://localhost:3000     │
└──────────┬──────────────────────────────────────────────┘
           │ REST API + WebSocket
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│  Admin API (:3000)   │       │  Mock Server (:8080)  │
│  - Endpoint CRUD     │       │  - Serves mock        │
│  - Collection mgmt   │       │    responses           │
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

### Prerequisites

- **Node.js** 20+
- **npm** 7+

### Quick Start

```bash
git clone https://github.com/your-username/mocka.git
cd mocka
npm install                   # Install dependencies
npm run build && npm start    # Build and start the server
```

The admin UI and mock server will be available at:

| Service | URL | Description |
|---------|-----|-------------|
| Admin UI | `http://localhost:3000` | Management UI + REST API |
| Mock Server | `http://localhost:8080` | Serves mock responses |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PORT` | `3000` | Port for the Admin API |
| `MOCK_PORT` | `8080` | Port for the Mock Server |

### Development

If you want to contribute to Mocka, use development mode instead. Unlike production mode, development mode runs a separate Vite dev server that watches for code changes and automatically refreshes the browser (HMR), so you can see your edits instantly without rebuilding.

```bash
npm run dev
```

This starts three servers concurrently:

| Service | URL | Description |
|---------|-----|-------------|
| Vite Dev Server | `http://localhost:5173` | Frontend with HMR |
| Admin API | `http://localhost:3000` | REST API + WebSocket |
| Mock Server | `http://localhost:8080` | Serves mock responses |

## Usage

1. **Open the admin UI** at `http://localhost:3000`
2. **Create a collection** to organize your endpoints
3. **Add a mock endpoint** — set the method, path, status code, headers, and response body
4. **Send requests** to the mock server:

```bash
# Example: GET request to a mock endpoint
curl http://localhost:8080/api/users

# Example: POST request
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John"}'
```

> **Tip:** The mock server also listens on your local network IP (shown in the console on startup), so you can send requests from other devices on the same network — for example, `curl http://192.168.x.x:8080/api/users`. This is especially useful for testing mobile apps or other clients.

5. **Monitor requests** in real time from the admin UI's request log

## Project Structure

```
mocka/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/            # API client functions
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── stores/         # Zustand stores
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   └── vite.config.ts
├── server/                 # Fastify backend
│   ├── src/
│   │   ├── db/             # Database connection & schema
│   │   ├── models/         # Data models
│   │   ├── plugins/        # Fastify plugins (WebSocket, etc.)
│   │   ├── repositories/   # Data access layer
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic
│   │   ├── utils/          # Utility functions
│   │   ├── admin-server.ts # Admin API server
│   │   ├── mock-server.ts  # Mock server
│   │   └── index.ts        # Entry point
│   └── data/               # SQLite database files
└── package.json            # Workspace root
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies (server + client) |
| `npm run dev` | Start both servers in development mode |
| `npm run dev:server` | Start only the backend (with hot reload) |
| `npm run dev:client` | Start only the frontend (Vite dev server) |
| `npm run build` | Build both client and server for production |
| `npm start` | Start the production server |
| `npm stop` | Stop running Mocka processes |

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature (`git checkout -b feature/my-feature`)
3. **Commit** your changes (`git commit -m 'Add my feature'`)
4. **Push** to the branch (`git push origin feature/my-feature`)
5. **Open a Pull Request**

## License

This project is licensed under the [MIT License](LICENSE).
