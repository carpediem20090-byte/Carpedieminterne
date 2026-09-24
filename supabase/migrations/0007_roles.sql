-- Carpe Diem — Gestion interne
-- Rôles : patron (accès complet) / employé (accès restreint)
-- ⚠️ À exécuter après 0001 à 0004 (utilise commandes_fournisseurs, factures,
--    heures_mensuelles, demandes_absence, storage "documents").

-- 1. Colonne rôle sur les profils
alter table public.profiles
  add column if not exists role text not null default 'employe' check (role in ('patron', 'employe'));

-- Fonction utilitaire : la personne connectée est-elle patron ?
create or replace function public.is_patron()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'patron'
  );
$$;

-- 2. Profils : chacun modifie son propre profil mais ne peut pas changer son
-- propre rôle ; un patron peut modifier n'importe quel profil (y compris le rôle)
drop policy if exists "Un utilisateur peut modifier son propre profil" on public.profiles;

create policy profiles_update_self on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

create policy profiles_update_patron on public.profiles for update
  to authenticated
  using (public.is_patron())
  with check (public.is_patron());


-- 3. Commandes fournisseurs — réservé aux patrons
drop policy if exists "Commandes visibles par tous les utilisateurs connectés" on public.commandes_fournisseurs;
drop policy if exists "Tout utilisateur connecté peut créer une commande" on public.commandes_fournisseurs;
drop policy if exists "Tout utilisateur connecté peut modifier une commande" on public.commandes_fournisseurs;

create policy commandes_select_patron on public.commandes_fournisseurs for select
  to authenticated using (public.is_patron());

create policy commandes_insert_patron on public.commandes_fournisseurs for insert
  to authenticated with check (auth.uid() = creee_par and public.is_patron());

create policy commandes_update_patron on public.commandes_fournisseurs for update
  to authenticated using (public.is_patron()) with check (public.is_patron());


-- 4. Réceptions fournisseur — réservé aux patrons
drop policy if exists "Réceptions fournisseur visibles par tous les utilisateurs connectés" on public.receptions_fournisseur;
drop policy if exists "Tout utilisateur connecté peut enregistrer une réception fournisseur" on public.receptions_fournisseur;

create policy receptions_select_patron on public.receptions_fournisseur for select
  to authenticated using (public.is_patron());

create policy receptions_insert_patron on public.receptions_fournisseur for insert
  to authenticated with check (auth.uid() = recu_par and public.is_patron());


-- 5. Factures — réservé aux patrons
drop policy if exists "Factures visibles par tous les utilisateurs connectés" on public.factures;
drop policy if exists "Tout utilisateur connecté peut ajouter une facture" on public.factures;
drop policy if exists "Tout utilisateur connecté peut modifier une facture" on public.factures;

create policy factures_select_patron on public.factures for select
  to authenticated using (public.is_patron());

create policy factures_insert_patron on public.factures for insert
  to authenticated with check (auth.uid() = ajoutee_par and public.is_patron());

create policy factures_update_patron on public.factures for update
  to authenticated using (public.is_patron()) with check (public.is_patron());


-- 6. Heures mensuelles — réservé aux patrons
drop policy if exists heures_mensuelles_select on public.heures_mensuelles;
drop policy if exists heures_mensuelles_insert on public.heures_mensuelles;
drop policy if exists heures_mensuelles_update on public.heures_mensuelles;

create policy heures_mensuelles_select_patron on public.heures_mensuelles for select
  to authenticated using (public.is_patron());

create policy heures_mensuelles_insert_patron on public.heures_mensuelles for insert
  to authenticated with check (public.is_patron());

create policy heures_mensuelles_update_patron on public.heures_mensuelles for update
  to authenticated using (public.is_patron()) with check (public.is_patron());


-- 7. Demandes de congés/repos — tout le monde peut poser/voir,
-- seul un patron valide/modifie/supprime
drop policy if exists demandes_absence_update on public.demandes_absence;
drop policy if exists demandes_absence_delete on public.demandes_absence;

create policy demandes_absence_update_patron on public.demandes_absence for update
  to authenticated using (public.is_patron()) with check (public.is_patron());

create policy demandes_absence_delete_patron on public.demandes_absence for delete
  to authenticated using (public.is_patron());


-- 8. Documents stockés (bucket "documents") : les photos d'actus restent
-- visibles par tous, le reste (colis fournisseurs, factures) réservé aux patrons
drop policy if exists "Documents visibles par les utilisateurs connectés" on storage.objects;
drop policy if exists "Les utilisateurs connectés peuvent déposer des documents" on storage.objects;

create policy documents_select_actus on storage.objects for select
  to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = 'actus');

create policy documents_select_patron on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in ('factures', 'colis-fournisseur', 'factures-reception')
    and public.is_patron()
  );

create policy documents_insert_actus on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = 'actus');

create policy documents_insert_patron on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in ('factures', 'colis-fournisseur', 'factures-reception')
    and public.is_patron()
  );


-- 9. Bootstrap : le compte gérant devient patron
update public.profiles p
set role = 'patron'
from auth.users u
where p.id = u.id and u.email = 'carpediem20090@gmail.com';
