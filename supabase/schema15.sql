-- ===== 15차 (2026-10): 관리자 개별 계정 · 캠페인 설정 · 연간 누적 조회 =====
-- 이 파일만 SQL 편집기에서 한 번 실행하면 돼요(여러 번 실행해도 안전). 초기 비밀번호와 첫 관리자 목록은 저장소에 남기지 않고 따로 넣어요(맨 아래 안내).
-- · 관리자 = 이메일 아이디 + 비밀번호(bcrypt 해시만 저장 — 운영자도 원래 비밀번호를 볼 수 없음)
-- · 처음(또는 초기화 뒤) 접속하면 비밀번호를 바꾸기 전에는 아무 것도 저장할 수 없음
-- · 예전 공용 비밀번호 접속(cue_login)은 막음

create table if not exists public.cue_users (
  email text primary key,
  name text not null,
  pw_hash text not null,
  must_change boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  pw_changed_at timestamptz
);
create table if not exists public.cue_conf (k text primary key, v text not null);
alter table public.cue_users enable row level security; revoke all on table public.cue_users from anon, authenticated;
alter table public.cue_conf enable row level security; revoke all on table public.cue_conf from anon, authenticated;
alter table public.cue_sessions add column if not exists email text;
alter table public.cue_camps add column if not exists settings jsonb not null default '{}'::jsonb;

-- 세션 확인: 계정 세션만 · 계정이 지워졌으면 끊음 · 첫 비밀번호를 바꾸기 전에는 막음
create or replace function public.cue_chk(p_tok text) returns void
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  update public.cue_sessions set exp = greatest(exp, now() + interval '3 hours') where tok = p_tok and exp > now() returning email into e;
  if not found or e is null or not exists (select 1 from public.cue_users u where u.email = e) then
    delete from public.cue_sessions where tok = p_tok;
    raise exception 'session expired' using errcode = 'PT401';
  end if;
  if exists (select 1 from public.cue_users u where u.email = e and u.must_change) then raise exception 'password change required' using errcode = 'PT403'; end if;
end $$;

create or replace function public.cue_who(p_tok text) returns text
language sql stable security definer set search_path = public as $$
  select u.name from public.cue_sessions s join public.cue_users u on u.email = s.email where s.tok = p_tok $$;

