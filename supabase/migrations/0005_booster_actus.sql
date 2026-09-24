-- Carpe Diem — Gestion interne
-- Produits à booster + actus / infos produits

-- 1. Produits à booster
create table if not exists public.produits_booster (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  raison text,
  actif boolean not null default true,
  ajoute_par uuid not null references public.profiles(id),
  ajoute_le timestamptz not null default now()
);

alter table public.produits_booster enable row level security;

create policy produits_booster_select on public.produits_booster for select
  to authenticated using (true);

create policy produits_booster_insert on public.produits_booster for insert
  to authenticated with check (auth.uid() = ajoute_par);

create policy produits_booster_update on public.produits_booster for update
  to authenticated using (true) with check (true);

create policy produits_booster_delete on public.produits_booster for delete
  to authenticated using (true);


-- 2. Actus / infos produits (nouveautés, infos utiles à toute l'équipe)
create table if not exists public.actus (
  id uuid primary key default gen_random_uuid(),
  titre text not null,
  contenu text not null,
  photo_url text,
  auteur_id uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.actus enable row level security;

create policy actus_select on public.actus for select
  to authenticated using (true);

create policy actus_insert on public.actus for insert
  to authenticated with check (auth.uid() = auteur_id);

create policy actus_delete on public.actus for delete
  to authenticated using (true);
