-- Carpe Diem — Gestion interne
-- Catalogue de produits par fournisseur : une liste de produits qu'on note
-- au fil de l'eau (dès qu'on voit qu'il faut quelque chose), pour pouvoir
-- ensuite, quand le représentant est devant nous, cliquer directement sur
-- ce qu'on veut au lieu de tout retaper à chaque fois.

create table if not exists public.produits_catalogue (
  id uuid primary key default gen_random_uuid(),
  fournisseur_id uuid not null references public.fournisseurs(id) on delete cascade,
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
