# Mocka-stomp 설계

- 작성일: 2026-09-15
- 상태: 승인 대기
- 기반: Mocka v3.2.1 포크

## 1. 배경

Mocka는 HTTP mock 서버다. 소켓 통신은 커버하지 못한다.

Mocka에는 한때 WebSocket mock 기능이 있었으나 v3.1.0(커밋 `14697c2`)에서 전량 제거됐다. 제거 사유는 커밋 메시지에 그대로 남아 있다.

> It is a protocol-agnostic raw-WebSocket mock and cannot usefully serve STOMP/SockJS backends, which was its main intended use here.

즉 실패 원인은 배치나 구조가 아니라 **프로토콜 의미론의 부재**였다. 구 WS mock은 `path → 응답 프레임`이라는 HTTP식 요청/응답 모델이었고, STOMP의 핵심인 destination·구독·브로드캐스트·하트비트 개념이 아예 없었다.

Mocka-stomp는 같은 목표를 프로토콜을 이해하는 방식으로 다시 푼다.

## 2. 목표

### 합격 기준 (단일 게이트)

**pickle-ios 앱 코드를 한 줄도 수정하지 않고, 소켓 URL만 Mocka-stomp로 바꿔서 connect → subscribe → 메시지 수신이 동작한다.**

기능 목록이 아니라 이 문장이 성공 판정 기준이다. 아래 모든 기능은 여기에 종속된다.

### 부수 목표

1. 내가 보낸 SEND가 브로드캐스트로 되돌아오는 흐름을 mock으로 재현
2. Mocka UI/MCP에서 임의 메시지를 구독자에게 직접 발사
3. 연결 실패·좀비 소켓·서버 에러를 주입해 클라이언트 재연결 로직 검증
4. 프로젝트마다 다른 연결 경로와 destination 집합을 격리해서 관리

### 전제

1. **HTTP mock 기능은 그대로 유지한다.** 앱이 HTTP와 소켓을 함께 쓰므로 한 도구에 있는 편이 낫고, 제거는 작업만 생기고 이득이 없다.
2. **클라이언트는 2종이다** — 환자용 앱(`x-client-type: APP`, `2512.pickle-ios`)과 병원 앱(`HOSPITAL_APP`, `2606.pickcl-hosapp`). 병원 앱은 아직 소켓 코드가 없지만 도입 예정이므로 **처음부터 클라이언트 종류별 분기를 지원한다**(§7.5).
3. **SockJS는 쓰지 않는다.** 서버가 `withSockJS()`를 켜지 않기로 확인됐다. raw WebSocket 전용으로 확정한다.

### 비목표 (§14에 근거)

SockJS, STOMP 트랜잭션, 수동 ACK/NACK, 메시지 영속화, 클러스터링.

## 3. 조사 결과 — 대상 클라이언트 와이어 스펙

`2512.pickle-ios/Projects/Core/CoreNetwork`에 자체 구현 STOMP 클라이언트가 이미 존재한다. 이것이 1차 검증 대상이며, mock의 동작 스펙은 여기서 역산한다.

| 항목 | 값 | 출처 |
|---|---|---|
| 전송 | raw WebSocket, `URLSessionWebSocketTask`, 텍스트 프레임 | `Core/WebSocketTransport.swift:25` |
| SockJS | **미지원** — 쓰면 못 붙는다고 코드 주석에 명시 | `Interface/StompClient.swift:147` |
| URL | `{baseURL}/api/app/ws/chat` (스킴 ws/wss로 치환) | `StompConfiguration.init` |
| STOMP 버전 | `accept-version: 1.2` | `connectHeaders` |
| CONNECT 필수 헤더 | `Authorization`, `accept-version`, `heart-beat`, `x-client-type`, `x-client-version`, `x-device-id`, `host` | `connectHeaders` |
| 하트비트 | `10000,10000` 기본. 수신 두절 시 좀비 판정 후 끊음 | `StompClientImpl.checkHeartbeat` |
| 하트비트 프레임 | `"\n"` 문자열 | `WebSocketTransport.sendHeartbeat` |
| MESSAGE 라우팅 | `subscription` 헤더 기준. `destination` 헤더는 라우팅에 안 씀 | `StompClientImpl:281` |
| ACK 모드 | `auto` 고정 | `StompClientImpl:170` |
| SEND | `content-length` 항상 명시 | `StompClientImpl:200` |
| RECEIPT | 수신 시 로깅만 | `StompClientImpl:257` |
| 실사용 destination | `/app/rooms/{id}/message`(SEND), `/topic/rooms/{id}`(구독), `/user/queue/inbox`(구독) | `StompClient.swift:236,240` |

