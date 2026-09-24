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

create policy "Produits à booster visibles par tous les utilisateurs connectés"
  on public.produits_booster for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut ajouter un produit à booster"
  on public.produits_booster for insert
  to authenticated
  with check (auth.uid() = ajoute_par);

create policy "Tout utilisateur connecté peut modifier un produit à booster"
  on public.produits_booster for update
  to authenticated
  using (true)
  with check (true);

create policy "Tout utilisateur connecté peut supprimer un produit à booster"
  on public.produits_booster for delete
  to authenticated
  using (true);


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

create policy "Actus visibles par tous les utilisateurs connectés"
  on public.actus for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut publier une actu"
  on public.actus for insert
  to authenticated
  with check (auth.uid() = auteur_id);

create policy "Tout utilisateur connecté peut supprimer une actu"
  on public.actus for delete
  to authenticated
  using (true);
