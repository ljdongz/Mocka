# Mocka 사용하기

**현실적인 mock을 만들기 위한 실전 가이드 — 개념, 매칭, 템플릿, 그리고 이 모두를 묶는 응답 해석 순서.**

[English](README.md) · [← README로 돌아가기](../README.ko.md) · [MCP 가이드](../mcp/README.ko.md)

---

## 멘탈 모델

```
Collection  ──그룹화──►  Endpoint  ──다수 보유──►  Response Variant
 (UI 전용)               (method+path)            (status·body·header·rule)

여러 endpoint가 공유:   Dataset   ·   Environment   ·   Sequence Preset
```

- **Collection**은 UI 폴더입니다. 매칭에 전혀 관여하지 않습니다.
- **Endpoint**는 라우트 — 고유한 `method` + `path`입니다.
- **Response Variant**는 가능한 응답 하나입니다. 한 endpoint는 여러 개를 가질 수 있고, Mocka는 요청마다 정확히 하나를 선택합니다.
- **Dataset**, **Environment**, **Sequence Preset**은 변형이 끌어다 쓰는 횡단 기능입니다.

가장 알아둘 가치가 큰 것은 **[Mocka가 어떤 변형을 반환할지 결정하는 방식](#응답-해석-순서)**입니다 — 이 섹션만 한 번 읽으면 "왜 저게 반환됐지?" 하는 대부분의 의외 동작이 사라집니다.

---

## 빠른 시작

1. Mocka 실행 후 관리 UI 접속: `mocka start` → <http://localhost:4649>
2. **Collection 생성**(선택, 정리용).
3. **Endpoint 추가** — method·path·status·header·body 설정.
4. **Mock 서버 호출**(포트 **4650**):

```bash
curl http://localhost:4650/api/users
curl -X POST http://localhost:4650/api/users -H 'Content-Type: application/json' -d '{"name":"John"}'
curl http://localhost:4650/api/users/42          # /api/users/:id 에 매칭
```

> [!TIP]
> Mock 서버는 **로컬 네트워크 IP**(시작 시 콘솔에 표시)에서도 수신하므로, 같은 Wi-Fi의 휴대폰·다른 기기에서 직접 호출할 수 있습니다 — 예: `curl http://192.168.0.12:4650/api/users`. 모바일 앱 테스트에 유용합니다.

---

## 개념

### Collections

UI에서 endpoint를 그룹으로 묶는 이름 있는 폴더입니다. Collection은 이름과 정렬된 endpoint 목록을 가지며, 재정렬하거나 endpoint를 끌어다 옮길 수 있습니다.

> [!NOTE]
> Collection은 **순수하게 정리용**입니다. 라우트 매칭이나 어떤 응답이 반환될지에 전혀 영향을 주지 않습니다. Collection을 삭제해도 그 안의 endpoint는 **삭제되지 않고** 그룹만 해제됩니다.

### Endpoints

**HTTP method + path**로 식별되는 mock 라우트입니다. 유효한 method: `GET, POST, PUT, DELETE, PATCH`.

- **유일성:** `method + path`는 고유해야 합니다(충돌 시 `400 already exists`).
- **정규화:** 끝의 슬래시는 제거되고(`/users/` → `/users`), 루트 `/`는 유지됩니다.
- **활성/비활성:** 비활성 endpoint는 라우트 테이블에서 완전히 제거되어 **404**를 반환합니다(503 아님). UI 스위치 또는 `toggle_endpoint`로 토글.
- 설정된 요청 body 타입·query param·request header는 **문서/UI 보조 정보**일 뿐 매칭을 **제한하지 않습니다.** 해당 method+path로 들어온 어떤 요청이든 매칭됩니다.

### Response Variants

실제 응답입니다. 각 변형은 `statusCode`, `body`(템플릿 문자열), `headers`(JSON 문자열), 선택적 `delay`, 선택적 `matchRules`, 선택적 `datasetBinding`, 그리고 `description` 라벨을 가집니다.

변형은 두 **pool** 중 하나에 속합니다:

- **standard** — 일반 변형.
- **sequence** — Sequence Preset에 연결된 변형.

이 pool은 한 응답에서 절대 섞이지 않습니다. 어느 pool을 쓸지는 endpoint의 sequence 모드에 따라 결정됩니다([해석 순서](#응답-해석-순서) 참고). 각 endpoint는 **active variant**(standard 모드에서 다른 게 매칭되지 않을 때의 기본 선택)를 가집니다.

> [!NOTE]
> `headers`는 JSON 문자열로 저장되어 요청 시 파싱됩니다. **잘못된 JSON은 조용히 무시됩니다**(header 미적용). active variant를 삭제하면 남은 첫 변형이 자동으로 active가 됩니다.

### 조건부 매칭 (Match Rules)

들어온 요청이 특정 조건일 때만 변형이 응답하도록 만듭니다. 변형의 `matchRules`는 네 개의 배열과 결합자를 가집니다:

```jsonc
{
  "bodyRules":      [{ "field": "user.role", "operator": "equals", "value": "admin" }],
  "headerRules":    [{ "field": "x-api-key", "operator": "equals", "value": "secret" }],
  "queryParamRules":[{ "field": "debug",     "operator": "equals", "value": "true" }],
  "pathParamRules": [{ "field": "id",        "operator": "equals", "value": "1" }],
  "combineWith": "AND"   // 또는 "OR"
}
```

- **연산자:** `equals`, `contains`, `startsWith`, `endsWith`, `regex`(컴파일 실패하는 정규식은 `false`로 평가).
- **`bodyRules`**는 `field`를 파싱된 JSON body의 **dot-path**로 읽습니다(`user.role` → `body.user.role`). 없는 필드는 룰 실패.
- **`headerRules`**는 **대소문자 무시**(field를 소문자화). query/path 룰은 정확한 키로 매칭.
- **`combineWith`:** `AND` = 모든 룰 통과 · `OR` = 하나라도 통과.

> [!WARNING]
> **빈 룰 셋은 절대 매칭되지 않습니다**(`false` 반환). 룰이 없는 변형은 매칭이 아니라 active/fallback 변형으로만 도달할 수 있습니다. 또한 조건부 매칭은 사실상 **standard 모드 전용**입니다: sequence 모드에서는 카운터가 항상 변형을 반환하므로 match rule이 평가되지 않습니다. header 오버라이드(아래)도 match rule보다 우선합니다.

### 동적 템플릿

응답 body는 요청 시 **고정된 4단계 패스**로 해석되는 템플릿입니다:

| # | 패스 | 문법 | 예시 |
|---|------|------|------|
| 1 | Environment 변수 | `{{varName}}` | `{{baseUrl}}` |
| 2 | 요청 컨텍스트 헬퍼 | `{{$helper 'arg' 'default'}}` | `{{$body 'user.name' 'anon'}}` |
| 3 | 동적 변수 | `{{$variable}}` | `{{$randomUUID}}` |
| 4 | Dataset 토큰 | `{{$dataset}}` | `{{$dataset}}` |

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
> 순서가 중요합니다. env 치환이 먼저이므로, `{{$randomUUID}}`를 *포함한* env 값은 패스 3에서 확장됩니다. 알 수 없는 `{{$foo}}` 토큰은 출력에 **그대로** 남습니다. **응답 header는 패스 1만 받습니다** — header에서는 env 변수는 동작하지만 헬퍼·동적 변수·dataset은 동작하지 않습니다.

#### 내장 동적 변수 (33개)

`{{$randomUUID}}` · `{{$guid}}`(별칭) · `{{$randomFirstName}}` · `{{$randomLastName}}` · `{{$randomFullName}}` · `{{$randomUserName}}` · `{{$randomEmail}}` · `{{$randomUrl}}` · `{{$randomIP}}` · `{{$randomIPv6}}` · `{{$randomSlug}}` · `{{$randomHexColor}}` · `{{$randomInt}}`(0–9999) · `{{$randomFloat}}`(0–1000, 소수 2자리) · `{{$randomBoolean}}` · `{{$timestamp}}`(Unix 초) · `{{$isoTimestamp}}` · `{{$randomDate}}` · `{{$randomDatetime}}` · `{{$randomCity}}` · `{{$randomCountry}}` · `{{$randomStreetAddress}}` · `{{$randomZipCode}}` · `{{$randomLatitude}}` · `{{$randomLongitude}}` · `{{$randomCompanyName}}` · `{{$randomPhoneNumber}}` · `{{$randomJobTitle}}` · `{{$randomLoremSentence}}` · `{{$randomLoremParagraph}}` · `{{$randomWord}}` · `{{$randomImageUrl}}` · `{{$randomAvatarUrl}}`

#### 요청 컨텍스트 헬퍼

| 헬퍼 | 반환 |
|------|------|
| `{{$body 'dot.path' 'default'}}` | JSON body의 중첩 값(객체는 JSON 문자열화) |
| `{{$queryParams 'key' 'default'}}` | 정확한 키의 query string 값 |
| `{{$pathParams 'name' 'default'}}` | 캡처된 path parameter(`:name` / `{name}`) |
| `{{$pathSegments 'index' 'default'}}` | 0-기반 숫자 인덱스 위치의 raw URL 세그먼트 |
| `{{$headers 'Header-Name' 'default'}}` | request header(대소문자 무시) |

### Path Parameter

`:name` **또는** `{name}`으로 파라미터를 선언합니다. 캡처된 세그먼트는 match rule(`pathParamRules`), dataset `keySource`, `{{$pathParams 'name'}}` 헬퍼로 흘러갑니다.

```
경로: /users/:id     요청: GET /users/42     →  pathParams { id: "42" }
```

> [!NOTE]
> **구체성(specificity):** 정확한 정적 라우트가 항상 파라미터 라우트를 이깁니다. 파라미터 라우트끼리는 **정적 세그먼트가 더 많은** 쪽이 이깁니다(구체성 = 리터럴 세그먼트 수, 등록 순서 *아님*). 파라미터는 슬래시 없는 **단일** 세그먼트에 매칭되며 `/`를 넘지 않습니다.

### Dataset & `{{$dataset}}`

**Dataset**은 `keyField`를 가진 재사용 가능한 record 배열입니다. 변형이 여기에 바인딩하여 `{{$dataset}}` 토큰으로 주입하며, 두 모드 중 하나로 동작합니다:

- **list** — 배열 전체 반환(선택적으로 record별 필드 부분집합으로 **projection**).
- **detail** — 키로 단일 record 조회. 키는 `keySource: { from: "body" | "path" | "query", field }`에서 가져옵니다(기본값은 `keyField` 이름의 body 필드).

```jsonc
// Dataset "users", keyField "id", records [{id:1,name:"A"}, {id:2,name:"B"}]

// LIST 변형, GET /users      body: { "users": {{$dataset}} }
//   binding: { mode: "list" }                      → 모든 record
//   binding: { mode: "list", projection: ["id"] }  → [{id:1},{id:2}]

// DETAIL 변형, GET /users/:id  body: { "user": {{$dataset}} }
//   binding: { mode: "detail", keySource: { from: "path", field: "id" } }
//   GET /users/2 → { "user": { "id": 2, "name": "B" } }
```

> [!WARNING]
> `{{$dataset}}`은 **마지막에** 해석되며, dataset이 없거나 매칭 record가 없으면 리터럴 `null`이 됩니다. Dataset과 dataset binding은 export/import에 **포함되지 않습니다** — export 후 다시 import하면 **모든 dataset 연결이 사라집니다.** `records`는 JSON 배열이어야 합니다.

### Environment & 변수

**Environment**는 이름 있는 `key → value` 문자열 변수 집합입니다. 한 번에 정확히 **하나**의 environment만 활성이며, 그 변수가 `{{varName}}` 자리표시자를 채웁니다.

```
활성 env { "baseUrl": "https://api.test", "token": "abc" }
Body  { "url": "{{baseUrl}}/v1", "auth": "{{token}}" }
```

> [!NOTE]
> Environment 치환은 **가장 먼저**(패스 1) 실행되며, 응답 header에 적용되는 **유일한** 해석입니다. `{{$...}}`($ 접두)는 결코 env 변수로 취급되지 않습니다. Environment는 export/import되지 **않습니다.**

### Sequence Preset (sequential vs loop)

**Sequence Preset**은 endpoint에 붙는 이름 있는 정렬된 변형 목록으로, **호출할 때마다 다른 변형을 반환**합니다 — 다단계 플로우(`pending → processing → done`, `401 → 200`)에 안성맞춤입니다.

- sequence 모드를 켜고(`sequenceMode: "on"`) 활성 preset을 설정합니다.
- **`sequential`** — 진행하다가 **마지막 변형에서 영구히 고정**됩니다.
- **`loop`** — 마지막 다음에 처음으로 순환합니다.

```
Preset "checkout"(sequential): [202 Accepted, 200 Processing, 200 Complete]
  호출 1 → 202   호출 2 → 200 Processing   호출 3 이후 → 200 Complete
```

> [!WARNING]
> 카운터는 **인메모리**(활성 preset 기준)이며 **서버 재시작 시 초기화**됩니다. `reset_sequence` / `reset_all_sequences`로 초기화하세요. sequence 모드는 **조건부 매칭을 억제**합니다. header 오버라이드는 여전히 이기며 카운터를 **전진시키지 않습니다.**

### 응답 지연 (Response Delay)

응답 전 인위적 지연. **값의 단위는 초(SECONDS)입니다.**

- 요청별: header `x-mock-response-delay: 2.5`
- 변형별: `variant.delay`
- 전역 기본값: settings `responseDelay`

우선순위: header → `variant.delay` → 전역.

> [!WARNING]
> 밀리초가 **아니라 초**입니다 — 흔한 함정. 그리고 `variant.delay === 0`은 전역 기본값을 **이깁니다**(전역으로 넘어가는 건 `null`뿐). 즉 `0`으로 설정된 변형은 자기 자신에 대해 전역 지연을 끕니다.

### Header 오버라이드 (`x-mock-*` 요청 헤더)

세 개의 특수 요청 헤더로 **호출자**가 서버 설정 변경 없이 응답을 고를 수 있습니다 — 클라이언트 주도 테스트 시나리오에 이상적입니다:

| 헤더 | 효과 |
|------|------|
| `x-mock-response-code: 500` | 해당 status code의 첫 변형 반환 |
| `x-mock-response-name: not found` | **description**(소문자화)이 일치하는 첫 변형 반환 |
| `x-mock-response-delay: 2.5` | 지연 오버라이드, 단위 초 |

```bash
curl http://localhost:4650/users -H 'x-mock-response-code: 500'
curl http://localhost:4650/users -H 'x-mock-response-name: error' -H 'x-mock-response-delay: 2'
```

> [!NOTE]
> `x-mock-response-name`은 변형의 **description**에 매칭됩니다(별도의 "name" 필드 없음). 오버라이드는 sequence preset과 match rule을 이기며, sequence 카운터를 **전진시키지 않습니다.** 요청한 code/name에 맞는 변형이 없으면 해석은 그냥 일반 체인으로 넘어갑니다(에러 아님).

### Import / Export

endpoint + collection을 버전이 있는 JSON 문서(현재 **버전 3**)로 export하고, conflict policy로 다시 import합니다:

- **skip**(기본) — `method+path` 충돌 시 기존 endpoint 유지.
- **overwrite** — 삭제 후 재생성(collection 소속은 보존).
- **merge** — `statusCode:description` 키가 새로운 변형만 추가.

> [!WARNING]
> Export/import는 endpoint, 그 변형(match rule 포함), collection만 다룹니다. **Dataset, dataset binding, environment, history는 export되지 않습니다.** 잘못된 `conflictPolicy`는 조용히 `skip`으로 기본 처리됩니다.

### 요청 기록 (History)

mock 서버로의 모든 요청 — **매칭되지 않은 404 포함** — 이 method, 전체 path(query string 포함), status, 요청 body/param, request header, 그리고 **완전히 해석된 응답 body**(템플릿이 이미 확장됨)와 함께 기록됩니다. 관리 UI의 요청 로그나 `get_history`로 조회하고, `clear_history`로 삭제합니다.

> [!NOTE]
> 로그가 *렌더링된* 응답 body를 저장하므로, 동적 템플릿과 dataset 출력을 디버깅하는 가장 빠른 방법입니다. History는 앱 내부 전용이며 export/import 대상이 아닙니다.

---

## 응답 해석 순서

Mocka가 들어온 요청을 응답으로 바꾸는 방식입니다. 이걸 이해하면 거의 모든 "왜 저 응답?" 질문이 풀립니다.

```
LAYER 1 · 라우트 매칭
  └─ 정확한 "METHOD /path" 키  →  없으면 파라미터 라우트를 구체성순(정적 세그먼트 많은 순)으로
  └─ 매칭 없음 → 404 (그래도 기록됨)

LAYER 2 · 변형 pool 선택
  └─ sequenceMode "on" + 활성 preset → pool = 해당 preset의 변형
  └─ 그 외                            → pool = standard 변형

LAYER 3 · pool에서 하나 선택, 엄격한 순서로:
  1. x-mock-response-code 헤더   → 해당 status code의 첫 변형             ┐ 오버라이드
  2. x-mock-response-name 헤더   → description이 일치하는 첫 변형          ┘ (카운터 전진 없음)
  3. sequence 모드               → 카운터로 다음 변형(sequential 고정 / loop 순환)
  4. 조건부 match rule           → matchRules를 만족하는 첫 변형(AND/OR; 빈 룰은 매칭 안 됨)
  5. fallback                    → endpoint.activeVariant, 없으면 첫 변형

선택 후:
  지연 적용(header > variant.delay ?? 전역, 단위 초)
  → body 템플릿(env → 헬퍼 → 동적 → dataset)
  → header(env 변수만)
  → 전송 + history 기록
```

**핵심 결과**

- **header 오버라이드(1–2)가 모든 것을 이기며** sequence 카운터를 움직이지 않습니다.
- **sequence 모드에서는 3단계가 항상 변형을 반환**하므로 4–5단계에 도달하지 못합니다. 그래서 **조건부 매칭은 standard 모드에서만 동작**합니다.
- 매칭된 라우트인데 pool에 변형이 **하나도 없으면** `500 No response variant configured`를 반환합니다.
- header는 오직 environment 변수 치환만 받습니다 — 헬퍼·동적 변수·dataset은 절대 받지 않습니다.

---

## 함께 보기

- [MCP 가이드](../mcp/README.ko.md) — 위의 모든 것을 AI 에이전트로 조작(43개 도구).
- [메인 README](../README.ko.md) — 설치, CLI 명령어, 아키텍처.