병원 앱(`2606.pickcl-hosapp`)은 현재 소켓 코드가 없다. 도입 시 `CoreNetwork`를 공유할지 별도 구현할지는 미정이지만, mock 입장에서 달라지는 것은 `x-client-type` 값 하나뿐이다. 연결 경로와 destination이 다르면 Connection을 하나 더 만든다.

클라이언트가 모델링한 끊김 사유 `StompDisconnectReason` 5종(`rejected`, `serverError`, `heartbeatTimeout`, `transportFailure`, `protocolViolation`)은 §10 실패 주입 기능과 1:1 대응한다. 클라이언트가 이미 구분해 놓았으므로 주입만 하면 전 경로를 테스트할 수 있다.

## 4. 아키텍처

```
┌──────────────────────────────────────────────────────┐
│  Browser (React SPA)                                  │
│  사이드바: HTTP 엔드포인트 | STOMP 커넥션             │
└──────────┬───────────────────────────────────────────┘
           │ REST + WebSocket(admin live update)
           ▼
┌──────────────────────┐   ┌───────────────────────────┐
│  Admin API (:4649)   │   │  Mock Server (:4650)       │
│  - Connection CRUD   │   │  - HTTP mock (기존)        │
│  - Destination CRUD  │   │  - STOMP over WS (신규)    │
│  - push / 실패 주입  │──▶│    ├ 프레임 코덱           │
│  - 세션 조회         │   │    ├ 세션 레지스트리       │
└──────────┬───────────┘   │    ├ 브로커               │
           │               │    └ 발사 엔진            │
           ▼               └───────────────────────────┘
    ┌──────────────┐
    │  SQLite DB   │
    └──────────────┘
```

Mocka의 2프로세스 구조(Admin :4649 / Mock :4650)를 그대로 쓴다. STOMP는 Mock 서버에 WebSocket 업그레이드 경로로 붙는다. Admin API는 설정 CRUD와 **런타임 조작**(push, 실패 주입, 세션 강제 종료)을 담당하며, 런타임 조작은 in-process 호출로 브로커에 전달된다.

### 모듈 경계

| 모듈 | 책임 | 의존 |
|---|---|---|
| `stomp/frame.ts` | 프레임 인코딩/누적 디코딩. 순수 | 없음 |
| `stomp/destination-matcher.ts` | destination 패턴 매칭. 순수 | 없음 |
| `stomp/broker.ts` | 구독 레지스트리, deliver(destination, frame) | frame, matcher |
| `stomp/session.ts` | 세션 수명, 하트비트 타이머, 정리 | frame, broker |
| `stomp/fire.ts` | variant → 실제 프레임 해석. 순수 | 템플릿, Dataset |
| `stomp/handler.ts` | 프레임별 처리. 위 모듈 조립 | 전부 |

`frame`·`destination-matcher`·`fire`는 순수 함수라 소켓 없이 단위 테스트한다.

## 5. 데이터 모델

### 5.1 Connection — 브로커 네임스페이스 경계

연결 경로는 프로젝트마다 다르고(`/api/app/ws/chat`, `/ws-stomp`, `/ws`), 그 아래 destination 집합도 다르다. Connection이 이 경계다.

```ts
export interface StompConnection {
  id: string;
  name: string;
  /** WS 업그레이드를 받을 URL path. 이것이 식별자. 중복 등록 거부 */
  path: string;
  isEnabled: boolean;

  /** CONNECT 처리 정책 */
  connectPolicy: 'accept' | 'validate' | 'reject';
  /** validate: 이 헤더들이 비어 있으면 거절 */
  requiredHeaders: string[];
  /** reject/validate 실패 시 ERROR 프레임의 message 헤더 */
  rejectMessage: string;

  /** CONNECTED에 광고할 heart-beat "sx,sy" (ms). 0이면 해당 방향 없음 */
  heartbeatOutgoing: number;
  heartbeatIncoming: number;
  /** CONNECTED의 version 헤더 */
  stompVersion: string;

  /** 이 커넥션의 모든 발사에 적용되는 기본 지연(ms) */
  defaultDelay: number | null;

  /** 구독자가 0명인 destination으로 발사된 메시지를 보관할 개수.
   *  0이면 드롭(실제 브로커와 동일). 트리거 destination이 아니라
   *  **실제로 발사된 리터럴 destination**별로 집계한다 */
  replayBufferSize: number;

  createdAt: string;
  updatedAt: string;
  destinations?: StompDestination[];
}
```

