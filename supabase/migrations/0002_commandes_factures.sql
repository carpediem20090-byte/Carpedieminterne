-- Carpe Diem — Gestion interne
-- Commandes fournisseurs + factures

-- 1. Commandes fournisseurs
create table if not exists public.commandes_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  fournisseur text not null,
  produits text not null, -- description libre de la commande (produits, quantités)
  date_commande timestamptz not null default now(),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'recue', 'annulee')),
  creee_par uuid not null references public.profiles(id)
);

alter table public.commandes_fournisseurs enable row level security;

create policy "Commandes visibles par tous les utilisateurs connectés"
  on public.commandes_fournisseurs for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut créer une commande"
  on public.commandes_fournisseurs for insert
  to authenticated
  with check (auth.uid() = creee_par);

create policy "Tout utilisateur connecté peut modifier une commande"
  on public.commandes_fournisseurs for update
  to authenticated
  using (true)
  with check (true);


-- 2. Réception d'une commande fournisseur (photo colis + facture, qui a réceptionné)
create table if not exists public.receptions_fournisseur (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commandes_fournisseurs(id) on delete cascade,
  photo_colis_url text,
  photo_facture_url text,
  recu_par uuid not null references public.profiles(id),
  recu_le timestamptz not null default now(),
  commentaire text
);

alter table public.receptions_fournisseur enable row level security;

create policy "Réceptions fournisseur visibles par tous les utilisateurs connectés"
  on public.receptions_fournisseur for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut enregistrer une réception fournisseur"
  on public.receptions_fournisseur for insert
  to authenticated
  with check (auth.uid() = recu_par);

-- Quand une réception est ajoutée, la commande passe automatiquement en "reçue"
create or replace function public.marquer_commande_recue()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.commandes_fournisseurs
  set statut = 'recue'
  where id = new.commande_id;
  return new;
end;
$$;

drop trigger if exists on_reception_fournisseur on public.receptions_fournisseur;
create trigger on_reception_fournisseur
  after insert on public.receptions_fournisseur
  for each row execute procedure public.marquer_commande_recue();


-- 3. Factures (PDF ou photo, upload libre, rattachable à une commande)
create table if not exists public.factures (
  id uuid primary key default gen_random_uuid(),
  fichier_url text not null,
  fichier_nom text not null,
  fournisseur text,
  montant numeric(10, 2),
  date_facture date,
  commande_id uuid references public.commandes_fournisseurs(id) on delete set null,
  ajoutee_par uuid not null references public.profiles(id),
  ajoutee_le timestamptz not null default now(),
  notes text
);

alter table public.factures enable row level security;

create policy "Factures visibles par tous les utilisateurs connectés"
  on public.factures for select
  to authenticated
  using (true);

create policy "Tout utilisateur connecté peut ajouter une facture"
  on public.factures for insert
  to authenticated
  with check (auth.uid() = ajoutee_par);

create policy "Tout utilisateur connecté peut modifier une facture"
  on public.factures for update
  to authenticated
  using (true)
  with check (true);


-- 4. Stockage : bucket pour les photos de colis/factures
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "Documents visibles par les utilisateurs connectés"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents');

create policy "Les utilisateurs connectés peuvent déposer des documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents');
