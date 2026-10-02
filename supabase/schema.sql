-- SM C&C TV 큐시트 — Supabase 스키마 (기존 프로젝트에 cue_ 로 시작하는 표·함수만 추가 — 다른 앱과 섞이지 않음)
-- · 표는 RLS로 모두 막아 두고(정책 없음), 아래 함수로만 읽고 씀
-- · 뷰어: 캠페인 코드(?c=…)를 아는 사람만 그 캠페인을 읽음 (cue_view*)
-- · 관리자: 비밀번호(cue_secret에 bcrypt 해시)로 접속 → 12시간짜리 세션 토큰으로만 저장 가능
-- · Supabase Auth(로그인 계정)는 쓰지 않음

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.cue_secret (id int primary key default 1 check (id = 1), pw_hash text not null);
create table if not exists public.cue_sessions (tok text primary key, exp timestamptz not null);
create table if not exists public.cue_camps (id text primary key, name text not null, created_at timestamptz not null default now());
create table if not exists public.cue_ws (
  camp text not null references public.cue_camps(id) on delete cascade,
  ym text not null,
  part text not null,              -- meta · 지상파 · 케이블 · 예산 · 소재 · master · reach
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (camp, ym, part)
);
create table if not exists public.cue_versions (
  id bigserial primary key,
  camp text not null references public.cue_camps(id) on delete cascade,
  ym text not null,
  time timestamptz not null default now(),
  label text, auto boolean not null default false, summary text, stats jsonb,
  wsz text not null                -- 작업 내용 전체 (gzip + base64)
);
create index if not exists cue_versions_cy on public.cue_versions (camp, ym, time);

