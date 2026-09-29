# Using Mocka

**A practical guide to building realistic mocks — concepts, matching, templates, and the response-resolution order that ties them together.**

[한국어](README.ko.md) · [← Back to README](../../README.md) · [MCP Guide](../mcp/README.md)

---

## Mental model

```
Collection  ──groups──►  Endpoint  ──has many──►  Response Variant
 (UI only)               (method+path)            (status, body, headers, rules)

Shared, cross-endpoint:   Dataset   ·   Environment   ·   Sequence Preset
```

- A **Collection** is a UI folder. It never affects matching.
- An **Endpoint** is a route — a unique `method` + `path`.
- A **Response Variant** is one possible response. An endpoint can have many; Mocka picks exactly one per request.
- **Datasets**, **Environments**, and **Sequence Presets** are cross-cutting features that variants draw on.

The single most useful thing to understand is **[how Mocka decides which variant to return](#response-resolution-order)** — read that section once and most "why did it return that?" surprises disappear.

---

## Quick start

1. Start Mocka and open the admin UI: `mocka start` → <http://localhost:4649>
2. **Create a Collection** (optional, for organization).
3. **Add an Endpoint** — set method, path, status, headers, body.
4. **Call the mock server** at port **4650**:

```bash
curl http://localhost:4650/api/users
curl -X POST http://localhost:4650/api/users -H 'Content-Type: application/json' -d '{"name":"John"}'
curl http://localhost:4650/api/users/42          # matches /api/users/:id
```

> [!TIP]
> The mock server also listens on your **local network IP** (printed on startup), so phones and other devices on the same Wi-Fi can hit it directly — e.g. `curl http://192.168.0.12:4650/api/users`. Great for testing mobile apps.

---

## Concepts

### Collections

Named folders that group endpoints in the UI. A Collection has a name, an ordered list of endpoints, and can hold other Collections — e.g. one top-level Collection per app, with feature Collections inside. Drag an endpoint or a Collection (with everything inside it) anywhere in the tree: drop on the middle of a Collection row to put it inside, near a row's top or bottom edge to place it before or after, or in the empty space below the tree to move it to the top level. A blue line shows exactly where it will land. Collections and endpoints under the same parent share one order, so an endpoint can sit above a Collection; endpoints outside any Collection sit at the top level alongside the top-level Collections. The folder icon on a row does the same through a menu.

> [!NOTE]
> Collections are **purely organizational**. They never influence route matching or which response is returned, so `method + path` must still be unique across all apps. Deleting a Collection **also deletes its nested Collections and every endpoint inside them** — move an endpoint out first if you want to keep it.

### Endpoints

A mock route, identified by **HTTP method + path**. Valid methods: `GET, POST, PUT, DELETE, PATCH`.

- **Uniqueness:** `method + path` must be unique (a clash returns `400 already exists`).
- **Normalization:** trailing slashes are stripped (`/users/` → `/users`); the root `/` is kept.
- **Enable/disable:** a disabled endpoint is removed from the route table entirely, so it returns **404** (not 503). Toggle it from the switch in the editor's top bar, the power icon on the sidebar row, or `toggle_endpoint`. A disabled endpoint is dimmed in the sidebar and keeps its power icon on screen so you can switch it back without hovering.
- The configured request body type, query params, and request headers are **documentation/UI scaffolding** — they do **not** gate matching. Any request to the method+path matches.

### Response Variants

The actual responses. Each variant has: `statusCode`, `body` (a template string), `headers` (JSON string), optional `delay`, optional `matchRules`, optional `datasetBinding`, and a `description` label.

A variant lives in one of two **pools**:

- **standard** — normal variants.
- **sequence** — variants attached to a Sequence Preset.

These pools never mix in a single response: which pool is used depends on the endpoint's sequence mode (see [resolution order](#response-resolution-order)). Each endpoint has an **active variant** — the default pick in standard mode when nothing else matches.

> [!NOTE]
> `headers` is stored as a JSON string and parsed at request time; **invalid JSON is silently ignored** (no headers applied). Delete the active variant and the first remaining variant becomes active automatically.

### Conditional Matching (Match Rules)

Make a variant respond only when the incoming request looks a certain way. A variant's `matchRules` holds four arrays plus a combiner:

```jsonc
{
  "bodyRules":      [{ "field": "user.role", "operator": "equals", "value": "admin" }],
  "headerRules":    [{ "field": "x-api-key", "operator": "equals", "value": "secret" }],
  "queryParamRules":[{ "field": "debug",     "operator": "equals", "value": "true" }],
  "pathParamRules": [{ "field": "id",        "operator": "equals", "value": "1" }],
  "combineWith": "AND"   // or "OR"
}
```

- **Operators:** `equals`, `contains`, `startsWith`, `endsWith`, `regex` (a regex that fails to compile evaluates to `false`).
- **`bodyRules`** read `field` as a **dot-path** into the parsed JSON body (`user.role` → `body.user.role`). A missing field fails the rule.
- **`headerRules`** are **case-insensitive** (field is lowercased). Query/path rules match by exact key.
- **`combineWith`:** `AND` = all rules must pass · `OR` = any rule passes.

> [!WARNING]
> **An empty rule set never matches** (it returns `false`). A variant with no rules is only reachable as the active/fallback variant — not via matching. Also, conditional matching is effectively **standard-mode only**: in sequence mode the counter always returns a variant, so match rules are never evaluated. Header overrides (below) also outrank match rules.

### Dynamic Templates

Response bodies are templates resolved at request time in **five fixed passes**:

| # | Pass | Syntax | Example |
|---|------|--------|---------|
| 1 | Environment variables | `{{varName}}` | `{{baseUrl}}` |
| 2 | Request-context helpers | `{{$helper 'arg' 'default'}}` | `{{$body 'user.name' 'anon'}}` |
| 3 | Dynamic variables | `{{$variable}}` | `{{$randomUUID}}` |
| 4 | Dataset token | `{{$dataset}}` | `{{$dataset}}` |
| 5 | Media URL | `{{$media 'name'}}` | `{{$media 'chat-clip'}}` |

```json
{
  "id": "{{$randomUUID}}",
  "createdAt": "{{$isoTimestamp}}",
  "name": "{{$randomFullName}}",
  "caller": "{{$body 'user.name' 'anon'}}",
  "host": "{{baseUrl}}"
}
```

> [!NOTE]
> Order matters. Because env substitution runs first, an env value that *contains* a `{{$randomUUID}}` will be expanded by pass 3. Unknown `{{$foo}}` tokens are left **literally** in the output. **Response headers receive pass 1 only** — env variables work in headers, but helpers / dynamic vars / dataset / media URLs do not.

#### Built-in dynamic variables (33)

`{{$randomUUID}}` · `{{$guid}}` (alias) · `{{$randomFirstName}}` · `{{$randomLastName}}` · `{{$randomFullName}}` · `{{$randomUserName}}` · `{{$randomEmail}}` · `{{$randomUrl}}` · `{{$randomIP}}` · `{{$randomIPv6}}` · `{{$randomSlug}}` · `{{$randomHexColor}}` · `{{$randomInt}}` (0–9999) · `{{$randomFloat}}` (0–1000, 2dp) · `{{$randomBoolean}}` · `{{$timestamp}}` (Unix s) · `{{$isoTimestamp}}` · `{{$randomDate}}` · `{{$randomDatetime}}` · `{{$randomCity}}` · `{{$randomCountry}}` · `{{$randomStreetAddress}}` · `{{$randomZipCode}}` · `{{$randomLatitude}}` · `{{$randomLongitude}}` · `{{$randomCompanyName}}` · `{{$randomPhoneNumber}}` · `{{$randomJobTitle}}` · `{{$randomLoremSentence}}` · `{{$randomLoremParagraph}}` · `{{$randomWord}}` · `{{$randomImageUrl}}` · `{{$randomAvatarUrl}}`

#### Request-context helpers

| Helper | Returns |
|--------|---------|
| `{{$body 'dot.path' 'default'}}` | Nested value from the JSON body (objects are JSON-stringified) |
| `{{$bodyJson 'dot.path' 'default'}}` | The same value as a complete JSON literal, **quotes included** — write it without surrounding quotes: `"text": {{$bodyJson 'payload.text'}}`. Strings are escaped (newlines, `"`, `\`), numbers / booleans / objects pass through, a missing path gives `null` or the default verbatim (write the default as JSON) |
| `{{$queryParams 'key' 'default'}}` | Query string param by exact key |
| `{{$pathParams 'name' 'default'}}` | Captured path parameter (from `:name` / `{name}`) |
| `{{$pathSegments 'index' 'default'}}` | Raw URL segment at a 0-based numeric index |
| `{{$headers 'Header-Name' 'default'}}` | Request header (case-insensitive) |
| `{{$now 'yyyy.MM.dd HH:mm:ss'}}` | Current time in the host's local time zone, formatted. Tokens `yyyy` `yy` `MM` `dd` `HH` `mm` `ss` `SSS`; other characters are literal; `''` gives ISO 8601. An offset shifts the clock **before** formatting — `{{$now 'yyyy.MM.dd' + 14d}}`. All `$now` in one body share the same instant |

> [!IMPORTANT]
> Echoing request **text** into a response? Use `{{$bodyJson}}`, not `"{{$body}}"`. `$body` inserts strings raw, so a newline, tab or `"` in the request produces invalid JSON, and a backslash can silently change the value.

`{{$media 'name'}}` takes an argument the same way but resolves in its own pass, against the registered media files rather than the request — see [Media](#media--media-name).

#### Offset suffix — arithmetic & relative time

Any variable or helper token accepts a trailing `+ N` / `- N` suffix, optionally with a time unit. It is applied to the **resolved** value, so it works on request data and on generated values alike.

| Suffix | Meaning | Example | With | Result |
|--------|---------|---------|------|--------|
| `+ N` / `- N` | Number arithmetic | `{{$body 'data' + 1}}` | body `{"data":1}` | `2` |
| `+ Ns` `+ Nm` `+ Nh` `+ Nd` `+ Nw` | Shift a date by seconds / minutes / hours / days / weeks | `{{$isoTimestamp + 3h}}` | — | now + 3h, ISO 8601 |
| | | `{{$timestamp - 7d}}` | — | now − 7d, Unix seconds |
| | | `{{$body 'startAt' + 1d}}` | body `{"startAt":"2026-01-01T00:00:00Z"}` | `2026-01-02T00:00:00.000Z` |

```json
{
  "data": {{$body 'data'}},
  "next": {{$body 'data' + 1}},
  "afterNext": {{$body 'data' + 2}},
  "page": {{$queryParams 'page' '1' + 1}},
  "issuedAt": "{{$isoTimestamp}}",
  "expiresAt": "{{$isoTimestamp + 3h}}",
  "trialEndsAt": "{{$isoTimestamp + 14d}}",
  "deletedBefore": {{$timestamp - 30d}}
}
```

> [!NOTE]
> A value that is **empty or non-numeric** (missing body field, a name string, an unparseable date) is returned **unchanged** — the offset is skipped rather than emitting `NaN`, so the body stays valid JSON. Give the helper a default to opt in: `{{$body 'count' '0' + 1}}`.
> A date value is read as **Unix seconds** if it is all digits, otherwise via `Date.parse`, and comes back in the same form. `m` means **minutes**; months and years are not supported (they need calendar math, not a fixed multiplier).

### Path Parameters

Declare parameters with `:name` **or** `{name}`. Captured segments flow into match rules (`pathParamRules`), dataset `keySource`, and the `{{$pathParams 'name'}}` helper.

```
Path: /users/:id     Request: GET /users/42     →  pathParams { id: "42" }
```

> [!NOTE]
> **Specificity:** exact static routes always beat parametric ones. Among parametric routes, the one with **more static segments** wins (specificity = literal-segment count, *not* registration order). A parameter matches a **single** non-slash segment — it won't span `/`.

### Datasets & `{{$dataset}}`

A **Dataset** is a reusable array of records with a `keyField`. A variant binds to it and injects it via the `{{$dataset}}` token, in one of two modes:

- **list** — returns the whole array (optionally **projected** to a subset of fields per record).
- **detail** — looks up a single record by key. The key comes from `keySource: { from: "body" | "path" | "query", field }` (defaults to the body field named by `keyField`).

```jsonc
// Dataset "users", keyField "id", records [{id:1,name:"A"}, {id:2,name:"B"}]

// LIST variant on GET /users      body: { "users": {{$dataset}} }
//   binding: { mode: "list" }                      → all records
//   binding: { mode: "list", projection: ["id"] }  → [{id:1},{id:2}]

// DETAIL variant on GET /users/:id  body: { "user": {{$dataset}} }
//   binding: { mode: "detail", keySource: { from: "path", field: "id" } }
//   GET /users/2 → { "user": { "id": 2, "name": "B" } }
```

> [!WARNING]
> `{{$dataset}}` resolves **last** and becomes the literal `null` if the dataset is missing or no record matches. Datasets and dataset bindings are **not** included in export/import — exporting and re-importing **loses all dataset wiring**. `records` must be a JSON array.

### Media & `{{$media 'name'}}`

Register a local image, video, or file and a response can hand out a URL for it — the case where an app asks the API where a file lives, then downloads it from that address.

```jsonc
// Register (MCP): register_media path="~/Movies/clip.mp4" name="chat-clip"
// Or drop the file into the Media panel in the web UI.

// Variant body on GET /chat/attachment/:idx/download-url
{ "data": { "downloadUrl": "{{$media 'chat-clip'}}" } }

// GET http://localhost:4650/chat/attachment/501/download-url
// → { "data": { "downloadUrl": "http://localhost:4650/__mocka/media/<id>.mp4" } }

// GET http://192.168.0.12:4650/chat/attachment/501/download-url   (from a device)
// → { "data": { "downloadUrl": "http://192.168.0.12:4650/__mocka/media/<id>.mp4" } }
```

- **The URL is built from the request's `Host` header**, so a simulator on localhost and a real device on your network each get an address that resolves for them. No per-environment configuration.
- The file is served from `/__mocka/media/…` on the **mock port**, with `Content-Type` from its extension and **range requests answered with `206`** — which is what lets a video player seek.
- Registering **copies** the file into Mocka's data directory, so moving or deleting the original afterwards does not break the mock.
- A name that is not registered is **left in the response as-is** (`{{$media 'typo'}}`) and logged on the server, rather than silently becoming an empty string.

> [!WARNING]
> Media is **not** included in export/import.
>
> Registering by **file path** makes the admin API read an arbitrary local file, so it is accepted only from a local, non-browser client — the MCP server or `curl`. A request carrying `Origin` or `Sec-Fetch-Site` is refused with a 403, because a page you merely visit runs on your machine too and would otherwise pass an IP check. The web UI and other devices **upload** the bytes instead, which has no such restriction.

### Environments & Variables

An **Environment** is a named set of `key → value` string variables. Exactly **one** environment is active at a time; its variables fill `{{varName}}` placeholders.

```
Active env { "baseUrl": "https://api.test", "token": "abc" }
Body  { "url": "{{baseUrl}}/v1", "auth": "{{token}}" }
```

> [!NOTE]
> Environment substitution runs **first** (pass 1) and is the **only** resolution applied to response headers. `{{$...}}` ($-prefixed) is never treated as an env var. Environments are **not** exported/imported.

### Sequence Presets (sequential vs loop)

A **Sequence Preset** is a named, ordered list of variants on an endpoint that returns a **different variant on each successive call** — perfect for multi-step flows (`pending → processing → done`, or `401 → 200`).

- Turn on sequence mode (`sequenceMode: "on"`) and set an active preset.
- **`sequential`** — advances and then **clamps on the last variant** forever.
- **`loop`** — wraps back to the first after the last.

```
Preset "checkout" (sequential): [202 Accepted, 200 Processing, 200 Complete]
  call 1 → 202   call 2 → 200 Processing   call 3+ → 200 Complete
```

> [!WARNING]
> The counter is **in-memory** (keyed by the active preset) and is **wiped on server restart**. Reset it with `reset_sequence` / `reset_all_sequences`. Sequence mode **suppresses conditional matching**. Header overrides still win and do **not** advance the counter.

### Response Delay

Artificial latency before responding. **Values are in SECONDS.**

- Per-request: header `x-mock-response-delay: 2.5`
- Per-variant: `variant.delay`
- Global default: settings `responseDelay`

Precedence: header → `variant.delay` → global.

> [!WARNING]
> Seconds, **not milliseconds** — a common surprise. And `variant.delay === 0` **beats** the global default (only `null` falls through to global), so a variant set to `0` disables global delay for itself.

### Uploads — throttle, size cap, mid-upload drop

The mock server sits on the same machine as the simulator, so an upload normally finishes in one tick and progress UI never shows. These apply to every request body (JSON, multipart, …):

| Control | Where | Effect |
|---------|-------|--------|
| Upload rate (KB/s) | settings `uploadRateKbps` (default `0` = unlimited), or header `x-mock-upload-rate-kbps: 300` (wins) | The body is **read** at that rate, so the client can only send that fast — its progress callback fires in steps. 300 KB/s × 3 MB ≈ 10 s |
| Max body (MB) | settings `maxBodyMB` (default `5`) | Larger bodies get **413** naming the size and the limit — up front when `Content-Length` is sent |
| Drop mid-upload | header `x-mock-upload-abort-percent: 50` | Closes the connection once that share of `Content-Length` has arrived, for failed-upload UI |

Both settings take effect on the next request; no restart. `multipart/form-data` bodies are counted and discarded — History records `{"_multipart": {"bytes": …, "contentType": …}}`, so a large cap costs no memory. The response delay above starts only after the whole body is read.

### Header Overrides (`x-mock-*` request headers)

Three special request headers let the **caller** pick the response without changing server config — ideal for client-driven test scenarios:

| Header | Effect |
|--------|--------|
| `x-mock-response-code: 500` | Return the first variant with that status code |
| `x-mock-response-name: not found` | Return the first variant whose **description** (lowercased) matches |
| `x-mock-response-delay: 2.5` | Override delay, in seconds |

```bash
curl http://localhost:4650/users -H 'x-mock-response-code: 500'
curl http://localhost:4650/users -H 'x-mock-response-name: error' -H 'x-mock-response-delay: 2'
```

> [!NOTE]
> `x-mock-response-name` matches the variant **description** (there is no separate "name" field). Overrides beat sequence presets and match rules, and do **not** advance the sequence counter. If no variant matches the requested code/name, resolution simply falls through to the normal chain (no error).

### Bulk editing (edit mode)

The sidebar header has a **select-to-delete** toggle. In edit mode every collection and endpoint gets a checkbox, the drag handles and per-row actions stand down, and a footer bar deletes everything ticked behind a single confirmation.

Selection follows collection ownership:

| What you do | What gets selected |
| --- | --- |
| Tick a collection | The collection **and** its endpoints |
| Untick any one endpoint | That endpoint and the collection; its siblings stay ticked |
| Tick every endpoint by hand | Only the endpoints — the collection stays unticked |

A collection is only deleted when you ticked **the collection itself**, never as a side effect of selecting everything inside it.

> [!NOTE]
> The delete runs server-side in one transaction, so it cannot half-finish. If anything fails the dialog stays open with the count and the Delete button retries.

### Import / Export

Export endpoints + collections + STOMP connections to a versioned JSON document (current **version 4**) and re-import with a conflict policy:

- **skip** (default) — keep existing endpoints on a `method+path` clash.
- **overwrite** — delete + recreate (collection memberships preserved).
- **merge** — add only variants whose `statusCode:description` key is new.

> [!WARNING]
> Export/import covers endpoints, their variants (with match rules), collections, and STOMP connections (with their destinations, variants, and sequence presets). **Datasets, dataset bindings, environments, and history are NOT exported.** An invalid `conflictPolicy` silently defaults to `skip`.
>
> STOMP connections are matched by **path**, and only `skip` / `overwrite` apply — `merge` falls back to `skip`. A **collection-filtered** export carries HTTP endpoints only, since collections never hold STOMP connections. Older version 1–3 files import unchanged.

### Request History

Every request to the mock server — **including unmatched 404s** — is logged with method, full path (incl. query string), status, request body/params, request headers, and the **fully resolved response body** (templates already expanded). Browse it in the admin UI's request log or via `get_history`; clear it with `clear_history`.

> [!NOTE]
> Because the log stores the *rendered* response body, it's the fastest way to debug dynamic templates and dataset output. History is in-app only and is not part of export/import.

---

## Response resolution order

This is how Mocka turns an incoming request into a response. Understanding it explains nearly every "why that response?" question.

```
LAYER 1 · Route match
  └─ exact "METHOD /path" key  →  else parametric routes by specificity (most static segments first)
  └─ no match → 404 (still logged)

LAYER 2 · Variant pool
  └─ sequenceMode "on" + active preset → pool = that preset's variants
  └─ otherwise                          → pool = standard variants

LAYER 3 · Pick one from the pool, in strict order:
  1. x-mock-response-code header   → first variant with that status code   ┐ override
  2. x-mock-response-name header   → first variant whose description match  ┘ (no counter advance)
  3. sequence mode                 → next variant by counter (sequential clamps / loop wraps)
  4. conditional match rules       → first variant whose matchRules pass (AND/OR; empty never matches)
  5. fallback                      → endpoint.activeVariant, else the first variant

After selection:
  delay (header > variant.delay ?? global, in seconds)
  → body templates (env → helpers → dynamic → dataset → media)
  → headers (env vars only)
  → send + record to history
```

**Key consequences**

- **Header overrides (1–2) beat everything** and do not move the sequence counter.
- **In sequence mode, step 3 always returns a variant** — so steps 4–5 are unreachable. That's why **conditional matching only works in standard mode**.
- A matched route whose pool has **no variant** returns `500 No response variant configured`.
- Headers only ever get environment-variable substitution — never helpers, dynamic vars, datasets, or media URLs.
- `{{$media 'name'}}` resolves **after** everything else, using the request's `Host` header; a request that arrives without one leaves the placeholder untouched.

---

## STOMP mock

Mocka also mocks a **STOMP 1.2 broker over raw WebSocket** (the shape a Spring `@EnableWebSocketMessageBroker` backend exposes without SockJS). The HTTP mock keeps working alongside it — both live on the mock server port.

```
Connection (WebSocket path)  ──has many──►  Destination (trigger + pattern)  ──has many──►  Message Variant
 /api/app/ws/chat                            send  /app/rooms/*/message                    kind × scope × payload
 CONNECT policy · heartbeat                  subscribe /topic/rooms/*                       target /topic/rooms/{{$destCapture 1}}
 replay buffer                               manual /topic/rooms/88
```

### Connections

One connection per WebSocket path. Point the app at `ws://<host>:4650<path>`; an unknown or disabled path is refused with HTTP 404 at upgrade time. Each connection is its own broker namespace — two projects can both define `/topic/rooms/*` without sharing subscribers.

| Setting | Meaning |
|---|---|
| `connectPolicy` | `accept` every CONNECT; `validate` rejects when a `requiredHeaders` entry is empty; `reject` answers every CONNECT with ERROR |
| `heartbeatOutgoing,heartbeatIncoming` | Advertised in CONNECTED; the effective interval is the STOMP 1.2 negotiation (max of both sides, 0 disables). Heartbeats are `\n` frames; a client silent for 3× the interval is closed |
| `defaultDelay` | Default fire delay in **ms** for every variant |
| `replayBufferSize` | Keep the last N broadcast messages per destination while nobody is subscribed and replay them on SUBSCRIBE. `0` drops them like a real broker |

### Destinations (triggers)

| Trigger | Fires when | Typical pattern |
|---|---|---|
| `send` | the client SENDs to a matching destination | `/app/rooms/*/message` — variant target `/topic/rooms/{{$destCapture 1}}` echoes the message to the room |
| `subscribe` | right after the client SUBSCRIBEs | `/topic/rooms/*` — initial snapshot |
| `manual` | you press **Fire Now**, call `fire_destination`, or `push_message` | `/topic/rooms/88` — server-originated push |

Pattern grammar (Spring `AntPathMatcher` style): `*` matches one segment, `**` the rest, a literal must match exactly. Separators are `/` and `.`, so `/topic/rooms/88` and `/topic/rooms.88` are the same destination.

### Message variants

A variant is *what* gets fired. Selection order per trigger: **match rules → sequence preset → active variant → first**.

| Field | Meaning |
|---|---|
| `kind` | `message` (MESSAGE frame), `error` (ERROR then close), `receipt` (RECEIPT), `disconnect` (close with `headers.code`) |
| `scope` | `broadcast` every subscriber of the target; `echo` only the triggering session; `user` the session's `/user/...` queue (`/queue/inbox` → the client's `/user/queue/inbox` subscription) |
| `targetDestination` | Template; empty = the triggered destination |
| `body`, `headers` | Templates (headers as a JSON object) |
| `delay`, `repeatIntervalMs`, `repeatCount` | ms; repeats re-template every tick and stop with the session / connection |
| `matchRules` | Body rules see the SEND body; header rules see SEND headers **merged with the CONNECT headers** (so `x-client-type` works); capture rules use `"1"`, `"2"`… for the pattern's wildcards |
| `datasetBinding` | Inject a dataset where `{{$dataset}}` appears (detail lookups may key on a capture) |

STOMP template helpers, on top of every HTTP helper and variable:

| Helper | Value |
|---|---|
| `{{$destCapture N}}` | N-th wildcard capture of the pattern (1-based); `**` captures the rest joined with `/` |
| `{{$destSeg N}}` | N-th segment of the triggered destination (0-based) |
| `{{$destination}}` | the triggered destination |
| `{{$sessionId}}` / `{{$subscriptionId}}` | the receiving session / subscription |
| `{{$stompHeader 'x'}}` | header of the triggering frame |
| `{{$connectHeader 'x-device-id'}}` | the session's CONNECT header |

### Failure injection

From the session inspector, `POST /api/stomp/sessions/:id/inject`, or MCP:

| Injection | Server does | Client observes |
|---|---|---|
| Reject CONNECT (`connectPolicy: reject`) | ERROR, close | `.rejected` |
| Inject ERROR | ERROR frame, close 1002 | `.serverError` |
| Stop heartbeat | stops sending `\n`, keeps the socket | `.heartbeatTimeout` (zombie) |
| Disconnect | close with the given code | `.transportFailure` |
| Malformed frame | non-STOMP bytes | `.protocolViolation` |
| Delay / jitter, `times` | on push | latency stress, duplicate delivery |

### Observability

Every frame (both directions, heartbeats excluded) lands in **History** with its command, destination and session id. The connection editor lists live sessions with their CONNECT headers and subscriptions; destinations warn when nobody is subscribed. The built-in **Test Client** connects to the mock from the browser so rules can be checked without a device build. Export / import works per connection.

## See also

- [MCP Guide](../mcp/README.md) — drive all of the above from an AI agent (63 tools).
- [Main README](../../README.md) — install, CLI commands, architecture.