여러 Connection을 동시에 활성화할 수 있다. path가 다르므로 충돌하지 않는다. A 프로젝트의 `/topic/rooms/*`와 B 프로젝트의 동명 destination은 구독자 집합까지 완전히 별개다.

Import/Export 단위는 Connection 1개다. 프로젝트별 mock 설정을 파일 하나로 주고받는다.

**실제 Spring과의 차이**: 진짜 서버는 `addEndpoint()`가 여러 개여도 브로커는 앱 전역 하나라 destination을 공유한다. mock 도구로서는 프로젝트 격리가 더 중요하므로 Connection마다 끊는다. 한 프로젝트가 WS endpoint 2개 이상을 쓰면서 브로커를 공유해야 하면 Connection에 `brokerGroup` 필드 하나를 추가해 해결한다 — v1에서는 뺀다.

### 5.2 Destination — 트리거 단위

```ts
export type StompTrigger = 'send' | 'subscribe' | 'manual';

export interface StompDestination {
  id: string;
  connectionId: string;
  name: string;

  /** 트리거별 의미:
   *  send      → 클라이언트가 SEND 한 destination 패턴
   *  subscribe → 클라이언트가 SUBSCRIBE 한 destination 패턴
   *  manual    → push 대상 destination (리터럴 권장) */
  pattern: string;
  trigger: StompTrigger;

  isEnabled: boolean;
  activeVariantId: string | null;
  activePresetId: string | null;
  sequenceMode: 'off' | 'on';

  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  variants?: StompMessageVariant[];
  presets?: SequencePreset[];
}
```

### 5.3 MessageVariant — 발사 단위

규칙 1행 = **트리거 × 수신범위 × 페이로드**.

```ts
export type StompScope = 'broadcast' | 'echo' | 'user';
export type StompFireKind = 'message' | 'error' | 'receipt' | 'disconnect';

export interface StompMessageVariant {
  id: string;
  destinationId: string;
  description: string;

  kind: StompFireKind;

  /** kind==='message' 전용. 보낼 목적지 템플릿.
   *  빈 문자열이면 트리거된 destination을 그대로 사용 */
  targetDestination: string;

  /** broadcast: 대상 destination의 모든 구독자
   *  echo:      트리거를 유발한 세션만 (manual 트리거에선 무의미)
   *  user:      해당 세션의 /user 큐로 재작성 */
  scope: StompScope;

  body: string;
  /** MESSAGE 프레임에 얹을 추가 헤더 (JSON 문자열) */
  headers: string;

  delay: number | null;
  /** 값이 있으면 주기 반복 발사 */
  repeatIntervalMs: number | null;
  /** null이면 무한 반복 */
  repeatCount: number | null;

  matchRules: MatchRules | null;
  datasetBinding: DatasetBinding | null;

  variantGroup: 'standard' | 'sequence';
  presetId: string | null;
  memo: string;
  sortOrder: number;
}
```

`MatchRules`, `DatasetBinding`, `SequencePreset`은 Mocka의 기존 타입을 그대로 재사용한다(§12).

### 5.4 구조 대응

| Mocka (HTTP) | Mocka-stomp (STOMP) |
|---|---|
| `Collection` (폴더, 기능 없음) | `StompConnection` (**기능적 부모** — WS path·하트비트·CONNECT 정책 소유) |
| `Endpoint` (method + path) | `StompDestination` (trigger + pattern) |
| `ResponseVariant` | `StompMessageVariant` |
| `SequencePreset` | 동일 타입 재사용 |

사이드바 트리 컴포넌트(`CollectionTree`)는 그대로 재사용한다.

## 6. 런타임 — 세션과 브로커

### 6.1 세션

