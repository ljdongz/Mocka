# Mocka Roadmap

Postman Mock Server 대비 부족한 핵심 기능을 중심으로 정리한 향후 구현 계획입니다.

---

## 높은 우선순위

### 1. Path Parameter 매칭

현재 `GET /api/users`처럼 정확한 경로만 매칭됩니다. `/users/:id` 같은 경로 변수를 지원하여 `GET /users/123`, `GET /users/456`이 하나의 엔드포인트에 매칭되도록 합니다.

**범위**
- [x] 엔드포인트 경로에 `:param` 또는 `{param}` 문법 지원
- [x] `route-registry.ts`의 매칭 로직을 정확 매칭 → 패턴 매칭으로 확장
- [x] 정확 매칭이 패턴 매칭보다 우선하도록 우선순위 처리
- [x] 캡처된 path parameter 값을 요청 기록(history)에 표시

### 2. Import / Export

모든 Mock 설정(엔드포인트, 응답 변형, 컬렉션)을 JSON 파일로 내보내고 불러올 수 있도록 합니다.

**범위**
- [x] Export: 전체 또는 선택한 컬렉션 단위로 JSON 내보내기
- [x] Import: JSON 파일 업로드로 엔드포인트 일괄 생성
- [x] 중복 엔드포인트(같은 method + path) 처리 정책 (덮어쓰기 / 건너뛰기 / 병합)
- [x] Admin UI에 Import/Export 버튼 추가

---

## 중간~높은 우선순위

### 3. 요청 헤더를 통한 응답 제어

클라이언트가 요청 헤더로 어떤 응답 변형을 받을지 프로그래밍 방식으로 제어할 수 있도록 합니다. 테스트 자동화에서 Admin UI 없이 에러 시나리오를 전환할 때 유용합니다.

**범위**
- `x-mock-response-code: 404` — 특정 상태 코드의 변형 선택
- `x-mock-response-name: "Error"` — description 기준 변형 선택
- `x-mock-response-delay: 3000` — 요청별 지연 시간 오버라이드
- 기존 active variant 방식과 공존 (헤더가 있으면 헤더 우선, 없으면 active variant 사용)

---

## 중간 우선순위

### 4. 동적 응답 변수 (Faker)

응답 본문에 `{{$randomName}}`, `{{$randomEmail}}` 같은 플레이스홀더를 넣으면 요청마다 랜덤 데이터를 생성하여 반환합니다.

**범위**
- 응답 본문 내 `{{$variable}}` 구문 파싱 및 치환
- 기본 제공 변수: `$randomUUID`, `$randomFullName`, `$randomEmail`, `$randomInt`, `$timestamp` 등
- Mock 서버 응답 시점에 치환 수행 (`mock-server.ts`의 handler에서 처리)
- Monaco Editor에서 `{{$` 입력 시 자동완성 지원 (선택)

### 5. 템플릿 헬퍼 (요청 데이터 반영)

들어온 요청의 본문, 쿼리 파라미터, 경로 세그먼트, 헤더 값을 응답에 반영할 수 있도록 합니다.

**범위**
- `{{$body 'username'}}` — 요청 본문의 필드 값
- `{{$queryParams 'page'}}` — 쿼리 파라미터 값
- `{{$pathSegments '1'}}` — URL 경로의 N번째 세그먼트
- `{{$headers 'authorization'}}` — 요청 헤더 값
- 중첩 접근 지원: `{{$body 'user.address.city'}}`
- 기본값 지정: `{{$body 'name' 'guest'}}`

### 6. 요청 본문/헤더 기반 조건부 매칭

같은 method + path에 대해 요청 본문이나 헤더 내용에 따라 다른 응답을 반환할 수 있도록 합니다.

**범위**
- 응답 변형에 매칭 조건(match rules) 추가: body 필드 값, 헤더 값 기준
- 조건이 있는 변형 먼저 평가 → 조건 없는 변형은 fallback으로 사용
- UI에서 조건 편집 지원 (ResponseTab에 조건 설정 섹션 추가)

---

## 낮은 우선순위

### 7. 환경 변수

환경별 변수를 정의하고 응답에서 `{{baseUrl}}`, `{{apiVersion}}` 등을 치환합니다.

**범위**
- 환경(Environment) CRUD: 이름 + key-value 쌍 관리
- 활성 환경 전환 기능
- 응답 본문/헤더에서 `{{variableName}}` 치환
- settings 테이블 또는 별도 테이블에 저장
