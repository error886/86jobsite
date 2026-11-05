-- 86Job schema. Run once in the Supabase SQL Editor (or `supabase db push`).
-- The Express server talks to these tables with the project's secret key, which bypasses
-- Row Level Security; RLS is still enabled with no policies so the public anon key can read
-- or write nothing directly.

create table if not exists public.jobs (
  id           text primary key,
  title        text not null check (char_length(title) <= 200),
  company      text not null check (char_length(company) <= 100),
  salary       integer not null check (salary > 0),
  salary_type  text not null default 'Hourly' check (salary_type in ('Hourly', 'Monthly')),
  city         text not null,
  district     text not null,
  address      text not null,
  category     text not null check (category in ('Restaurant', 'Cafe', 'Factory', 'Warehouse', 'Convenience Store', 'Office', 'Other')),
  working_time text not null,
  description  text not null check (char_length(description) <= 5000),
  phone        text,
  kakao        text,
  line         text,
  source       text not null default 'User',
  source_url   text,
  latitude     double precision not null,
  longitude    double precision not null,
  created_at   timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  views        integer not null default 0 check (views >= 0)
);

create index if not exists jobs_status_created_idx on public.jobs (status, created_at desc);

create table if not exists public.bookmarks (
  id         text primary key,
  user_id    text not null,
  job_id     text not null references public.jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists bookmarks_user_idx on public.bookmarks (user_id);

create table if not exists public.users (
  id         text primary key,
  name       text not null,
  email      text not null unique,
  avatar     text,
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.crawler_logs (
  id         text primary key,
  source     text not null,
  status     text not null check (status in ('success', 'failed')),
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists crawler_logs_created_idx on public.crawler_logs (created_at desc);

-- Count a view in one statement, so two visitors at the same time are both counted
create or replace function public.increment_job_views(p_job_id text)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.jobs set views = views + 1 where id = p_job_id returning views;
$$;

revoke all on function public.increment_job_views(text) from public, anon, authenticated;

alter table public.jobs         enable row level security;
alter table public.bookmarks    enable row level security;
alter table public.users        enable row level security;
alter table public.crawler_logs enable row level security;