```ts
interface StompSession {
  id: string;                    // 서버 발급. CONNECTED의 session 헤더
  connectionId: string;
  socket: WebSocket;
  state: 'connecting' | 'connected';
  connectedAt: string;
  /** CONNECT 프레임 헤더 원본. 템플릿과 매칭 규칙에서 참조 */
  clientHeaders: Record<string, string>;
  /** subscriptionId → destination(클라이언트가 보낸 원본) */
  subscriptions: Map<string, string>;
  heartbeat: {
    outgoing: number;            // 협상 결과 (ms)
    incoming: number;
    sendTimer: NodeJS.Timeout | null;
    watchdog: NodeJS.Timeout | null;
    lastRxAt: number;
  };
  /** 주기 발사 타이머. 세션 종료 시 전부 clear */
  timers: Set<NodeJS.Timeout>;
}
```

**세션 정리는 DISCONNECT와 raw close 양쪽에서 동일하게 실행한다.** 구 WS mock의 `intervalMin/intervalMax` 주기 전송이 같은 함정을 안고 있었다 — 죽은 세션의 타이머가 영원히 남는다. 정리 루틴 하나(`teardown`)를 두고 두 경로 모두 여기로 모은다.

### 6.2 브로커

```
connectionId → Array<{ sessionId, subscriptionId, destination }>
```

`deliver(connectionId, destination, frame)`는 그 커넥션의 구독 중 `destination`에 매칭되는 항목을 골라, 각각의 `subscriptionId`를 `subscription` 헤더에 넣은 MESSAGE 프레임을 보낸다. 클라이언트는 `subscription` 헤더로 라우팅하므로 이 값이 정확해야 한다.

구독 destination 자체도 패턴일 수 있다(Spring SimpleBroker는 AntPathMatcher를 쓴다). 매칭은 §6.4의 매처 하나로 통일한다.

### 6.3 `/user` 재작성

클라이언트가 `/user/queue/inbox`를 구독하면 Spring은 내부적으로 `/queue/inbox-user{sessionId}`로 변환하고, MESSAGE의 `destination` 헤더는 원본 `/user/queue/inbox`로 돌려준다. mock도 같은 규칙을 따른다.

`scope: 'user'` 발사는 대상 세션의 user 큐에만 전달된다. `convertAndSendToUser` 대응이다.

### 6.4 destination 패턴 문법

Spring/ActiveMQ 관례를 따른다.

| 토큰 | 의미 | 예 |
|---|---|---|
| `*` | 한 세그먼트 | `/topic/rooms/*` → `/topic/rooms/88` ○, `/topic/rooms/88/read` ✗ |
| `**` | 나머지 전부 | `/topic/**` → `/topic/rooms/88/read` ○ |
| 리터럴 | 정확 일치 | `/user/queue/inbox` |

**세그먼트 분해 규칙 (매처와 템플릿이 공유한다)**: 구분자는 `/`와 `.` 둘 다(Spring은 `/topic/rooms.88` 표기도 흔하다). 선행 `/`로 생기는 빈 세그먼트는 버린다. 따라서 `/topic/rooms/88`과 `/topic/rooms.88`은 똑같이 `["topic", "rooms", "88"]`이다.

Mocka의 `route-path.ts`는 `:param`/`{param}` 문법이라 **다른 문법이다. 재사용하지 않고 별도 매처를 만든다.**

매칭 결과는 템플릿에서 두 가지로 꺼낸다.

- `{{$destCapture N}}` — 패턴의 **N번째 와일드카드** 캡처값. **1-based**. `**`는 남은 전체를 하나로 잡는다. 규칙 작성자가 실제로 의도한 값이므로 이쪽을 쓴다.
- `{{$destSeg N}}` — destination의 **N번째 세그먼트**. **0-based**, 위 분해 규칙 적용.

예: 패턴 `/app/rooms/*/message`에 `/app/rooms/88/message`가 들어오면 `{{$destCapture 1}}` = `88`, `{{$destSeg 2}}` = `88`.

### 6.5 하트비트

**이것이 1순위 실패 지점이다.** 클라이언트는 `incomingHeartbeat: 10000`으로 watchdog을 돌리고, 서버가 아무것도 안 보내면 10초 남짓 뒤 `heartbeatTimeout`으로 연결을 끊는다. 메시지 규칙이 아무리 잘 짜여 있어도 그 전에 죽는다.

협상 규칙(STOMP 1.2):
- 클라이언트가 `heart-beat: cx,cy` 송신, 서버가 `sx,sy` 응답
- 서버 송신 주기 = `cy == 0 || sx == 0 ? 0 : max(sx, cy)`
- 서버 수신 기대 = `cx == 0 || sy == 0 ? 0 : max(cx, sy)`

