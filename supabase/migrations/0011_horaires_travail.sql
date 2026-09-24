-- Carpe Diem — Gestion interne
-- Planning : horaires de travail réels (construits par les patrons)
-- + demandes de changement d'horaire (envoyées par les employés)

create table if not exists public.horaires_travail (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profiles(id),
  jour date not null,
  heure_debut time not null,
  heure_fin time not null,
  notes text,
  cree_par uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.horaires_travail enable row level security;

create policy horaires_travail_select on public.horaires_travail for select
  to authenticated using (true);

create policy horaires_travail_insert_patron on public.horaires_travail for insert
  to authenticated with check (auth.uid() = cree_par and public.is_patron());

create policy horaires_travail_update_patron on public.horaires_travail for update
  to authenticated using (public.is_patron()) with check (public.is_patron());

create policy horaires_travail_delete_patron on public.horaires_travail for delete
  to authenticated using (public.is_patron());


create table if not exists public.demandes_modification_horaire (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profiles(id),
  jour date,
  message text not null,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'traitee')),
  reponse text,
  cree_le timestamptz not null default now(),
  traitee_le timestamptz
);

alter table public.demandes_modification_horaire enable row level security;

create policy demandes_mod_horaire_select on public.demandes_modification_horaire for select
  to authenticated using (true);

create policy demandes_mod_horaire_insert on public.demandes_modification_horaire for insert
  to authenticated with check (auth.uid() = profil_id);

create policy demandes_mod_horaire_update_patron on public.demandes_modification_horaire for update
  to authenticated using (public.is_patron()) with check (public.is_patron());

create policy demandes_mod_horaire_delete_patron on public.demandes_modification_horaire for delete
  to authenticated using (public.is_patron());
