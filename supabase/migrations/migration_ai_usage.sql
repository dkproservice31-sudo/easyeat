-- ====================================================================
-- MIGRATION : quota IA journalier + dashboard admin monitoring
-- Créée le 2026-04-17
-- ====================================================================
-- Gère 3 niveaux de rôles :
--   * member : quota 20/jour sur fonctions user
--   * editor : quota 20/jour sur fonctions user + 50/jour sur fonctions admin
--   * admin  : bypass total (pas d'incrémentation du compteur ai_usage)
-- Les appels sont quand même loggés dans ai_usage_detail pour le dashboard,
-- y compris ceux des admins (sinon leur activité serait invisible au monitoring).

-- ========== TABLE : compteur journalier ==========
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default current_date,
  usage_type text not null check (usage_type in ('user', 'admin')),
  count integer not null default 0,
  last_call_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, usage_date, usage_type)
);

create index if not exists ai_usage_user_date_idx
  on public.ai_usage(user_id, usage_date desc);

alter table public.ai_usage enable row level security;

drop policy if exists "users view own usage" on public.ai_usage;
create policy "users view own usage"
  on public.ai_usage for select
  using (auth.uid() = user_id);

-- INSERT / UPDATE se font uniquement via RPC SECURITY DEFINER → pas de policy
-- user-level nécessaire, mais on les ajoute pour cohérence si besoin direct un jour.
drop policy if exists "users insert own usage" on public.ai_usage;
create policy "users insert own usage"
  on public.ai_usage for insert
  with check (auth.uid() = user_id);

drop policy if exists "users update own usage" on public.ai_usage;
create policy "users update own usage"
  on public.ai_usage for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ========== TABLE : audit détaillé de chaque appel ==========
-- Utilisée par le dashboard admin (breakdown par fonction, top users, graph 7j).
-- TODO future : nettoyage automatique des lignes > 30 jours (cron Supabase).
create table if not exists public.ai_usage_detail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  function_name text not null,
  usage_type text not null check (usage_type in ('user', 'admin')),
  called_at timestamptz not null default now()
);

create index if not exists ai_usage_detail_called_at_idx
  on public.ai_usage_detail(called_at desc);
create index if not exists ai_usage_detail_user_idx
  on public.ai_usage_detail(user_id, called_at desc);

alter table public.ai_usage_detail enable row level security;

-- Lecture : admins only. Les users lambda ne peuvent pas lire (privacy).
drop policy if exists "admins view ai usage detail" on public.ai_usage_detail;
create policy "admins view ai usage detail"
  on public.ai_usage_detail for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- INSERT : uniquement via RPC SECURITY DEFINER → pas de policy user INSERT.

-- ========== RPC : incrémente le quota + log l'appel ==========
-- Applique la règle de quota selon (role, usage_type) :
--   admin + any              -> bypass (return quota "infini"), pas d'incrément compteur
--   editor + 'user'          -> quota 20
--   editor + 'admin'         -> quota 50
--   member + 'user'          -> quota 20
--   member + 'admin'         -> forbidden (erreur 42501)
-- Log toujours dans ai_usage_detail (même pour admins, pour le dashboard).
-- Constantes : QUOTA_USER_STANDARD=20, QUOTA_ADMIN_EDITOR=50.
-- TODO future : UI admin pour ajuster QUOTA_ADMIN_EDITOR par éditeur.
create or replace function public.increment_ai_usage(
  p_user_id uuid,
  p_usage_type text,
  p_function_name text
)
returns table(new_count integer, remaining integer, max_quota integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_max_quota integer;
  v_count integer;
  v_quota_user constant integer := 20;
  v_quota_admin_editor constant integer := 50;
  v_unlimited constant integer := 999999;
begin
  -- 1) Sécurité cross-user : un user ne peut incrémenter que SON compteur
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2) Validation du type
  if p_usage_type not in ('user', 'admin') then
    raise exception 'invalid usage_type: %', p_usage_type using errcode = '22023';
  end if;

  -- 3) Récupère le rôle
  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  -- 4) Log audit toujours (pour dashboard), même admin
  insert into public.ai_usage_detail (user_id, function_name, usage_type)
  values (p_user_id, p_function_name, p_usage_type);

  -- 5) Si admin → bypass total, aucune incrémentation
  if v_role = 'admin' then
    return query select 0, v_unlimited, v_unlimited;
    return;
  end if;

  -- 6) Member qui tente une fonction admin → interdit
  if p_usage_type = 'admin' and v_role <> 'editor' then
    raise exception 'forbidden: member cannot use admin functions'
      using errcode = '42501';
  end if;

  -- 7) Détermine le max selon (role, usage_type)
  v_max_quota := case
    when p_usage_type = 'admin' then v_quota_admin_editor  -- editor + 'admin'
    else v_quota_user                                       -- editor/member + 'user'
  end;

  -- 8) Upsert atomique avec filtre WHERE pour bloquer si quota dépassé
  insert into public.ai_usage (user_id, usage_date, usage_type, count, last_call_at)
  values (p_user_id, current_date, p_usage_type, 1, now())
  on conflict (user_id, usage_date, usage_type)
  do update set
    count = public.ai_usage.count + 1,
    last_call_at = now()
  where public.ai_usage.count < v_max_quota
  returning count into v_count;

  -- 9) Si v_count est null → row existait avec count >= max → quota dépassé
  if v_count is null then
    raise exception 'quota exceeded' using errcode = 'P0001';
  end if;

  return query select
    v_count,
    greatest(0, v_max_quota - v_count),
    v_max_quota;
