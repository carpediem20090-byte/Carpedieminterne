-- Carpe Diem — Gestion interne
-- Commandes fournisseurs : nouvelle étape "à commander" avant "commandée",
-- et le fournisseur devient facultatif (on peut noter un produit à commander
-- sans encore savoir chez qui on va le commander).

-- 1. Le fournisseur n'est plus obligatoire
alter table public.commandes_fournisseurs
  alter column fournisseur drop not null;

-- 2. Renommer le statut existant "en_attente" (= déjà commandée, en attente de
-- réception) en "commande", et ajouter le nouveau statut "a_commander".
alter table public.commandes_fournisseurs
  drop constraint if exists commandes_fournisseurs_statut_check;

update public.commandes_fournisseurs
  set statut = 'commande'
  where statut = 'en_attente';

alter table public.commandes_fournisseurs
  add constraint commandes_fournisseurs_statut_check
  check (statut in ('a_commander', 'commande', 'recue', 'annulee'));

alter table public.commandes_fournisseurs
  alter column statut set default 'a_commander';
