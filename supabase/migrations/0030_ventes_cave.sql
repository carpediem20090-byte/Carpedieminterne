-- Carpe Diem — Gestion interne
-- Historique des ventes faites avec le « Panier cave » (qui a vendu quoi).
-- Nouvelle table indépendante : ne modifie aucune table existante.

create table if not exists public.ventes_cave (
  id uuid primary key default gen_random_uuid(),
  vendu_par uuid default auth.uid() references public.profiles(id) on delete set null,
  vendu_le timestamptz not null default now(),
  client text,
  -- détail figé au moment de la vente : [{code, num, nom, prix, qte}]
  lignes jsonb not null default '[]'::jsonb,
  nb_articles integer not null default 0,
  total numeric(10,2) not null default 0,
  mode text not null default 'codes' check (mode in ('codes', 'qr'))
);

create index if not exists ventes_cave_vendu_le_idx on public.ventes_cave (vendu_le desc);
create index if not exists ventes_cave_vendu_par_idx on public.ventes_cave (vendu_par);

alter table public.ventes_cave enable row level security;

-- Chacun enregistre ses propres ventes ; un employé voit les siennes, les patrons voient tout ;
-- seuls les patrons suppriment.
create policy ventes_cave_insert on public.ventes_cave for insert to authenticated with check (vendu_par = auth.uid());
create policy ventes_cave_select on public.ventes_cave for select to authenticated using (vendu_par = auth.uid() or public.is_patron());
create policy ventes_cave_delete on public.ventes_cave for delete to authenticated using (public.is_patron());
