# Mocka MCP 서버

**AI 에이전트가 자연어로 mock 서버를 구축하고 조작하게 하세요.**

[English](README.md) · [← README로 돌아가기](../README.ko.md) · [사용 가이드](../usage/README.ko.md)

---

## 개요

Mocka는 [MCP](https://modelcontextprotocol.io/)(Model Context Protocol) 서버를 내장하고 있습니다. AI 클라이언트에 등록하면 **Claude Code**, **Codex CLI**, **Gemini CLI** 같은 에이전트가 프로젝트의 API 호출 코드를 읽고 그에 맞는 mock endpoint를 생성하고, 응답 시퀀스를 구성하고, collection을 관리하고, dataset을 채우는 작업을 — 수동 UI 조작 없이 대화만으로 — 수행합니다.

MCP 서버는 **43개 도구**를 제공하며, 이들은 Mocka의 admin REST API와 1:1로 대응합니다. 따라서 웹 UI에서 할 수 있는 모든 작업을 에이전트가 MCP로 할 수 있고, **동일한 매칭·우선순위·해석 규칙**이 그대로 적용됩니다.

> 예시 프롬프트:
> *"내 인증 API mock 만들어줘 — `/login` 첫 호출은 401, 재시도하면 200. 그리고 공유 dataset 기반의 `/users/:id` endpoint도 추가해줘."*

---

## 동작 방식

```
┌──────────────┐   stdio    ┌──────────────────┐   HTTP    ┌─────────────────┐
│  AI 클라이언트 │  (MCP)     │  mocka mcp       │  REST     │  Mocka Admin    │
│ Claude/Codex │ ─────────► │  (stdio 서버)     │ ────────► │  API  :4649     │
│ /Gemini      │            │                  │           │  (mocka start)  │
└──────────────┘            └──────────────────┘           └─────────────────┘
```

- **Transport:** stdio. `mocka mcp`는 `@modelcontextprotocol/sdk`의 `StdioServerTransport`로 동작하는 MCP 서버(이름 `mocka`)를 실행합니다.
- **데이터 경로:** MCP 프로세스는 **자체 데이터를 보유하지 않습니다.** 모든 도구 호출은 Mocka **Admin API**(기본 `http://localhost:4649`)로의 HTTP 요청입니다. 실행 시 저장된 `admin_port`를 설정에서 한 번 읽어 포트를 파악한 뒤, 이후로는 순수하게 HTTP로 통신합니다.
- **Mocka를 자동 실행하지 않습니다.** `mocka mcp` 프로세스와 `mocka start` 서버는 별개입니다. admin 서버가 실행 중일 때만 도구가 동작합니다.

> [!IMPORTANT]
> **도구가 동작하려면 반드시 `mocka start`가 실행 중이어야 합니다.** admin 서버에 접근할 수 없으면 모든 도구가 다음 에러로 실패합니다:
> "Mocka server is not reachable at http://localhost:4649. Run `mocka start` first."

### 커스텀 포트 지정

admin 포트를 변경했다면(`mocka config admin_port=5000`) MCP 서버가 설정에서 자동으로 인식합니다. 명시적으로 덮어쓰려면 실행 전 환경 변수를 설정하세요:

- `MOCKA_ADMIN_URL=http://localhost:5000` — 전체 base URL, 또는
- `ADMIN_PORT=5000` — 포트만 (호스트는 `localhost` 기본값)

---

## 사전 준비

1. **Mocka 설치**(`brew install mocka`) 및 실행(`mocka start` 또는 `mocka start -d`).
2. **AI 클라이언트 CLI**가 `PATH`에 있어야 함:
   - Claude Code — `claude`
   - Codex CLI — `codex` (`npm install -g @openai/codex`)
   - Gemini CLI — 바이너리 불필요 (Mocka가 설정 파일을 직접 작성)

---

## 설치

### 인터랙티브 (권장)

```bash
mocka mcp install
```

클라이언트(그리고 Claude Code의 경우 scope)를 선택하는 안내를 따르면 Mocka가 자동으로 등록합니다. 나중에 제거하려면:

```bash
mocka mcp uninstall
```

### 수동 설정

<details open>
<summary><b>Claude Code</b></summary>

```bash
# User scope (모든 프로젝트에서 사용 가능)
claude mcp add --scope user mocka -- mocka mcp

# Project scope (현재 디렉토리의 .mcp.json으로 팀과 공유)
claude mcp add --scope project mocka -- mocka mcp

# Local scope (현재 디렉토리에서만, 나에게만 적용)
claude mcp add --scope local mocka -- mocka mcp
```

설정 파일은 Claude Code가 소유하며, Mocka는 `claude mcp add`를 호출할 뿐입니다.
</details>

<details>
<summary><b>Codex CLI</b></summary>

```bash
codex mcp add mocka -- mocka mcp
```

`codex` 바이너리가 `PATH`에 있어야 합니다. scope는 `codex` 기본값을 따릅니다(설치 프로그램이 scope 플래그를 넘기지 않음).
</details>

<details>
<summary><b>Gemini CLI</b></summary>

Gemini에는 `mcp add` 명령이 없어 Mocka가 설정을 직접 작성합니다. 아래 블록을 `~/.gemini/settings.json`에 추가하세요(설치 프로그램이 기존 키를 보존하면서 병합해 줍니다):

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

**User scope만 지원** — Gemini는 여기서 project scope를 지원하지 않습니다.
</details>

### 확인

등록 후 Mocka를 실행하고 에이전트에게 `get_server_status` 호출을 요청하세요(또는 Claude Code에서 `claude mcp list`로 `mocka`가 보이는지 확인). 정상이면 `running: true`, mock 포트, 로컬 네트워크 IP가 응답됩니다.

---

## 도구 레퍼런스 (43개)

모든 도구는 `mcp__mocka__<name>` 형태로 노출됩니다. 아래에서 참조하는 ID는 대응하는 `list_*` / `get_*` / `create_*` 도구가 반환합니다.

### Endpoints (6)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `list_endpoints` | 모든 endpoint와 변형을 나열 | — |
| `get_endpoint` | endpoint 1개 조회(변형 + match rule) | `id` |
| `create_endpoint` | endpoint 생성, 기본 200 변형 자동 생성 | `method`, `path`, `name?`, `collectionId?` |
| `update_endpoint` | method/path/name/`sequenceMode`/`isEnabled` 수정 | `id`, …선택 |
| `delete_endpoint` | endpoint와 모든 변형 삭제 | `id` |
| `toggle_endpoint` | 활성/비활성 토글(비활성 → 404) | `id` |

> `method` ∈ `GET｜POST｜PUT｜DELETE｜PATCH`. `sequenceMode` ∈ `off｜on`(`on`은 활성 preset 사용).

### Response Variants (4)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `add_variant` | 변형 추가(standard, 또는 `presetId`로 preset에) | `endpointId?`, `presetId?`, `statusCode?`, `description?` |
| `update_variant` | body·header·delay·memo·match rule·dataset binding·preset 연결 수정 | `id`, …선택 |
| `delete_variant` | 변형 삭제 | `id` |
| `reorder_variants` | endpoint 변형 한 그룹 재정렬(standard, 또는 preset 하나) | `endpointId`, `orderedIds` |
| `set_active_variant` | 기본 변형 설정(standard 모드에서 매칭 실패 시 사용) | `endpointId`, `variantId`(nullable) |

> `update_variant.body`는 템플릿 헬퍼(`{{$body 'field'}}` 등)와 `{{$dataset}}` 토큰을 지원합니다. `matchRules`·`datasetBinding`은 객체입니다 — 구조는 [사용 가이드](../usage/README.ko.md) 참고.

### Sequences & Presets (8)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `list_presets` | endpoint의 sequence preset 나열 | `endpointId` |
| `create_preset` | preset 생성(첫 preset 자동 활성화) | `endpointId`, `name?`, `mode?` |
| `update_preset` | 이름/모드 변경 | `presetId`, `name?`, `mode?` |
| `delete_preset` | preset과 변형 삭제 | `presetId` |
| `set_active_preset` | endpoint의 preset 활성화 | `endpointId`, `presetId` |
| `get_sequence_state` | 현재 인덱스·모드·활성 preset | `endpointId` |
| `reset_sequence` | 카운터를 첫 변형으로 초기화 | `endpointId`, `presetId?` |
| `reset_all_sequences` | 모든 endpoint 카운터 초기화 | — |

> `mode` ∈ `sequential`(마지막 변형에서 고정) ｜ `loop`(처음으로 순환).

### Environments (5)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `list_environments` | environment와 변수 나열 | — |
| `create_environment` | environment 생성(첫 environment 자동 활성화) | `name` |
| `update_environment` | 이름/변수 설정(body의 `{{varName}}`) | `id`, `name?`, `variables?` |
| `delete_environment` | environment 삭제 | `id` |
| `set_active_environment` | 1개 활성화, 또는 `null`로 전체 비활성화 | `id`(nullable) |

### Collections (8)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `list_collections` | collection과 endpoint ID 나열 | — |
| `create_collection` | collection 생성 | `name` |
| `update_collection` | collection 이름 변경 | `id`, `name` |
| `delete_collection` | collection 삭제(endpoint는 유지, 그룹만 해제) | `id` |
| `reorder_collections` | 전체 ID 순서로 재정렬 | `orderedIds` |
| `reorder_collection_endpoints` | collection 내 endpoint 재정렬 | `collectionId`, `orderedEndpointIds` |
| `move_endpoint` | endpoint를 다른 collection으로 이동 | `endpointId`, `fromCollectionId`, `toCollectionId`, `sortOrder?` |
| `remove_endpoint_from_collection` | 삭제 없이 그룹만 해제 | `collectionId`, `endpointId` |

### Datasets (5)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `list_datasets` | 공유 dataset 나열(id·name·keyField·records) | — |
| `get_dataset` | dataset 1개 조회(모든 record 포함) | `id` |
| `create_dataset` | 공유 dataset 생성 | `name`, `keyField`, `records?` |
| `update_dataset` | name/keyField/records 수정(records는 전체 교체) | `id`, …선택 |
| `delete_dataset` | dataset 삭제 | `id` |

### Import / Export (2)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `export_data` | endpoint + collection을 JSON으로 export(필터 가능) | `collectionIds?` |
| `import_data` | export된 JSON을 conflict policy로 import | `data`, `conflictPolicy?` |

> `conflictPolicy` ∈ `overwrite｜skip｜merge`(기본 `skip`). Dataset, dataset binding, environment, history는 export/import에 **포함되지 않습니다.**

### History (2)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `get_history` | 최근 요청 로그(method·path·status·timestamp) | `method?`, `search?`, `limit?`, `offset?` |
| `clear_history` | 모든 요청 기록 삭제 | — |

### Server (2)

| 도구 | 설명 | 주요 파라미터 |
|------|------|---------------|
| `get_server_status` | 실행 상태·현재 mock 포트·로컬 IP | — |
| `restart_server` | mock 리스너 재시작(포트 변경 후) | — |

---

## 예시 에이전트 워크플로

자연어 프롬프트와 에이전트가 실행하는 일반적인 도구 시퀀스입니다.

**1. "로그인 플로우 mock: 첫 호출 401, 다음 200."**
```
create_endpoint(POST /api/login)
create_preset(endpointId, name="Token Expired Flow", mode="sequential")
add_variant(presetId, statusCode=401, description="Unauthorized")
add_variant(presetId, statusCode=200, description="OK")
update_endpoint(id, sequenceMode="on")        # sequence 모드 활성화
```

**2. "하나의 dataset으로 users 리스트 + 상세 구성."**
```
create_dataset(name="users", keyField="id", records=[…])
create_endpoint(GET /api/users)        → add_variant + update_variant(datasetBinding {mode:"list"})
create_endpoint(GET /api/users/:id)    → add_variant + update_variant(datasetBinding {mode:"detail", keySource:{from:"path", field:"id"}})
```

**3. "내 앱이 뭘 호출했는지 보여줘."**
```
get_history(limit=50)                  # 최근 요청·상태·해석된 응답 본문 확인
```

---

## 문제 해결

| 증상 | 원인 / 해결 |
|------|-------------|
| `Mocka server is not reachable …` | admin 서버 미실행. `mocka start`(또는 `mocka start -d`) 실행. |
| 도구가 잘못된 포트를 가리킴 | `MOCKA_ADMIN_URL` 또는 `ADMIN_PORT` 설정, 혹은 `mocka config admin_port=…` 수정. |
| `Claude Code CLI not found` | Claude Code 설치 후 `claude`가 `PATH`에 있는지 확인. |
| `Codex CLI not found` | `npm install -g @openai/codex`. |
| 에이전트가 도구를 못 봄 | `mocka mcp install` 재실행 후 AI 클라이언트를 재시작해 MCP 서버를 다시 로드. |
| mock 포트 변경 후에도 404 | `restart_server`(또는 `mocka restart`)로 mock 리스너 재바인딩. |

> 보고되는 MCP 서버 버전은 `1.0.0`입니다(Mocka 릴리스 버전과 별개).

---

## 함께 보기

- [사용 가이드](../usage/README.ko.md) — 개념, 매칭 규칙, 템플릿, 그리고 도구가 따르는 전체 응답 해석 순서.
- [메인 README](../README.ko.md) — 설치, CLI 명령어, 아키텍처.
