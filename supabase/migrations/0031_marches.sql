-- Carpe Diem — Gestion interne
-- Ventes sur les marchés : un « marché » regroupe les ventes faites sur place (souvent plusieurs jours),
-- puis tout est passé en caisse d'un coup au retour au tabac (QR récapitulatif).
-- Ajoute une table et deux colonnes facultatives à `ventes_cave` : rien d'existant n'est modifié.

create table if not exists public.marches (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  cree_par uuid default auth.uid() references public.profiles(id) on delete set null,
  cree_le timestamptz not null default now(),
  passe_en_caisse_le timestamptz,
  passe_en_caisse_par uuid references public.profiles(id) on delete set null
);

alter table public.marches enable row level security;
create policy marches_select on public.marches for select to authenticated using (true);
create policy marches_insert on public.marches for insert to authenticated with check (cree_par = auth.uid());
create policy marches_update on public.marches for update to authenticated using (cree_par = auth.uid() or public.is_patron());
create policy marches_delete on public.marches for delete to authenticated using (public.is_patron());

alter table public.ventes_cave add column if not exists marche_id uuid references public.marches(id) on delete set null;
alter table public.ventes_cave add column if not exists paiement text check (paiement in ('especes', 'cb', 'autre'));
create index if not exists ventes_cave_marche_idx on public.ventes_cave (marche_id);

alter table public.ventes_cave drop constraint if exists ventes_cave_mode_check;
alter table public.ventes_cave add constraint ventes_cave_mode_check check (mode in ('codes', 'qr', 'marche'));

-- Toute l'équipe voit les ventes d'un marché (pour le passer en caisse au retour) ;
-- le vendeur peut annuler une vente de marché tant que le marché n'est pas passé en caisse.
create policy ventes_cave_select_marche on public.ventes_cave for select to authenticated using (marche_id is not null);
create policy ventes_cave_delete_marche on public.ventes_cave for delete to authenticated using (
  vendu_par = auth.uid() and marche_id is not null
  and exists (select 1 from public.marches m where m.id = marche_id and m.passe_en_caisse_le is null)
);
