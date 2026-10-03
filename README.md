# CramMate · AltTab2

교안 → AI 문항 생성 → 학생 검수 → 퀴즈 → 개념별 복습. 기존 CramMate Sites 초안의 디자인을 유지하며 Vercel용 앱으로 옮겼습니다.

## 실행

```sh
npm ci
cp .env.example .env.local
# .env.local에 프로젝트 설정 입력
npm run dev
```

`http://127.0.0.1:3000`에서 화면과 API를 함께 실행합니다. Node 22, Vite, Supabase, MCP TypeScript SDK v1을 사용합니다. `npm run build`, `npm test`로 확인합니다.

## 연결 설정

Vercel의 기존 `alt-tab2` 프로젝트에서 GitHub `Snow0821/AltTab2` main 배포를 사용합니다. `vercel.json`이 Vite 빌드·dist 출력·Node API를 설정합니다.

1. **Snow0821 조직의 AltTab2용 Supabase 프로젝트** SQL Editor에서 [`supabase/schema.sql`](supabase/schema.sql)을 실행합니다. 기존 테이블을 지우지 않으며 `crammate_` 접두사 테이블 6개, 함수 3개, 비공개 Storage 버킷을 만듭니다. Project Mint는 별도 서비스입니다.
2. Supabase Authentication의 이메일/비밀번호 로그인을 켭니다. Site URL과 Redirect URL에 배포한 서비스 주소를 등록합니다. 이메일 확인이 켜져 있으면 가입 메일 인증 후 로그인합니다.
3. Vercel Settings → Environment Variables에 아래 값을 설정하고 재배포합니다. 이미 지원되는 이름으로 등록되어 있으면 다시 만들 필요가 없습니다.

| 변수 | 용도 | 브라우저 공개 |
| --- | --- | --- |
| `SUPABASE_URL` | 프로젝트 API URL | 예 |
| `SUPABASE_PUBLISHABLE_KEY` 또는 `SUPABASE_ANON_KEY` | Supabase 공개 키 | 예 |
| `SUPABASE_SERVICE_ROLE_KEY` 또는 `SUPABASE_SECRET_KEY` | 개인 MCP 토큰 검증 | **아니오** |
| `OPENAI_API_KEY` 또는 `AI_GATEWAY_API_KEY` | 서버 문제 생성 | **아니오** |
| `LLM_MODEL` | 선택. 기본 `gpt-4.1-mini`, Gateway는 `openai/gpt-4.1-mini` | 아니오 |
| `OPENAI_BASE_URL` | 선택. OpenAI 호환 Chat Completions `/v1` 주소 | 아니오 |

Supabase URL/공개 키는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`도 지원합니다. **비밀 키에 공개 접두사를 붙이지 마세요.** `.env.local`은 커밋하지 않습니다.

`GET /api/config`는 공개 Supabase 설정과 기능별 키 등록 여부만 반환합니다. `authReady/aiReady/mcpReady`는 실제 연결·잔액·DB 초기화 성공을 의미하지 않습니다. 앱에서도 이를 구분해 표시합니다.

## 동작

- 로그인 전: 기존 샘플 과목·퀴즈·모의 결제 체험. 샘플 상태는 해당 브라우저에 저장되며 초기화할 수 있습니다.
- 로그인 후: 빈 개인 공간에서 과목을 생성합니다. PDF를 개인 Storage에 직접 올린 후 서버에서 페이지별 텍스트를 추출합니다. 샘플 기록은 실제 계정으로 복사하지 않습니다.
- PDF: 1KB~50MB, 과목당 20개, 500쪽 이하, 텍스트 추출량 100만 자 이하. 중복 해시 검사. 스캔/OCR·암호화 문서 미지원.
- AI: 앞부분 최대 28,000자의 근거를 전달해 객관식·단답형을 생성합니다. 페이지·문항 형식을 검사하고 **검수 대기**로 저장합니다. 본인이 승인한 문항만 퀴즈에 사용합니다. 하루 20회, 최소 1분 간격. 실패 요청도 사용 시도로 집계합니다.
- 응시: 서버가 답안을 재채점하고 응시·숙련도를 한 트랜잭션으로 저장합니다. 재시도 식별자로 중복 저장을 막습니다. 결과에는 당시 문항·해설을 보관합니다.
- 단답형: 등록된 정답·동의어와 정규화한 문자열을 비교합니다. 임베딩 채점은 구현하지 않았습니다.
- 실사용 파일럿은 무료입니다. 실제 결제·공유 문제은행·기관 운영자 기능은 없습니다.
- 등수·학점은 아직 예측하지 않습니다. 현재 기록은 개인 학습 자료이며, 모집단과 실제 성적의 검증 데이터가 쌓인 뒤 별도의 보정 모델이 필요합니다. 클라이언트의 자가 학습 데이터는 공인 성적이 아닙니다.

## 내 AI와 MCP

앱의 **AI 연결**에서 30일짜리 개인 토큰을 발급합니다. 원문은 한 번만 표시하고 DB에는 SHA-256 해시만 저장합니다. 원문을 다른 팀원과 공유하지 않습니다.

```json
{
  "mcpServers": {
    "crammate": {
      "url": "https://YOUR_DEPLOYED_HOST/api/mcp",
      "headers": {"Authorization": "Bearer YOUR_PERSONAL_TOKEN"}
    }
  }
}
```

Streamable HTTP POST를 사용하는 stateless MCP입니다. 인증 헤더를 지원하는 클라이언트가 필요하며 OAuth discovery와 기존 SSE 전용 클라이언트는 지원하지 않습니다. 토큰 발급·폐기는 웹에서만 가능합니다. MCP는 문항을 승인하거나 점수를 덮어쓸 수 없습니다.

| 도구 | 기능 |
| --- | --- |
| `list_courses` | 내 과목 목록 |
| `get_course_context` | 교안 페이지 조회, offset/limit 페이지 이동 |
| `get_question_bank` | 내 과목의 승인 문항 |
| `submit_questions` | 근거가 있는 5~12개 문항을 검수 대기로 저장 |
| `get_learning_progress` | 숙련도·최근 응시 요약 |

## 팀 협업

다른 AI를 쓰더라도 [`AGENTS.md`](AGENTS.md), [`docs/architecture.md`](docs/architecture.md), [`docs/api.md`](docs/api.md)를 공통 문맥으로 읽고 작업합니다. 담당 파일 범위를 먼저 정하고 최신 main 변경을 확인하세요. 사용자가 정한 직접 push 방식에 맞추되 다른 팀원의 변경을 덮어쓰지 않습니다.

검증 결과와 아직 연결되지 않은 부분은 [`docs/verification.md`](docs/verification.md)에 기록합니다.
