-- Carpe Diem — Gestion interne
-- Fusionne "Erreurs de remise" dans la Relève : au lieu d'un module à part,
-- chaque message de la Relève a maintenant une catégorie (Info / Colis /
-- Mission / Autre), et peut être répondu et marqué "traité", comme
-- pouvaient déjà l'être les erreurs de remise.

alter table public.releve
  add column if not exists categorie text not null default 'info',
  add column if not exists reponse text,
  add column if not exists traite boolean not null default false,
  add column if not exists traite_par uuid references public.profiles(id),
  add column if not exists traite_le timestamptz;

alter table public.releve drop constraint if exists releve_categorie_check;
alter table public.releve
  add constraint releve_categorie_check check (categorie in ('info', 'colis', 'mission', 'autre'));

-- Reprise de l'historique des erreurs de remise dans la Relève, pour ne rien perdre.
insert into public.releve (message, auteur_id, cree_le, categorie, reponse, traite, traite_par, traite_le)
select description, signale_par, signale_le, 'colis', reponse, resolu, resolu_par, resolu_le
from public.colis_erreurs_remise;

drop policy if exists "Tout utilisateur connecté peut résoudre une erreur" on public.colis_erreurs_remise;
drop policy if exists releve_update on public.releve;
create policy releve_update on public.releve for update
  to authenticated
  using (true)
  with check (true);