do $$ declare t text; begin
  foreach t in array array['cue_secret','cue_sessions','cue_camps','cue_ws','cue_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.cue_versions_id_seq from anon, authenticated;

-- ---------- 관리자 세션 ----------
create or replace function public.cue_login(p_pw text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if not exists (select 1 from public.cue_secret s where s.id = 1 and s.pw_hash = crypt(p_pw, s.pw_hash)) then
    perform pg_sleep(0.7);
    raise exception 'bad password' using errcode = 'PT401';
  end if;
  delete from public.cue_sessions where exp < now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.cue_sessions (tok, exp) values (t, now() + interval '12 hours');
  return t;
end $$;

create or replace function public.cue_chk(p_tok text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cue_sessions set exp = greatest(exp, now() + interval '3 hours') where tok = p_tok and exp > now();
  if not found then raise exception 'session expired' using errcode = 'PT401'; end if;
end $$;

create or replace function public.cue_logout(p_tok text) returns void
language sql security definer set search_path = public as $$ delete from public.cue_sessions where tok = p_tok $$;

-- ---------- 뷰어 (캠페인 코드를 아는 사람만) ----------
create or replace function public.cue_view_camp(p_camp text) returns table (id text, name text)
language sql stable security definer set search_path = public as $$ select c.id, c.name from public.cue_camps c where c.id = p_camp $$;
create or replace function public.cue_view_months(p_camp text) returns table (ym text)
language sql stable security definer set search_path = public as $$ select w.ym from public.cue_ws w where w.camp = p_camp and w.part = 'meta' order by w.ym desc $$;
create or replace function public.cue_view(p_camp text, p_ym text) returns table (part text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$ select w.part, w.data, w.updated_at from public.cue_ws w where w.camp = p_camp and w.ym = p_ym $$;
create or replace function public.cue_stamps(p_camp text, p_ym text) returns table (part text, updated_at timestamptz, updated_by text)
language sql stable security definer set search_path = public as $$ select w.part, w.updated_at, w.updated_by from public.cue_ws w where w.camp = p_camp and w.ym = p_ym $$;

-- ---------- 관리자 ----------
create or replace function public.cue_admin_camps(p_tok text) returns table (id text, name text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin perform public.cue_chk(p_tok); return query select c.id, c.name, c.created_at from public.cue_camps c order by c.created_at; end $$;

create or replace function public.cue_admin_camp_save(p_tok text, p_id text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.cue_chk(p_tok);
  insert into public.cue_camps (id, name) values (p_id, p_name) on conflict (id) do update set name = excluded.name; end $$;

-- 다른 관리자가 그사이 같은 묶음을 저장했으면 409(conflict)
create or replace function public.cue_save(p_tok text, p_camp text, p_ym text, p_part text, p_data jsonb, p_prev timestamptz, p_who text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare cur timestamptz; ts timestamptz := clock_timestamp();
begin
  perform public.cue_chk(p_tok);
  select w.updated_at into cur from public.cue_ws w where w.camp = p_camp and w.ym = p_ym and w.part = p_part for update;
  if found and (p_prev is null or cur <> p_prev) then raise exception 'conflict' using errcode = 'PT409'; end if;
  insert into public.cue_ws (camp, ym, part, data, updated_at, updated_by) values (p_camp, p_ym, p_part, p_data, ts, p_who)
  on conflict (camp, ym, part) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return ts;
end $$;

create or replace function public.cue_ver_add(p_tok text, p_camp text, p_ym text, p_time timestamptz, p_label text, p_auto boolean, p_summary text, p_stats jsonb, p_wsz text) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin perform public.cue_chk(p_tok);
  insert into public.cue_versions (camp, ym, time, label, auto, summary, stats, wsz) values (p_camp, p_ym, p_time, p_label, p_auto, p_summary, p_stats, p_wsz) returning id into i;
  -- 자동 백업은 달마다 최근 60개만
  delete from public.cue_versions v where v.camp = p_camp and v.ym = p_ym and v.auto and v.id not in (select id from public.cue_versions where camp = p_camp and ym = p_ym and auto order by time desc limit 60);
  return i; end $$;

create or replace function public.cue_ver_list(p_tok text, p_camp text, p_ym text) returns table (id bigint, ym text, vt timestamptz, label text, auto boolean, summary text, stats jsonb)
language plpgsql security definer set search_path = public as $$
begin perform public.cue_chk(p_tok);
  return query select v.id, v.ym, v.time, v.label, v.auto, v.summary, v.stats from public.cue_versions v where v.camp = p_camp and v.ym = p_ym order by v.time; end $$;

create or replace function public.cue_ver_get(p_tok text, p_id bigint) returns text
language plpgsql security definer set search_path = public as $$
declare z text; begin perform public.cue_chk(p_tok); select v.wsz into z from public.cue_versions v where v.id = p_id; return z; end $$;

-- ---------- 입력 시트 편집 잠금 (한 시트는 한 사람만 고치게) ----------
-- 시트를 열면 3분짜리 잠금을 잡고 30초마다 연장. 브라우저를 닫거나 5분 손대지 않으면 풀림
create table if not exists public.cue_locks (
  camp text not null, ym text not null, sheet text not null,
  holder text not null, who text, exp timestamptz not null,
  primary key (camp, ym, sheet)
);
alter table public.cue_locks enable row level security;
revoke all on table public.cue_locks from anon, authenticated;

create or replace function public.cue_lock(p_tok text, p_camp text, p_ym text, p_sheet text, p_holder text, p_who text)
returns table (l_ok boolean, l_who text, l_exp timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_who text; v_exp timestamptz; t timestamptz := now() + interval '3 minutes';
begin
  perform public.cue_chk(p_tok);
  insert into public.cue_locks as k (camp, ym, sheet, holder, who, exp) values (p_camp, p_ym, p_sheet, p_holder, p_who, t)
  on conflict (camp, ym, sheet) do update set holder = excluded.holder, who = excluded.who, exp = excluded.exp
    where k.holder = excluded.holder or k.exp < now();
  if found then return query select true, p_who, t; return; end if;
  select k.who, k.exp into v_who, v_exp from public.cue_locks k where k.camp = p_camp and k.ym = p_ym and k.sheet = p_sheet;
  return query select false, v_who, v_exp;
end $$;

create or replace function public.cue_unlock(p_tok text, p_camp text, p_ym text, p_sheet text, p_holder text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.cue_chk(p_tok);
  delete from public.cue_locks k where k.camp = p_camp and k.ym = p_ym and k.sheet = p_sheet and k.holder = p_holder;
end $$;

-- 메뉴에 '🔒 누구' 표시용: 이 달에 다른 사람이 잡고 있는 시트
create or replace function public.cue_locks(p_tok text, p_camp text, p_ym text, p_holder text)
returns table (l_sheet text, l_who text)
language plpgsql security definer set search_path = public as $$
begin
  perform public.cue_chk(p_tok);
  return query select k.sheet, k.who from public.cue_locks k where k.camp = p_camp and k.ym = p_ym and k.holder <> p_holder and k.exp > now();
end $$;

-- 함수 권한: 내부용(cue_chk)은 막고, 나머지는 브라우저(anon)에서 부를 수 있게
revoke all on function public.cue_chk(text) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['cue_login(text)','cue_logout(text)','cue_view_camp(text)','cue_view_months(text)','cue_view(text,text)','cue_stamps(text,text)',
    'cue_admin_camps(text)','cue_admin_camp_save(text,text,text)','cue_save(text,text,text,text,jsonb,timestamptz,text)',
    'cue_ver_add(text,text,text,timestamptz,text,boolean,text,jsonb,text)','cue_ver_list(text,text,text)','cue_ver_get(text,bigint)',
    'cue_lock(text,text,text,text,text,text)','cue_unlock(text,text,text,text,text)','cue_locks(text,text,text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- 관리자 비밀번호: '여기에-비밀번호'를 실제 비밀번호로 바꿔서 이 문장만 SQL 편집기에서 실행 (비밀번호는 이 파일·저장소에 남기지 마세요)
-- 바꿀 때도 같은 문장을 다시 실행하면 돼요 (이미 접속한 관리자는 그대로 → 모두 끊으려면: delete from public.cue_sessions;)
insert into public.cue_secret (id, pw_hash) values (1, extensions.crypt('여기에-비밀번호', extensions.gen_salt('bf')))
  on conflict (id) do update set pw_hash = excluded.pw_hash;

-- 코웨이 캠페인 (이 사이트는 코웨이 전용 — config.js 의 camp 와 같은 코드)
insert into public.cue_camps (id, name) values ('coway-45m81pozvg', '코웨이') on conflict (id) do nothing;
