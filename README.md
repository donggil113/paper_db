# 논문 서재 (paper_db)

읽은 논문을 **차례대로 정리**하고, **요약본**을 따로 모아 보며, **분야·주제별**로 찾아볼 수 있는 개인용 웹사이트입니다.
데이터는 Supabase 에 저장되고, 행 수준 보안(RLS)으로 **본인 계정에서만** 보입니다.

React + Vite 로 만든 정적 사이트라 별도 서버 없이 어디든 배포할 수 있습니다.

## 화면

| 화면 | 설명 |
| --- | --- |
| **논문 목록** | 정리 순서대로 번호가 붙은 목록. 번호 옆 화살표로 순서를 바꿉니다. 제목·저자·출처·한 줄 요약·분야·주제·읽기 상태·평점이 한눈에 보입니다. |
| **요약 모음** | 서지 정보 없이 요약본만 차례대로 읽는 화면. "간략히"를 누르면 한 줄 요약만 남습니다. |
| **논문 상세** | `요약본` 탭과 `초록 · 메모` 탭. 이전·다음 논문으로 넘겨 가며 읽고, DOI·논문 페이지·PDF 링크와 인용 복사를 제공합니다. |
| **분류 사이드바** | 분야(논문당 1개) · 주제(여러 개 태그) · 읽기 상태 · 즐겨찾기로 걸러 봅니다. 분야를 고르면 그 분야에 쓰인 주제만 남습니다. |

요약본은 **한 줄 요약** + 다섯 항목(연구 배경 · 제안 방법 · 주요 결과 · 한계 · 내 생각)으로 나뉘며,
`**굵게**` `*기울임*` `- 목록` `1. 번호` `> 인용` `` `코드` `` `[링크](주소)` 같은 마크다운을 지원합니다.
현재 목록의 요약을 마크다운 파일 하나로 내려받을 수도 있습니다.

## 처음 설정하기

### 1. Supabase 프로젝트 준비

[supabase.com](https://supabase.com) 에서 프로젝트를 만듭니다(기존 프로젝트를 함께 써도 됩니다).

### 2. 테이블 만들기

Supabase 대시보드 → **SQL Editor** 에서 [`supabase/migrations/001_papers.sql`](supabase/migrations/001_papers.sql)
내용을 붙여 넣고 실행합니다. 테이블 4개와 RLS 정책이 만들어집니다. 여러 번 실행해도 안전합니다.

| 테이블 | 역할 |
| --- | --- |
| `paper_fields` | 분야 (논문당 1개, 색상 지정 가능) |
| `paper_topics` | 주제 태그 (논문당 여러 개) |
| `papers` | 논문 서지 정보 · 정리 순서 · 요약본 · 메모 |
| `paper_topic_links` | 논문 ↔ 주제 연결 |

모든 표에 `user_id` 가 있고, RLS 정책이 `user_id = auth.uid()` 인 행만 허용합니다.
로그인하지 않은 방문자는 어떤 행도 읽을 수 없습니다.

### 3. 환경변수

```bash
cp .env.example .env
```

`.env` 를 열어 Supabase 대시보드 → **Project Settings → Data API / API Keys** 의 값을 채웁니다.

```
VITE_SUPABASE_URL=https://<프로젝트>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

`anon` 키는 브라우저에 노출되는 공개 키입니다. RLS 가 데이터를 지키므로 공개되어도 안전하지만,
`service_role` 키는 **절대** 넣지 마세요. `.env` 는 `.gitignore` 에 걸려 있어 커밋되지 않습니다.

### 4. 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 배포용 정적 파일 → dist/
npm run preview  # 빌드 결과 미리보기
npm run lint     # ESLint
```

첫 화면에서 **회원가입**으로 계정을 만들면 바로 내 서재가 열립니다.
Supabase 프로젝트에서 이메일 인증이 켜져 있으면 인증 메일의 링크를 누른 뒤 로그인하세요.

## 나만 쓰도록 잠그기

가입 자체를 막으면 나 말고는 계정을 만들 수 없습니다.
계정을 하나 만든 뒤 Supabase 대시보드 → **Authentication → Sign In / Providers** 에서
`Allow new users to sign up` 을 꺼 두세요. 이미 만든 계정으로는 계속 로그인할 수 있습니다.

## 배포

`npm run build` 결과인 `dist/` 를 정적 호스팅에 올리면 됩니다 (Vercel, Netlify, Cloudflare Pages 등).
호스팅 대시보드에도 `VITE_SUPABASE_URL` 과 `VITE_SUPABASE_ANON_KEY` 를 환경변수로 넣어야 합니다.
검색엔진에 노출되지 않도록 `index.html` 에 `noindex` 를 넣어 두었습니다.

## 구조

```
src/
  main.jsx        진입점
  App.jsx         앱 셸 — 로그인 상태에 따라 Auth / Papers 를 가름, 헤더·토스트
  Auth.jsx        로그인 · 회원가입 화면
  Papers.jsx      논문 서재 본체 — 목록 · 요약 모음 · 상세 · 편집 · 분야/주제 관리
  markdown.jsx    요약본·메모용 소형 마크다운 렌더러 (innerHTML 미사용)
  supabase.js     Supabase 클라이언트
supabase/migrations/
  001_papers.sql  테이블 · 인덱스 · RLS 정책
```
