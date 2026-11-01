-- Carpe Diem — Gestion interne
-- Étiquettes prix (cigares + tous les rayons)
-- Nouvelle table indépendante : ne modifie aucune table existante.

create table if not exists public.etiquettes_articles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{12,13}$'),
  num text,
  rayon text not null default 'Cigares',
  marque text,
  modele text,
  prix numeric(10,2) not null default 0,
  origine text,
  temps integer,
  force smallint check (force between 1 and 4),
  force_source text,
  compo text[],
  infos text[],
  a_verifier boolean not null default false,
  modifie_par uuid references public.profiles(id) on delete set null,
  modifie_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);

create index if not exists etiquettes_articles_rayon_idx on public.etiquettes_articles (rayon);

alter table public.etiquettes_articles enable row level security;

-- Toute l'équipe connectée lit, crée et modifie ; seuls les patrons suppriment.
create policy etiquettes_select on public.etiquettes_articles for select to authenticated using (true);
create policy etiquettes_insert on public.etiquettes_articles for insert to authenticated with check (true);
create policy etiquettes_update on public.etiquettes_articles for update to authenticated using (true) with check (true);
create policy etiquettes_delete on public.etiquettes_articles for delete to authenticated using (public.is_patron());
