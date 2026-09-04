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

Named folders that group endpoints in the UI. A Collection has a name and an ordered list of endpoints; you can reorder them and drag endpoints between them.

> [!NOTE]
> Collections are **purely organizational**. They never influence route matching or which response is returned. Deleting a Collection does **not** delete its endpoints — they just become ungrouped.

### Endpoints

A mock route, identified by **HTTP method + path**. Valid methods: `GET, POST, PUT, DELETE, PATCH`.

- **Uniqueness:** `method + path` must be unique (a clash returns `400 already exists`).
- **Normalization:** trailing slashes are stripped (`/users/` → `/users`); the root `/` is kept.
- **Enable/disable:** a disabled endpoint is removed from the route table entirely, so it returns **404** (not 503). Toggle with the UI switch or `toggle_endpoint`.
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

Response bodies are templates resolved at request time in **four fixed passes**:

| # | Pass | Syntax | Example |
|---|------|--------|---------|
| 1 | Environment variables | `{{varName}}` | `{{baseUrl}}` |
| 2 | Request-context helpers | `{{$helper 'arg' 'default'}}` | `{{$body 'user.name' 'anon'}}` |
| 3 | Dynamic variables | `{{$variable}}` | `{{$randomUUID}}` |
| 4 | Dataset token | `{{$dataset}}` | `{{$dataset}}` |

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
> Order matters. Because env substitution runs first, an env value that *contains* a `{{$randomUUID}}` will be expanded by pass 3. Unknown `{{$foo}}` tokens are left **literally** in the output. **Response headers receive pass 1 only** — env variables work in headers, but helpers / dynamic vars / dataset do not.

#### Built-in dynamic variables (33)

`{{$randomUUID}}` · `{{$guid}}` (alias) · `{{$randomFirstName}}` · `{{$randomLastName}}` · `{{$randomFullName}}` · `{{$randomUserName}}` · `{{$randomEmail}}` · `{{$randomUrl}}` · `{{$randomIP}}` · `{{$randomIPv6}}` · `{{$randomSlug}}` · `{{$randomHexColor}}` · `{{$randomInt}}` (0–9999) · `{{$randomFloat}}` (0–1000, 2dp) · `{{$randomBoolean}}` · `{{$timestamp}}` (Unix s) · `{{$isoTimestamp}}` · `{{$randomDate}}` · `{{$randomDatetime}}` · `{{$randomCity}}` · `{{$randomCountry}}` · `{{$randomStreetAddress}}` · `{{$randomZipCode}}` · `{{$randomLatitude}}` · `{{$randomLongitude}}` · `{{$randomCompanyName}}` · `{{$randomPhoneNumber}}` · `{{$randomJobTitle}}` · `{{$randomLoremSentence}}` · `{{$randomLoremParagraph}}` · `{{$randomWord}}` · `{{$randomImageUrl}}` · `{{$randomAvatarUrl}}`

#### Request-context helpers

| Helper | Returns |
|--------|---------|
| `{{$body 'dot.path' 'default'}}` | Nested value from the JSON body (objects are JSON-stringified) |
| `{{$queryParams 'key' 'default'}}` | Query string param by exact key |
| `{{$pathParams 'name' 'default'}}` | Captured path parameter (from `:name` / `{name}`) |
| `{{$pathSegments 'index' 'default'}}` | Raw URL segment at a 0-based numeric index |
| `{{$headers 'Header-Name' 'default'}}` | Request header (case-insensitive) |

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

### Import / Export

Export endpoints + collections to a versioned JSON document (current **version 3**) and re-import with a conflict policy:

- **skip** (default) — keep existing endpoints on a `method+path` clash.
- **overwrite** — delete + recreate (collection memberships preserved).
- **merge** — add only variants whose `statusCode:description` key is new.

> [!WARNING]
> Export/import covers endpoints, their variants (with match rules), and collections only. **Datasets, dataset bindings, environments, and history are NOT exported.** An invalid `conflictPolicy` silently defaults to `skip`.

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
  → body templates (env → helpers → dynamic → dataset)
  → headers (env vars only)
  → send + record to history
```

**Key consequences**

- **Header overrides (1–2) beat everything** and do not move the sequence counter.
- **In sequence mode, step 3 always returns a variant** — so steps 4–5 are unreachable. That's why **conditional matching only works in standard mode**.
- A matched route whose pool has **no variant** returns `500 No response variant configured`.
- Headers only ever get environment-variable substitution — never helpers, dynamic vars, or datasets.

---

## See also

- [MCP Guide](../mcp/README.md) — drive all of the above from an AI agent (43 tools).
- [Main README](../../README.md) — install, CLI commands, architecture.
