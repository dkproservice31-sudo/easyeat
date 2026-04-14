-- EasyEat — schéma initial
-- À exécuter dans Supabase > SQL Editor

-- ========== PROFILES ==========
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text,
  avatar_url text,
  bio text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.profiles enable row level security;

-- Tout le monde peut lire les profils publics
drop policy if exists "profiles are viewable by everyone" on public.profiles;
create policy "profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- Un utilisateur peut créer son propre profil
drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Un utilisateur peut modifier son propre profil
drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- ========== TRIGGER: création auto du profil à l'inscription ==========
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ========== UPDATED_AT auto ==========
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ========== RECIPES ==========
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  ingredients text,
  steps text,
  servings int,
  duration_minutes int,
  fat_type text,
  cooking_type text,
  cooking_temp integer,
  image_url text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists recipes_user_id_idx on public.recipes(user_id);
create index if not exists recipes_created_at_idx on public.recipes(created_at desc);

alter table public.recipes enable row level security;

-- Lecture : un utilisateur voit ses propres recettes OU les recettes featured
-- (catalogue commun français/italien/espagnol).
drop policy if exists "recipes are viewable by everyone" on public.recipes;
drop policy if exists "users can view own or featured recipes" on public.recipes;
create policy "users can view own or featured recipes"
  on public.recipes for select
  using (auth.uid() = user_id or featured = true);

-- Un utilisateur ne peut créer une recette qu'en son propre nom
drop policy if exists "users can insert own recipes" on public.recipes;
create policy "users can insert own recipes"
  on public.recipes for insert
  with check (auth.uid() = user_id);

-- Un utilisateur peut modifier ses propres recettes
drop policy if exists "users can update own recipes" on public.recipes;
create policy "users can update own recipes"
  on public.recipes for update
  using (auth.uid() = user_id);

-- Un utilisateur peut supprimer ses propres recettes
drop policy if exists "users can delete own recipes" on public.recipes;
create policy "users can delete own recipes"
  on public.recipes for delete
  using (auth.uid() = user_id);

-- Migration pour tables existantes
alter table public.recipes add column if not exists fat_type text;
alter table public.recipes add column if not exists cooking_type text;
alter table public.recipes add column if not exists cooking_temp integer;
alter table public.recipes add column if not exists generated_by_ai boolean default false;
alter table public.recipes add column if not exists featured boolean default false;
create index if not exists recipes_featured_idx on public.recipes(featured) where featured = true;
alter table public.recipes add column if not exists cuisine text;
create index if not exists recipes_cuisine_idx on public.recipes(cuisine) where cuisine is not null;

drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- ========== CUSTOM OPTIONS (chips personnalisés par utilisateur) ==========
create table if not exists public.custom_options (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_type text not null check (option_type in ('fat_type', 'cooking_type')),
  value text not null,
  created_at timestamptz default now() not null,
  unique (user_id, option_type, value)
);

create index if not exists custom_options_user_type_idx
  on public.custom_options(user_id, option_type);

alter table public.custom_options enable row level security;

drop policy if exists "users can view own custom options" on public.custom_options;
create policy "users can view own custom options"
  on public.custom_options for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own custom options" on public.custom_options;
create policy "users can insert own custom options"
  on public.custom_options for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own custom options" on public.custom_options;
create policy "users can delete own custom options"
  on public.custom_options for delete
  using (auth.uid() = user_id);

-- ========== FRIDGE ITEMS ==========
create table if not exists public.fridge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'unité',
  created_at timestamptz default now() not null
);

create index if not exists fridge_items_user_idx on public.fridge_items(user_id);

alter table public.fridge_items enable row level security;

drop policy if exists "users can view own fridge" on public.fridge_items;
create policy "users can view own fridge"
  on public.fridge_items for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own fridge" on public.fridge_items;
create policy "users can insert own fridge"
  on public.fridge_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can update own fridge" on public.fridge_items;
create policy "users can update own fridge"
  on public.fridge_items for update
  using (auth.uid() = user_id);

drop policy if exists "users can delete own fridge" on public.fridge_items;
create policy "users can delete own fridge"
  on public.fridge_items for delete
  using (auth.uid() = user_id);

-- ========== SHOPPING HISTORY ==========
create table if not exists public.shopping_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  items jsonb not null,
  created_at timestamptz default now() not null
);

create index if not exists shopping_history_user_idx
  on public.shopping_history(user_id, created_at desc);

alter table public.shopping_history enable row level security;

drop policy if exists "users can view own history" on public.shopping_history;
create policy "users can view own history"
  on public.shopping_history for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own history" on public.shopping_history;
create policy "users can insert own history"
  on public.shopping_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own history" on public.shopping_history;
create policy "users can delete own history"
  on public.shopping_history for delete
  using (auth.uid() = user_id);
