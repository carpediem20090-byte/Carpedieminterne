-- Carpe Diem — Gestion interne
-- Avoirs / échanges : produits ramenés par un client (avoir ou échange) ou
-- reçus cassés d'un fournisseur.

create table if not exists public.avoirs_echanges (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('avoir_client', 'echange_client', 'produit_casse')),
  description text not null,
  montant numeric(8, 2),
  reponse text,
  traite boolean not null default false,
  signale_par uuid not null references public.profiles(id),
  signale_le timestamptz not null default now(),
  traite_par uuid references public.profiles(id),
  traite_le timestamptz
);

alter table public.avoirs_echanges enable row level security;

drop policy if exists avoirs_echanges_select on public.avoirs_echanges;
create policy avoirs_echanges_select on public.avoirs_echanges for select
  to authenticated using (true);

drop policy if exists avoirs_echanges_insert on public.avoirs_echanges;
create policy avoirs_echanges_insert on public.avoirs_echanges for insert
  to authenticated with check (auth.uid() = signale_par);

drop policy if exists avoirs_echanges_update on public.avoirs_echanges;
create policy avoirs_echanges_update on public.avoirs_echanges for update
  to authenticated using (true) with check (true);

drop policy if exists avoirs_echanges_delete on public.avoirs_echanges;
create policy avoirs_echanges_delete on public.avoirs_echanges for delete
  to authenticated using (true);
