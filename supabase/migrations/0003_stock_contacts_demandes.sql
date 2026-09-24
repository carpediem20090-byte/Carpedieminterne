-- Carpe Diem — Gestion interne
-- Stock & rangement, carnet téléphonique, demandes clients

-- 1. Emplacements produits (où est rangé chaque produit)
create table if not exists public.emplacements_produits (
  id uuid primary key default gen_random_uuid(),
  produit text not null,
  emplacement text not null,
  notes text,
  modifie_par uuid not null references public.profiles(id),
  modifie_le timestamptz not null default now()
);

alter table public.emplacements_produits enable row level security;

create policy "Emplacements visibles par tous les utilisateurs connectés"
  on public.emplacements_produits for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut ajouter un emplacement"
  on public.emplacements_produits for insert
  to authenticated
  with check (auth.uid() = modifie_par);

create policy "Tout utilisateur connecté peut modifier un emplacement"
  on public.emplacements_produits for update
  to authenticated
  using (true)
  with check (true);

create policy "Tout utilisateur connecté peut supprimer un emplacement"
  on public.emplacements_produits for delete
  to authenticated
  using (true);


-- 2. Carnet téléphonique
create table if not exists public.contacts_utiles (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  categorie text,
  telephone text not null,
  notes text,
  ajoute_par uuid not null references public.profiles(id),
  ajoute_le timestamptz not null default now()
);

alter table public.contacts_utiles enable row level security;

create policy "Contacts visibles par tous les utilisateurs connectés"
  on public.contacts_utiles for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut ajouter un contact"
  on public.contacts_utiles for insert
  to authenticated
  with check (auth.uid() = ajoute_par);

create policy "Tout utilisateur connecté peut supprimer un contact"
  on public.contacts_utiles for delete
  to authenticated
  using (true);


-- 3. Demandes clients (réassort presse / produit demandé)
create table if not exists public.demandes_clients (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('presse', 'produit')),
  description text not null,
  traitee boolean not null default false,
  demandee_par uuid not null references public.profiles(id),
  demandee_le timestamptz not null default now(),
  traitee_par uuid references public.profiles(id),
  traitee_le timestamptz
);

alter table public.demandes_clients enable row level security;

create policy "Demandes visibles par tous les utilisateurs connectés"
  on public.demandes_clients for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut ajouter une demande"
  on public.demandes_clients for insert
  to authenticated
  with check (auth.uid() = demandee_par);

create policy "Tout utilisateur connecté peut modifier une demande"
  on public.demandes_clients for update
  to authenticated
  using (true)
  with check (true);