서버 송신 주기가 정해지면 그 간격으로 `"\n"`을 보낸다. 다른 프레임을 보낸 직후에는 타이머를 리셋해도 되고 안 해도 된다 — 리셋하는 쪽이 트래픽이 적다.

## 7. 발사 규칙

### 7.1 트리거 3종

| 트리거 | 발화 시점 | 용도 |
|---|---|---|
| `send` | 클라이언트 SEND의 destination이 패턴에 매칭 | 보낸 메시지가 브로드캐스트로 돌아오는 흐름 |
| `subscribe` | 클라이언트 SUBSCRIBE 직후 | 초기 스냅샷, 과거 메시지 목록 |
| `manual` | Mocka UI 또는 MCP 호출 | 서버발 알림. 주기 반복 가능 |

`manual` 트리거는 연결이 필요 없다. 관리 API가 브로커에 직접 publish한다. 즉 **"연결 후 구독"은 테스트 대상 클라이언트만 하는 절차**이고, 발사하는 쪽은 밖에서 아무 때나 쏜다.

### 7.2 수신범위 3종

| 범위 | 대상 |
|---|---|
| `broadcast` | 대상 destination의 모든 구독자 |
| `echo` | 트리거를 유발한 세션만 |
| `user` | 대상 세션의 `/user/**` 큐 |

`echo`와 `user`는 "대상 세션"이 필요하다. `send`·`subscribe` 트리거는 그 프레임을 보낸 세션이 자동으로 대상이다. `manual` 트리거는 유발 세션이 없으므로 **push 호출에 `sessionId`를 필수로 받는다**(UI 세션 목록에서 선택, MCP는 인자). `sessionId` 없이 `echo`/`user`로 push하면 400으로 거절한다.

### 7.3 variant 선택

Mocka HTTP mock의 선택 순서를 그대로 따른다.

1. `matchRules`가 있고 매칭되는 variant (선착순)
2. `sequenceMode === 'on'`이면 활성 프리셋의 다음 순번
3. `activeVariantId`
4. 첫 variant

매칭 컨텍스트만 STOMP 것으로 바꾼다.

| Mocka HTTP | Mocka-stomp |
|---|---|
| body | SEND 프레임 body (JSON 파싱, 실패 시 원문) |
| headers | SEND/CONNECT 프레임 헤더 병합 |
| queryParams | (없음) — destination 세그먼트로 대체 |
| pathParams | destination 패턴의 `*` 캡처 |

### 7.4 템플릿

Mocka의 `resolveResponseBody`와 30여 개 변수를 그대로 쓰고, STOMP 컨텍스트 헬퍼를 추가한다.

| 헬퍼 | 값 |
|---|---|
| `{{$sessionId}}` | 발사 대상 세션 id |
| `{{$destination}}` | 트리거된 destination 원본 |
| `{{$destCapture N}}` | 패턴의 N번째 와일드카드 캡처값 (1-based) |
| `{{$destSeg N}}` | destination의 N번째 세그먼트 (0-based) |
| `{{$subscriptionId}}` | 대상 구독 id |
| `{{$stompHeader 'x'}}` | 트리거 프레임의 헤더 |
| `{{$connectHeader 'x'}}` | 세션의 CONNECT 헤더 (예: `x-device-id`) |

`targetDestination`도 템플릿이다: `/topic/rooms/{{$destCapture 1}}`.

주기 반복 발사는 매 틱마다 템플릿을 다시 해석한다(`{{$isoTimestamp}}`가 갱신돼야 한다).

### 7.5 클라이언트 종류별 분기

환자 앱과 병원 앱이 같은 Connection에 붙고 같은 destination을 구독하되 **다른 페이로드**를 받아야 하는 경우를 다룬다. 새 기능이 아니라 기존 두 장치의 조합으로 처리한다.

1. **variant 분기** — `matchRules`의 헤더 룰에 `x-client-type`을 건다. §7.3의 매칭 컨텍스트는 SEND 프레임 헤더와 **세션의 CONNECT 헤더를 병합**하므로, SEND 프레임에 그 헤더가 없어도 CONNECT 때 받은 값으로 매칭된다.
2. **템플릿 분기** — `{{$connectHeader 'x-client-type'}}`로 body나 `targetDestination`에 직접 꽂는다. 예: `/topic/rooms/{{$destCapture 1}}/{{$connectHeader 'x-client-type'}}`.
3. **연결 분리** — 두 앱의 WS 경로 자체가 다르면 Connection을 따로 만든다. destination 집합과 구독자가 완전히 격리된다(§5.1).

