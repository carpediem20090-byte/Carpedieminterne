-- Carpe Diem — Gestion interne
-- Planning : demandes de congés/repos + heures mensuelles (avec dépassement)

-- 1. Demandes de congés / repos
create table if not exists public.demandes_absence (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('conge', 'repos')),
  date_debut date not null,
  date_fin date not null,
  commentaire text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'validee', 'refusee')),
  demandee_par uuid not null references public.profiles(id),
  demandee_le timestamptz not null default now()
);

alter table public.demandes_absence enable row level security;

create policy "Demandes d'absence visibles par tous les utilisateurs connectés"
  on public.demandes_absence for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut créer une demande d'absence"
  on public.demandes_absence for insert
  to authenticated
  with check (auth.uid() = demandee_par);

create policy "Tout utilisateur connecté peut modifier une demande d'absence"
  on public.demandes_absence for update
  to authenticated
  using (true)
  with check (true);

create policy "Tout utilisateur connecté peut supprimer une demande d'absence"
  on public.demandes_absence for delete
  to authenticated
  using (true);


-- 2. Heures mensuelles (déclaratif, sans pointeuse) — un enregistrement par personne et par mois
create table if not exists public.heures_mensuelles (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profiles(id),
  mois date not null, -- toujours le 1er du mois
  heures_travaillees numeric(6, 2),
  heures_contrat numeric(6, 2) not null default 151.67,
  commentaire text,
  modifie_le timestamptz not null default now(),
  unique (profil_id, mois)
);

alter table public.heures_mensuelles enable row level security;

create policy "Heures mensuelles visibles par tous les utilisateurs connectés"
  on public.heures_mensuelles for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut enregistrer ses heures"
  on public.heures_mensuelles for insert
  to authenticated
  with check (true);

create policy "Tout utilisateur connecté peut modifier les heures"
  on public.heures_mensuelles for update
  to authenticated
  using (true)
  with check (true);
