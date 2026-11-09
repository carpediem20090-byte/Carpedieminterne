-- Carpe Diem — Gestion interne
-- Étiquettes : force sur 5 niveaux (même échelle que le classement officiel Habanos et que l'appli cigares).
--   avant : 1 léger · 2 moyen · 3 moyen-corsé · 4 corsé
--   après : 1 léger · 2 léger à moyen · 3 moyen · 4 moyen à corsé · 5 corsé
-- À exécuter UNE SEULE FOIS dans Supabase → SQL Editor (projet de l'appli interne).

alter table public.etiquettes_articles drop constraint if exists etiquettes_articles_force_check;

update public.etiquettes_articles
   set force = case force when 2 then 3 when 3 then 4 when 4 then 5 else force end
 where force is not null;

alter table public.etiquettes_articles
  add constraint etiquettes_articles_force_check check (force between 1 and 5);