`broadcast` 범위로 쏘면 두 종류의 클라이언트가 **모두** 받는다. 한쪽만 보내려면 variant를 나누고 각각 다른 `targetDestination`으로 발사하거나, `scope: 'user'`로 대상 세션을 지정한다.

### 7.6 구독자 0명일 때

기본은 **드롭**이다. 실제 브로커와 같다.

Connection의 `replayBufferSize > 0`이면 발사된 리터럴 destination별로 최근 N개를 보관하고, 이후 그 destination을 구독하는 세션에 순서대로 재생한다. 앱을 켜기 전에 미리 쏴 두고 확인하는 용도다.

UI는 구독자 0명인 destination에 경고를 띄운다 — "왜 안 오지"로 헤매는 시간을 줄이는 게 목적이다.

## 8. 프레임 코덱

```
COMMAND\n
header:value\n
header:value\n
\n
body\0
```

구현 시 반드시 지켜야 할 규칙:

1. **헤더 이스케이프 (STOMP 1.2)**: `\r` → `\\r`, `\n` → `\\n`, `:` → `\\c`, `\\` → `\\\\`. **단 CONNECT/CONNECTED 프레임 헤더는 이스케이프하지 않는다** — 규약이 그렇고, 클라이언트 테스트(`StompFrameTests.swift:55`)가 이를 검증한다.
2. **body 길이**: `content-length` 헤더가 있으면 정확히 그 바이트만큼 읽는다(body에 NULL이 들어갈 수 있다). 없으면 NULL 종료까지 읽는다.
3. **중복 헤더**: 첫 값만 유효(STOMP 규약). 클라이언트 테스트가 검증한다.
4. **누적 디코딩**: WebSocket 메시지 하나에 프레임이 여러 개 실려 올 수 있다. 클라이언트도 그렇게 보낼 수 있으므로 서버 파서도 누적 버퍼 방식이어야 한다.
5. **하트비트 EOL**: 프레임 경계의 `\n` / `\r\n`은 하트비트로 간주하고 건너뛴다.
6. **미완성과 불량을 구분한다.** 디코더의 결과는 세 가지다 — `frames`(완성된 프레임들), `incomplete`(바이트가 더 필요하니 버퍼에 두고 대기), `invalid`(규약 위반, throw). 프레임 하나가 WebSocket 메시지 두 개에 걸쳐 오는 것은 **미완성이지 불량이 아니다.** 이 둘을 섞으면 정상적으로 쪼개져 온 프레임에 대해 연결을 끊게 되고, 클라이언트는 이유 없는 `.protocolViolation`만 받는다.

대략 150줄. Node에 쓸 만한 임베더블 STOMP **브로커**는 없으므로 직접 작성한다. 1·2번이 고전적 버그 지점이므로 round-trip 테스트를 남긴다.

### 서버가 보내는 프레임

| 프레임 | 시점 | 필수 헤더 |
|---|---|---|
| `CONNECTED` | CONNECT 수락 | `version`, `heart-beat`, `session` |
| `MESSAGE` | 발사 | `destination`, `subscription`, `message-id`, `content-length` |
| `RECEIPT` | 클라이언트가 `receipt:` 헤더를 붙였을 때 | `receipt-id` |
| `ERROR` | 거절·주입 | `message`, (선택) body |

`RECEIPT`는 빠뜨리기 쉬운데, 일부 클라이언트가 이걸 기다리며 블록한다. v1에 포함한다.

## 9. 에러 처리

| 상황 | 동작 |
|---|---|
| 알 수 없는 path로 WS 업그레이드 | 404로 업그레이드 거부 |
| Connection이 비활성 | 404 |
| CONNECTED 전에 SUBSCRIBE/SEND | `ERROR` 후 소켓 종료 |
| 파싱 불가 프레임 수신 | `ERROR(message: "malformed frame")` 후 종료 |
| 알 수 없는 COMMAND | `ERROR` 후 종료 |
| SEND 했는데 매칭 규칙 없음 | 무시하고 로그만 기록 (실서버 동작) |
| UNSUBSCRIBE 대상 없음 | 무시 |
| 발사 대상 destination에 구독자 0 | 드롭 또는 replay 버퍼 (§7.5) |

