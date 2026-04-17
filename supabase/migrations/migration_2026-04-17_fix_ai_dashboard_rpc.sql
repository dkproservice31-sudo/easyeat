-- ====================================================================
-- MIGRATION CORRECTIVE : fix 2 RPC dashboard IA
-- Appliquée le 2026-04-17 via mcp__supabase__apply_migration
-- Nom technique Supabase : fix_ai_dashboard_rpc_2026_04_17
-- ====================================================================
-- BUG 1 : get_ai_usage_top_users → le OUT param "role" de RETURNS TABLE
--   shadowait la colonne profiles.role dans le check admin, provoquant
--   "column reference role is ambiguous" → RPC en échec silencieux.
--   Fix : qualifier profiles.role via alias prof dans le check admin,
--   et remplacer "order by call_count" par "order by count(*)" pour
--   éviter toute ambiguïté avec l'alias de retour.
-- BUG 2 : get_ai_usage_today_total → le breakdown renvoyait l'alias "c"
--   au lieu de "count" attendu par le front (AIMonitoringDashboard.js).
--   Fix : renommer l'alias en "count" dans le sous-SELECT.
--   Ajoute aussi le check admin manquant (cohérence avec les autres
--   RPC dashboard get_ai_usage_top_users et get_ai_usage_last_7_days).
-- ====================================================================
-- Non-destructif : CREATE OR REPLACE sur 2 fonctions existantes,
-- aucune donnée touchée, tables intactes, grants préservés.
-- ====================================================================

create or replace function public.get_ai_usage_top_users(p_limit integer default 10)
returns table(user_id uuid, username text, role text, call_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles prof
    where prof.id = auth.uid() and prof.role = 'admin'
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
  order by count(*) desc
  limit p_limit;
end;
$$;

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
  if not exists (
    select 1 from public.profiles prof
    where prof.id = auth.uid() and prof.role = 'admin'
  ) then
    raise exception 'forbidden: admin only' using errcode = '42501';
  end if;

  select count(*)::integer into v_total
  from public.ai_usage_detail
  where called_at::date = current_date;

  select coalesce(jsonb_agg(row_to_json(t) order by t.count desc), '[]'::jsonb)
  into v_breakdown
  from (
    select function_name as function, count(*)::integer as count
    from public.ai_usage_detail
    where called_at::date = current_date
    group by function_name
  ) t;

  return query select v_total, v_breakdown;
end;
$$;
