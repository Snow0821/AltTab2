# API 계약

`GET /api/config`: 공개 Supabase URL/공개 키, 기능별 설정 여부. 비밀 값은 응답에 포함하지 않습니다.

`POST /api/study`: `Authorization: Bearer <Supabase access token>`, JSON `{ "action": "...", "input": {...} }`. 개인 MCP 토큰은 이 API에 사용할 수 없습니다. 오류는 `{ "error": "사용자용 메시지" }`와 적절한 HTTP 상태입니다. 다른 Origin의 요청은 거부합니다.

| action | input | 결과 |
| --- | --- | --- |
| load | 없음 | courses/questions/history/reviewDue |
| create-course | name, professor, exam | id |
| material | courseId, path, name | 저장한 material id |
| generate | courseId | count, status=pending |
| review | id, status | ok |
| attempt | courseId, requestId(UUID), responses | 재채점한 응시 결과 |
| tokens | 없음 | 해시를 제외한 토큰 목록 |
| create-token | name | token(한 번만 표시), id, expires_at |
| revoke-token | id | ok |

응시의 `responses`는 `{questionId, answer}` 배열입니다. 같은 requestId를 재전송하면 기존 결과를 반환합니다. correct/score를 신뢰하지 않고 승인된 문제로 재계산합니다. course version이 바뀌면 409로 다시 불러오도록 안내합니다.

`POST /api/mcp`: 표준 MCP JSON-RPC, Streamable HTTP. 개인 토큰 또는 Supabase access token을 Bearer 헤더로 전달합니다. GET/SSE는 지원하지 않습니다. 도구와 입력 스키마는 `tools/list`로 조회합니다.

## 파일 구성

- `app.js`, `style.css`: UI와 이벤트
- `core.js`: 샘플 데이터·공통 채점·숙련도 계산
- `client.js`: 브라우저 로그인·Storage·웹 API
- `lib/auth.js`: 인증·오류·출처 검사
- `lib/study.js`: 개인 데이터, PDF, 응시, 문항
- `lib/generate.js`: 교안 근거로 OpenAI 호환 API 호출
- `lib/schema.js`: 웹/MCP 공통 입력 검증
- `api/mcp.js`: SDK 기반 MCP 도구
- `supabase/schema.sql`: 초기 설치 SQL

키나 서비스 연결이 빠졌을 때 샘플을 실제 기록으로 표시하지 않습니다. 개인 계정의 로드가 실패하면 오류와 재시도 버튼을 표시합니다.
