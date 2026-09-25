-- Carpe Diem — Gestion interne
-- Fournisseurs comme véritable liste (au lieu d'un simple texte libre) :
-- permet de cliquer sur un fournisseur pour voir tout son historique
-- (commandes, produits reçus cassés), et de le choisir dans un menu déroulant
-- partout où on le renseignait avant en texte libre.

create table if not exists public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  telephone text,
  notes text,
  cree_par uuid not null references public.profiles(id),
  cree_le timestamptz not null default now()
);

alter table public.fournisseurs enable row level security;

drop policy if exists fournisseurs_select on public.fournisseurs;
create policy fournisseurs_select on public.fournisseurs for select
  to authenticated using (true);

drop policy if exists fournisseurs_insert on public.fournisseurs;
create policy fournisseurs_insert on public.fournisseurs for insert
  to authenticated with check (auth.uid() = cree_par);

drop policy if exists fournisseurs_update on public.fournisseurs;
create policy fournisseurs_update on public.fournisseurs for update
  to authenticated using (true) with check (true);

drop policy if exists fournisseurs_delete on public.fournisseurs;
create policy fournisseurs_delete on public.fournisseurs for delete
  to authenticated using (true);

-- Reprise des fournisseurs déjà tapés en texte libre dans les commandes
-- existantes, pour ne rien perdre.
insert into public.fournisseurs (nom, cree_par)
select distinct on (lower(trim(c.fournisseur)))
  trim(c.fournisseur),
  c.creee_par
from public.commandes_fournisseurs c
where c.fournisseur is not null and trim(c.fournisseur) <> ''
on conflict (nom) do nothing;

-- Lien vers la table fournisseurs, en plus du texte existant (conservé pour
-- historique / cas où le rapprochement automatique échouerait).
alter table public.commandes_fournisseurs
  add column if not exists fournisseur_id uuid references public.fournisseurs(id);

update public.commandes_fournisseurs c
set fournisseur_id = f.id
from public.fournisseurs f
where c.fournisseur_id is null
  and c.fournisseur is not null
  and lower(trim(c.fournisseur)) = lower(f.nom);

alter table public.avoirs_echanges
  add column if not exists fournisseur_id uuid references public.fournisseurs(id);