## 10. 실패 주입

HTTP mock에는 필요 없고 소켓 mock에는 존재 이유가 되는 기능이다. 클라이언트 재연결 로직은 실서버로 테스트하기 가장 어렵고 mock으로는 가장 쉽다.

| 주입 | 서버 동작 | 클라이언트 관측 |
|---|---|---|
| CONNECT 거절 | `ERROR` 후 close | `.rejected(message)` |
| ERROR 프레임 | 임의 시점 `ERROR` 송신 | `.serverError(message)` |
| 하트비트 중단 | 송신 타이머만 정지, 소켓은 유지 | `.heartbeatTimeout` (좀비 소켓) |
| 강제 종료 | 지정 close code로 소켓 close | `.transportFailure` |
| 깨진 프레임 | 규약 위반 바이트 송신 | `.protocolViolation` |
| 지연 / 지터 | 발사 전 `delay ± jitter` | (정상 경로 스트레스) |
| 중복 전달 | 같은 프레임 N회 | (멱등성 검증) |

주입 경로 두 가지:
- **variant 종류**로 상시 설정 (`kind: 'error' | 'disconnect'`)
- **런타임 버튼 / MCP 호출**로 즉시 1회 (UI 세션 목록에서 특정 세션 지정)

## 11. 관찰

1. **프레임 로그** — 방향(↑↓), command, destination, 헤더, body, 세션 id, 타임스탬프. Mocka `history` 테이블과 UI를 확장해 쓴다.
2. **세션 인스펙터** — 접속 중인 세션 목록, 각 세션의 CONNECT 헤더·구독 목록·하트비트 상태. 세션별 강제 종료/에러 주입 버튼.
3. **destination 뷰** — 현재 구독자 수. 0명이면 경고.
4. **내장 테스트 클라이언트** — 브라우저에서 직접 CONNECT/SUBSCRIBE/SEND. iOS 빌드 없이 규칙을 확인하는 용도.
5. **Import / Export** — Connection 단위.

## 12. Mocka 재사용

수정 없이 그대로 쓰는 것:

| 자산 | 위치 | 용도 |
|---|---|---|
| `MatchRules` / `matchesRules` | `models/response-variant.ts` | 조건부 variant 선택. 컨텍스트 bag만 교체 |
| `resolveResponseBody` + 템플릿 변수 | `utils/template-*.ts` | body·targetDestination 해석 |
| `Dataset` / `DatasetBinding` | `models/dataset.ts` | 메시지 페이로드 |
| `SequencePreset` + `sequence-counter` | `models/`, `services/` | N번째 메시지마다 다른 응답 |
| admin WebSocket 브로드캐스트 | `plugins/websocket.ts`, `services/domain-events.ts` | UI 실시간 갱신. 제거 커밋이 의도적으로 남겨둔 계층 |
| `CollectionTree`, `CodeEditor`, 모달·토스트 | `client/src/components/` | UI 껍데기 |
| MCP 서버 골격 | `mcp/server.ts`, `mcp/tools/` | 도구 추가만 |
| i18n | `client/src/i18n/` | 키 추가만 |

재사용하지 않는 것: `route-path.ts`(문법이 다름, §6.4).

## 13. MCP 도구

Mocka의 차별점을 그대로 가져온다. AI가 iOS 코드의 `subscribe(destination:)` / `send(destination:)` 호출을 읽고 대응하는 destination 규칙을 자동 생성한다.

설정 계열: `create_stomp_connection`, `create_destination`, `add_message_variant`, `set_active_variant`, `list_connections`.

런타임 계열: `push_message`(destination + body + scope), `list_sessions`, `inject_error`, `disconnect_session`, `stop_heartbeat`.

## 14. 범위 밖 (YAGNI)

| 제외 | 근거 |
|---|---|
| SockJS | 서버가 `withSockJS()`를 켜지 않기로 확인됨. 대상 클라이언트도 raw WebSocket 전용(코드 주석이 "SockJS 서버엔 못 붙는다"고 명시). 뒤집히면 Connection에 `transport` 필드 추가로 확장 |
| 트랜잭션 (BEGIN/COMMIT/ABORT) | 대상 클라이언트 미사용 |
| 수동 ACK/NACK | 클라이언트가 `ack: auto` 고정 |
| 메시지 영속화 | mock은 재시작하면 초기화되는 게 맞다. replay 버퍼는 메모리만 |
| 인증 실제 검증 | 헤더 유무만 본다. 토큰 파싱·검증은 mock의 일이 아니다 |
| 클러스터링 / 다중 인스턴스 | 로컬 도구 |