end;
$$;

-- ========== RPC : lecture seule du compteur ==========
create or replace function public.get_ai_usage(
  p_user_id uuid,
  p_usage_type text
)
returns table(current_count integer, remaining integer, max_quota integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_max_quota integer;
  v_count integer;
  v_quota_user constant integer := 20;
  v_quota_admin_editor constant integer := 50;
  v_unlimited constant integer := 999999;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_usage_type not in ('user', 'admin') then
    raise exception 'invalid usage_type: %', p_usage_type using errcode = '22023';
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if v_role = 'admin' then
    return query select 0, v_unlimited, v_unlimited;
    return;
  end if;

  if p_usage_type = 'admin' and v_role <> 'editor' then
    return query select 0, 0, 0;  -- member sur admin type : montré comme 0/0
    return;
  end if;

  v_max_quota := case
    when p_usage_type = 'admin' then v_quota_admin_editor
    else v_quota_user
  end;

  select count into v_count
  from public.ai_usage
  where user_id = p_user_id
    and usage_date = current_date
    and usage_type = p_usage_type;

  v_count := coalesce(v_count, 0);

  return query select
    v_count,
    greatest(0, v_max_quota - v_count),
    v_max_quota;
end;
$$;

-- ========== RPC ADMIN : vue d'ensemble du jour + breakdown ==========
create or replace function public.get_ai_usage_today_total()
returns table(total_count integer, breakdown_by_function jsonb)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_breakdown jsonb;
begin
  -- Admin only
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  select count(*)::integer into v_total
  from public.ai_usage_detail
  where called_at::date = current_date;

  select coalesce(jsonb_agg(row_to_json(t) order by t.c desc), '[]'::jsonb)
  into v_breakdown
  from (
    select function_name as function, count(*)::integer as c
    from public.ai_usage_detail
    where called_at::date = current_date
    group by function_name
  ) t;

  return query select v_total, v_breakdown;
end;
$$;

-- ========== RPC ADMIN : top N users aujourd'hui ==========
create or replace function public.get_ai_usage_top_users(p_limit integer default 10)
returns table(user_id uuid, username text, role text, call_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  return query
  select
    aud.user_id,
    p.username,
    p.role,
    count(*)::integer as call_count
  from public.ai_usage_detail aud
  join public.profiles p on p.id = aud.user_id
  where aud.called_at::date = current_date
  group by aud.user_id, p.username, p.role
  order by call_count desc
  limit p_limit;
end;
$$;

-- ========== RPC ADMIN : graphique 7 derniers jours ==========
create or replace function public.get_ai_usage_last_7_days()
returns table(day date, total_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  return query
  with date_series as (
    select generate_series(
      current_date - interval '6 days',
      current_date,
      interval '1 day'
    )::date as d
  )
  select
    ds.d,
    coalesce(count(aud.id), 0)::integer as total_count
  from date_series ds
  left join public.ai_usage_detail aud on aud.called_at::date = ds.d
  group by ds.d
  order by ds.d asc;
end;
$$;

-- ========== Droits d'exécution ==========
grant execute on function public.increment_ai_usage(uuid, text, text) to authenticated;
grant execute on function public.get_ai_usage(uuid, text) to authenticated;
grant execute on function public.get_ai_usage_today_total() to authenticated;
grant execute on function public.get_ai_usage_top_users(integer) to authenticated;
grant execute on function public.get_ai_usage_last_7_days() to authenticated;
