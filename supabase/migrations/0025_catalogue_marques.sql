-- Carpe Diem — Gestion interne
-- Catalogue de commande rapide, organisé par marque : chaque marque peut
-- être rattachée à un fournisseur (quand on sait chez qui on la commande),
-- et chaque marque a sa propre liste de produits. Permet, quand le
-- représentant est devant nous, de cliquer directement sur les produits ou
-- sur toute une marque pour les ajouter à la commande, au lieu de tout
-- retaper à chaque fois.

create table if not exists public.marques (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  fournisseur_id uuid references public.fournisseurs(id) on delete set null,
  cree_par uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.marques enable row level security;

drop policy if exists marques_select on public.marques;
create policy marques_select on public.marques for select
  to authenticated using (true);

drop policy if exists marques_insert on public.marques;
create policy marques_insert on public.marques for insert
  to authenticated with check (auth.uid() = cree_par);

drop policy if exists marques_update on public.marques;
create policy marques_update on public.marques for update
  to authenticated using (true);

drop policy if exists marques_delete on public.marques;
create policy marques_delete on public.marques for delete
  to authenticated using (true);

create table if not exists public.produits_catalogue (
  id uuid primary key default gen_random_uuid(),
  marque_id uuid not null references public.marques(id) on delete cascade,
  nom text not null,
  cree_par uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.produits_catalogue enable row level security;

drop policy if exists produits_catalogue_select on public.produits_catalogue;
create policy produits_catalogue_select on public.produits_catalogue for select
  to authenticated using (true);

drop policy if exists produits_catalogue_insert on public.produits_catalogue;
create policy produits_catalogue_insert on public.produits_catalogue for insert
  to authenticated with check (auth.uid() = cree_par);

drop policy if exists produits_catalogue_delete on public.produits_catalogue;
create policy produits_catalogue_delete on public.produits_catalogue for delete
  to authenticated using (true);