## 15. 테스트 전략

### 단위 (소켓 없음)

- 프레임 코덱: 인코딩/디코딩 round-trip, 헤더 이스케이프, CONNECT 비이스케이프, `content-length` 유/무, 한 페이로드에 다중 프레임, 중복 헤더 첫 값, 하트비트 EOL 스킵, 깨진 프레임 throw
- destination 매처: `*` 한 세그먼트, `**` 다중, `.` 구분자, 리터럴
- 발사 해석: 트리거 × 범위 × 템플릿 조합, `/user` 재작성
- 하트비트 협상: `cx,cy` × `sx,sy` 조합별 결과

### 통합 (실제 ws 클라이언트)

- CONNECT → CONNECTED → SUBSCRIBE → SEND → MESSAGE 수신
- 2세션 접속 후 broadcast가 양쪽에 도달, echo는 한쪽만
- DISCONNECT / raw close 후 타이머·구독 전부 정리됐는지
- 실패 주입 5종이 각각 의도한 종료 경로를 타는지

### 수용 (합격 기준)

pickle-ios 앱의 `AppConfiguration.baseURL`만 Mocka-stomp로 바꿔 실행 → 연결 유지 30초 이상, 구독 후 UI push 수신, SEND 후 브로드캐스트 수신.

## 16. 구현 순서

각 마일스톤은 게이트를 통과해야 다음으로 넘어간다.

| # | 내용 | 게이트 |
|---|---|---|
| M1 | Mocka 포크(아래 주석 참고), `stomp/` 골격, DB 스키마, Connection CRUD API | 마이그레이션 통과 + 기존 서버 테스트 전부 그린 |
| M2 | 프레임 코덱, CONNECT/CONNECTED, 하트비트, DISCONNECT | **pickle-ios가 붙고 30초 이상 유지** + `CONNECTED`의 `heart-beat` 값이 §6.5 협상표와 일치 |
| M3 | 브로커, SUBSCRIBE/UNSUBSCRIBE, manual push, 3범위 | **관리 API로 쏜 메시지가 앱에 도착** |
| M4 | SEND 트리거, targetDestination 템플릿, MatchRules, Dataset, Sequence | SEND → 브로드캐스트 왕복 |
| M5 | 실패 주입 7종 | 클라이언트 `StompDisconnectReason` 5종 전부 재현 |
| M6 | UI — 사이드바 트리, 에디터, 프레임 로그, 세션 인스펙터, 내장 테스트 클라이언트 | 브라우저만으로 전 시나리오 조작 |
| M7 | MCP 도구 | AI가 iOS 코드 읽고 규칙 생성 |

M1의 포크는 `Mocka-stomp/`에 이 설계 문서가 이미 있어 `git clone`이 바로 안 된다. 임시 디렉터리에 clone 후 `.git`만 옮기고 체크아웃하면 문서는 untracked로 남아 그대로 커밋된다.

```bash
git clone /Users/jeong/Dev/Mocka /tmp/mocka-fork
mv /tmp/mocka-fork/.git /Users/jeong/Dev/Mocka-stomp/
git -C /Users/jeong/Dev/Mocka-stomp checkout -- .
```

M2가 가장 위험하다. 여기서 막히면 나머지는 의미가 없으므로 다른 작업보다 먼저 끝낸다.

## 17. 확정 사항

설계 중 열려 있던 질문 2개는 아래로 닫혔다.

1. **병원 앱도 STOMP를 쓴다** (도입 예정). `x-client-type: HOSPITAL_APP` 분기를 처음부터 지원한다 — §7.5. 새 기능 없이 `matchRules` 헤더 룰과 `{{$connectHeader}}` 조합으로 해결된다.
2. **SockJS는 쓰지 않는다.** 서버가 `withSockJS()`를 켜지 않기로 확인됐다. §14의 제외 근거가 "클라이언트가 못 붙는다"에서 "서버가 안 쓴다"로 더 단단해졌다. 만약 뒤집히면 클라이언트부터 작업이 필요하므로 그때 Connection에 `transport` 필드를 추가해 확장한다.
