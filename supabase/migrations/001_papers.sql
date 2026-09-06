-- ============================================================
-- 논문 서재 (Personal Paper Library) Schema
-- 실행 위치: Supabase Dashboard → SQL Editor (한 번만 실행, 재실행 안전)
--
-- 구조
--   · paper_fields      분야  — 넓은 학문 분야 (논문 1건당 1개)          예) 컴퓨터 비전, 의료 AI
--   · paper_topics      주제  — 세부 주제 태그 (논문 1건당 여러 개)      예) Diffusion, Segmentation
--   · papers            논문  — 서지 정보 + 정리 순서 + 요약본 + 메모
--   · paper_topic_links 논문 ↔ 주제 연결 (다대다)
--
-- 개인 전용
--   · 모든 행은 user_id(작성자)를 가지며 RLS 로 "본인 행만" 조회·수정·삭제할 수 있다.
--   · 로그인하지 않은 사용자(anon)는 어떤 행도 볼 수 없다.
-- ============================================================

-- 분야
create table if not exists paper_fields (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#4f46e5',   -- 배지 색상 (hex)
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz default now(),
  unique (user_id, name)
);

-- 주제 (태그)
create table if not exists paper_topics (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz default now(),
  unique (user_id, name)
);

-- 논문
create table if not exists papers (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  field_id       uuid references paper_fields(id) on delete set null,
  sort_order     integer not null default 0,                 -- 정리 순서 (차례대로 번호가 붙는 기준)
  title          text not null,
  authors        text,                                        -- "홍길동, John Doe" 자유 형식
  year           integer,
  venue          text,                                        -- 학술지 / 학회 / arXiv
  doi            text,
  url            text,                                        -- 논문 페이지 링크
  pdf_url        text,                                        -- PDF 링크
  abstract       text,                                        -- 원문 초록
  reading_status text not null default 'unread'
                 check (reading_status in ('unread','reading','done')),
  rating         integer check (rating between 0 and 5),
  favorite       boolean not null default false,
  read_at        date,
  tldr           text,                                        -- 한 줄 요약
  summary        jsonb not null default '{}'::jsonb,          -- 요약본 {problem, method, results, limitations, takeaways} (마크다운)
  notes          text,                                        -- 자유 메모 (마크다운)
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- 논문 ↔ 주제
create table if not exists paper_topic_links (
  paper_id  uuid not null references papers(id) on delete cascade,
  topic_id  uuid not null references paper_topics(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (paper_id, topic_id)
);

create index if not exists idx_papers_user_order       on papers (user_id, sort_order, created_at);
create index if not exists idx_papers_user_field       on papers (user_id, field_id);
create index if not exists idx_paper_fields_user       on paper_fields (user_id, sort_order);
create index if not exists idx_paper_topics_user       on paper_topics (user_id, name);
create index if not exists idx_paper_topic_links_topic on paper_topic_links (topic_id);
create index if not exists idx_paper_topic_links_user  on paper_topic_links (user_id);

-- updated_at 자동 갱신 (001 마이그레이션의 함수를 재사용, 없으면 생성)
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_papers_updated_at on papers;
create trigger trg_papers_updated_at before update on papers
for each row execute function set_updated_at();

-- ============================================================
-- RLS: 본인(user_id = auth.uid()) 행만 접근 가능
-- ============================================================
alter table paper_fields      enable row level security;
alter table paper_topics      enable row level security;
alter table papers            enable row level security;
alter table paper_topic_links enable row level security;

drop policy if exists "paper_fields_owner" on paper_fields;
create policy "paper_fields_owner" on paper_fields
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "paper_topics_owner" on paper_topics;
create policy "paper_topics_owner" on paper_topics
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "papers_owner" on papers;
create policy "papers_owner" on papers
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 연결 행은 본인 소유의 논문·주제끼리만 맺을 수 있다
drop policy if exists "paper_topic_links_owner" on paper_topic_links;
create policy "paper_topic_links_owner" on paper_topic_links
for all to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (select 1 from papers p       where p.id = paper_id and p.user_id = auth.uid())
  and exists (select 1 from paper_topics t where t.id = topic_id and t.user_id = auth.uid())
);
