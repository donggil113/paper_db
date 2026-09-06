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
git clone https://github.com/donggil113/paper_db
cd paper_db
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 배포용 정적 파일 → dist/
npm run preview  # 빌드 결과 미리보기
npm run lint     # ESLint
```

> **Windows PowerShell 사용자**
> 구버전 PowerShell(5.x)은 `&&` 를 인식하지 못합니다. `cd paper_db && npm install` 처럼 붙여 쓰지 말고
> **한 줄에 하나씩** 실행하거나 `;` 로 이으세요. `cd` 가 실패한 채로 다음 명령을 실행하면
> `.env.example 경로를 찾을 수 없습니다` 나 `Missing script: "dev"` 같은 오류가 납니다 —
> 프로젝트 폴더가 아니라 홈 폴더에서 명령이 돈 것이므로, `pwd` 로 현재 위치부터 확인하세요.
>
> `.env` 만드는 명령도 PowerShell 에서는 이렇게 씁니다.
> ```powershell
> Copy-Item .env.example .env
> notepad .env
> ```

첫 화면에서 **회원가입**으로 계정을 만들면 바로 내 서재가 열립니다.
새로 만든 Supabase 프로젝트는 이메일 인증이 기본으로 켜져 있어, 가입하면 인증 메일이 먼저 옵니다.
메일의 링크를 누른 뒤 로그인하세요. 혼자 쓰는 사이트라 인증이 번거롭다면
Supabase → **Authentication → Sign In / Providers → Email** 에서 `Confirm email` 을 꺼도 됩니다.

## 나만 쓰도록 잠그기

가입 자체를 막으면 나 말고는 계정을 만들 수 없습니다.
계정을 하나 만든 뒤 Supabase 대시보드 → **Authentication → Sign In / Providers** 에서
`Allow new users to sign up` 을 꺼 두세요. 이미 만든 계정으로는 계속 로그인할 수 있습니다.

## 배포 (Vercel 기준)

이 저장소를 Vercel 에 연결하면 `main` 에 푸시할 때마다 자동으로 배포됩니다.
Vite 프로젝트로 자동 인식되므로 빌드 설정은 건드릴 필요가 없습니다.

**환경변수는 반드시 넣어야 합니다.** 넣지 않으면 사이트가 "Supabase 설정이 필요합니다" 안내 화면만 보여 줍니다.

1. Vercel 프로젝트 → **Settings → Environment Variables**
2. 두 개를 추가합니다. 적용 환경은 **Production 을 포함해** 전부 체크하세요.
   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<프로젝트>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase 의 anon key |
3. **Deployments → 맨 위 배포의 `⋯` → Redeploy** 로 다시 배포합니다.

> 3번을 빠뜨리기 쉽습니다. Vite 는 `VITE_*` 값을 **빌드할 때 코드에 박아 넣기** 때문에,
> 환경변수를 저장만 하고 재배포하지 않으면 이미 빌드된 파일에는 값이 없어 그대로 안내 화면이 나옵니다.
> 재배포 후에도 같은 화면이면 `Use existing Build Cache` 를 끄고 다시 배포해 보세요.

### Supabase 쪽 마무리

배포 주소가 생기면 Supabase → **Authentication → URL Configuration → Site URL** 을 그 주소로 바꿉니다.
그래야 회원가입 인증 메일의 링크가 `localhost` 가 아니라 실제 사이트로 연결됩니다.

검색엔진에 노출되지 않도록 `index.html` 에 `noindex` 를 넣어 두었습니다.

### 잘 안 될 때

| 증상 | 원인 · 해결 |
| --- | --- |
| "Supabase 설정이 필요합니다" 화면만 보임 | 환경변수가 없거나 넣고 재배포를 안 함 → 위 배포 절차 1~3 |
| 로그인은 되는데 목록이 비어 있고 오류 토스트가 뜸 | `001_papers.sql` 을 아직 실행하지 않음 → SQL Editor 에서 실행 |
| 가입 후 메일이 오지 않음 | Supabase 무료 플랜의 메일 발송 제한 → `Confirm email` 을 끄고 바로 가입 |
| 인증 메일 링크가 localhost 로 감 | Site URL 이 기본값 → 위 "Supabase 쪽 마무리" 참고 |

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
