-- Carpe Diem — Gestion interne
-- Schéma initial : comptes (profiles), relève, colis clients

-- 1. Profils (un par compte, créé automatiquement à l'inscription)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Les profils sont visibles par tous les utilisateurs connectés"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Un utilisateur peut modifier son propre profil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Création automatique du profil à la création du compte (utilise le nom
-- passé dans les métadonnées lors de la création de l'utilisateur)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. Relève — infos du jour à transmettre entre équipes
create table if not exists public.releve (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  auteur_id uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.releve enable row level security;

create policy "Relève visible par tous les utilisateurs connectés"
  on public.releve for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut publier une relève"
  on public.releve for insert
  to authenticated
  with check (auth.uid() = auteur_id);


-- 3. Colis clients — réception (point relais)
create table if not exists public.colis_receptions (
  id uuid primary key default gen_random_uuid(),
  transporteur text not null,
  nb_vrac integer not null default 0,
  nb_sac integer not null default 0,
  nb_retours integer not null default 0,
  commentaire text,
  recu_par uuid not null references public.profiles(id),
  recu_le timestamptz not null default now()
);

alter table public.colis_receptions enable row level security;

create policy "Réceptions colis visibles par tous les utilisateurs connectés"
  on public.colis_receptions for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut enregistrer une réception"
  on public.colis_receptions for insert
  to authenticated
  with check (auth.uid() = recu_par);


-- 4. Colis clients — erreurs de remise (mauvais colis donné à un client)
create table if not exists public.colis_erreurs_remise (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  signale_par uuid not null references public.profiles(id),
  signale_le timestamptz not null default now(),
  resolu boolean not null default false,
  resolu_par uuid references public.profiles(id),
  resolu_le timestamptz
);

alter table public.colis_erreurs_remise enable row level security;

create policy "Erreurs de remise visibles par tous les utilisateurs connectés"
  on public.colis_erreurs_remise for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut signaler une erreur"
  on public.colis_erreurs_remise for insert
  to authenticated
  with check (auth.uid() = signale_par);

create policy "Tout utilisateur connecté peut résoudre une erreur"
  on public.colis_erreurs_remise for update
  to authenticated
  using (true)
  with check (true);
