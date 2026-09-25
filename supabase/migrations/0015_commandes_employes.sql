-- Carpe Diem — Gestion interne
-- Les employés ont maintenant accès au module "Commandes fournisseurs"
-- (avant réservé aux patrons). On remplace les policies patron-only par des
-- policies ouvertes à tous les comptes connectés.

-- 1. Commandes fournisseurs
drop policy if exists commandes_select_patron on public.commandes_fournisseurs;
drop policy if exists commandes_insert_patron on public.commandes_fournisseurs;
drop policy if exists commandes_update_patron on public.commandes_fournisseurs;

create policy commandes_select on public.commandes_fournisseurs for select
  to authenticated using (true);

create policy commandes_insert on public.commandes_fournisseurs for insert
  to authenticated with check (auth.uid() = creee_par);

create policy commandes_update on public.commandes_fournisseurs for update
  to authenticated using (true) with check (true);

-- 2. Réceptions fournisseur
drop policy if exists receptions_select_patron on public.receptions_fournisseur;
drop policy if exists receptions_insert_patron on public.receptions_fournisseur;

create policy receptions_select on public.receptions_fournisseur for select
  to authenticated using (true);

create policy receptions_insert on public.receptions_fournisseur for insert
  to authenticated with check (auth.uid() = recu_par);

-- 3. Documents stockés liés aux commandes (photo du colis reçu et photo de la
-- facture jointe à la réception) : accessibles à tous. Le dossier "factures"
-- (module Factures, séparé) reste réservé aux patrons.
drop policy if exists documents_select_patron on storage.objects;
drop policy if exists documents_insert_patron on storage.objects;

create policy documents_select_commandes on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in ('colis-fournisseur', 'factures-reception')
  );

create policy documents_insert_commandes on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in ('colis-fournisseur', 'factures-reception')
  );

create policy documents_select_factures_patron on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'factures'
    and public.is_patron()
  );

create policy documents_insert_factures_patron on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'factures'
    and public.is_patron()
  );
