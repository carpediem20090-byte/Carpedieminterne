-- Carpe Diem — Gestion interne
-- Planning : un commentaire libre par jour (info à savoir ce jour-là), visible par tous

create table if not exists public.notes_planning (
  id uuid primary key default gen_random_uuid(),
  jour date not null unique,
  note text not null,
  modifie_par uuid not null references public.profiles(id),
  modifie_le timestamptz not null default now()
);

alter table public.notes_planning enable row level security;

create policy notes_planning_select on public.notes_planning for select
  to authenticated using (true);

create policy notes_planning_insert_patron on public.notes_planning for insert
  to authenticated with check (auth.uid() = modifie_par and public.is_patron());

create policy notes_planning_update_patron on public.notes_planning for update
  to authenticated using (public.is_patron()) with check (public.is_patron());

create policy notes_planning_delete_patron on public.notes_planning for delete
  to authenticated using (public.is_patron());