create or replace function public.cue_login2(p_email text, p_pw text)
returns table (o_tok text, o_name text, o_email text, o_must boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare u public.cue_users%rowtype; t text;
begin
  select * into u from public.cue_users x where x.email = lower(trim(p_email));
  if not found or u.pw_hash <> crypt(p_pw, u.pw_hash) then perform pg_sleep(0.7); raise exception 'bad login' using errcode = 'PT401'; end if;
  delete from public.cue_sessions where exp < now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into public.cue_sessions (tok, exp, email) values (t, now() + interval '12 hours', u.email);
  return query select t, u.name, u.email, u.must_change;
end $$;

create or replace function public.cue_me(p_tok text)
returns table (o_name text, o_email text, o_must boolean)
language sql stable security definer set search_path = public as $$
  select u.name, u.email, u.must_change from public.cue_sessions s join public.cue_users u on u.email = s.email where s.tok = p_tok and s.exp > now() $$;

-- 비밀번호 바꾸기 (첫 접속 포함): 지금 비밀번호 확인 · 6자 이상 · 지금/초기 비밀번호와 달라야
create or replace function public.cue_set_pw(p_tok text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare e text; h text; ih text;
begin
  select s.email into e from public.cue_sessions s where s.tok = p_tok and s.exp > now();
  if e is null then raise exception 'session expired' using errcode = 'PT401'; end if;
  select u.pw_hash into h from public.cue_users u where u.email = e;
  if h is null or h <> crypt(p_old, h) then perform pg_sleep(0.5); raise exception 'bad password' using errcode = 'PT400'; end if;
  if p_new is null or length(p_new) < 6 then raise exception 'too short' using errcode = 'PT400'; end if;
  if h = crypt(p_new, h) then raise exception 'same password' using errcode = 'PT400'; end if;
  select c.v into ih from public.cue_conf c where c.k = 'init_pw_hash';
  if ih is not null and ih = crypt(p_new, ih) then raise exception 'initial password' using errcode = 'PT400'; end if;
  update public.cue_users set pw_hash = crypt(p_new, gen_salt('bf')), must_change = false, pw_changed_at = now() where email = e;
end $$;

create or replace function public.cue_users_list(p_tok text)
returns table (o_email text, o_name text, o_must boolean, o_created timestamptz, o_by text, o_pw_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin perform public.cue_chk(p_tok);
  return query select u.email, u.name, u.must_change, u.created_at, u.created_by, u.pw_changed_at from public.cue_users u order by u.created_at, u.email; end $$;

-- 초대: 초기 비밀번호로 계정을 바로 만듦(첫 접속 때 바꾸게)
create or replace function public.cue_user_invite(p_tok text, p_email text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email)); ih text;
begin perform public.cue_chk(p_tok);
  if e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'bad email' using errcode = 'PT400'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name required' using errcode = 'PT400'; end if;
  if exists (select 1 from public.cue_users u where u.email = e) then raise exception 'already exists' using errcode = 'PT400'; end if;
  select c.v into ih from public.cue_conf c where c.k = 'init_pw_hash';
  if ih is null then raise exception 'initial password not set' using errcode = 'PT400'; end if;
  insert into public.cue_users (email, name, pw_hash, must_change, created_by) values (e, trim(p_name), ih, true, public.cue_who(p_tok));
end $$;

create or replace function public.cue_user_reset(p_tok text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare ih text;
begin perform public.cue_chk(p_tok);
  select c.v into ih from public.cue_conf c where c.k = 'init_pw_hash';
  if ih is null then raise exception 'initial password not set' using errcode = 'PT400'; end if;
  update public.cue_users set pw_hash = ih, must_change = true where email = lower(trim(p_email));
  delete from public.cue_sessions where email = lower(trim(p_email));
end $$;

create or replace function public.cue_user_remove(p_tok text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare me text;
begin perform public.cue_chk(p_tok);
  select s.email into me from public.cue_sessions s where s.tok = p_tok;
  if me = lower(trim(p_email)) then raise exception 'cannot remove yourself' using errcode = 'PT400'; end if;
  delete from public.cue_users where email = lower(trim(p_email));
  delete from public.cue_sessions where email = lower(trim(p_email));
end $$;

-- 저장·잠금의 '누가'는 접속한 계정 이름으로
create or replace function public.cue_save(p_tok text, p_camp text, p_ym text, p_part text, p_data jsonb, p_prev timestamptz, p_who text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare cur timestamptz; ts timestamptz := clock_timestamp(); w text;
begin
  perform public.cue_chk(p_tok); w := coalesce(public.cue_who(p_tok), p_who);
  select x.updated_at into cur from public.cue_ws x where x.camp = p_camp and x.ym = p_ym and x.part = p_part for update;
  if found and (p_prev is null or cur <> p_prev) then raise exception 'conflict' using errcode = 'PT409'; end if;
  insert into public.cue_ws (camp, ym, part, data, updated_at, updated_by) values (p_camp, p_ym, p_part, p_data, ts, w)
  on conflict (camp, ym, part) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return ts;
end $$;

create or replace function public.cue_lock(p_tok text, p_camp text, p_ym text, p_sheet text, p_holder text, p_who text)
returns table (l_ok boolean, l_who text, l_exp timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_who text; v_exp timestamptz; t timestamptz := now() + interval '3 minutes'; w text;
begin
  perform public.cue_chk(p_tok); w := coalesce(public.cue_who(p_tok), p_who);
  insert into public.cue_locks as k (camp, ym, sheet, holder, who, exp) values (p_camp, p_ym, p_sheet, p_holder, w, t)
  on conflict (camp, ym, sheet) do update set holder = excluded.holder, who = excluded.who, exp = excluded.exp
    where k.holder = excluded.holder or k.exp < now();
  if found then return query select true, w, t; return; end if;
  select k.who, k.exp into v_who, v_exp from public.cue_locks k where k.camp = p_camp and k.ym = p_ym and k.sheet = p_sheet;
  return query select false, v_who, v_exp;
end $$;

-- 캠페인 설정 (운영 누적 메뉴 보이기 등): 누구나 읽고, 관리자만 바꿈
create or replace function public.cue_view_settings(p_camp text) returns jsonb
language sql stable security definer set search_path = public as $$ select coalesce((select c.settings from public.cue_camps c where c.id = p_camp), '{}'::jsonb) $$;
create or replace function public.cue_admin_setting(p_tok text, p_camp text, p_key text, p_val jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin perform public.cue_chk(p_tok); update public.cue_camps set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(p_key, p_val) where id = p_camp; end $$;

-- 연간 누적: 그 해 달마다 예산표 + 마스터만 한 번에
create or replace function public.cue_view_year(p_camp text, p_year text) returns table (ym text, part text, data jsonb)
language sql stable security definer set search_path = public as $$
  select w.ym, w.part, w.data from public.cue_ws w where w.camp = p_camp and w.ym like p_year || '-%' and w.part in ('예산', 'master') $$;

-- 권한
revoke all on function public.cue_who(text) from public, anon, authenticated;
-- 예전 공용 비밀번호 접속은 막음 (함수 실행 권한 회수)
revoke all on function public.cue_login(text) from public, anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['cue_login2(text,text)','cue_me(text)','cue_set_pw(text,text,text)','cue_users_list(text)','cue_user_invite(text,text,text)','cue_user_reset(text,text)','cue_user_remove(text,text)',
    'cue_save(text,text,text,text,jsonb,timestamptz,text)','cue_lock(text,text,text,text,text,text)','cue_view_settings(text)','cue_admin_setting(text,text,text,jsonb)','cue_view_year(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
-- 공용 비밀번호로 열려 있던 세션(email 없음)은 cue_chk 가 쓸 때 끊음 (모두 계정으로 다시 접속)

-- 초기 비밀번호·첫 관리자 목록은 저장소에 남기지 않음. SQL 편집기에서 따로:
--   insert into public.cue_conf (k, v) values ('init_pw_hash', extensions.crypt('초기-비밀번호', extensions.gen_salt('bf'))) on conflict (k) do update set v = excluded.v;
--   insert into public.cue_users (email, name, pw_hash, must_change, created_by)
--     select e, n, (select v from public.cue_conf where k = 'init_pw_hash'), true, '처음 등록' from (values ('이메일', '이름')) x(e, n) on conflict (email) do nothing;
