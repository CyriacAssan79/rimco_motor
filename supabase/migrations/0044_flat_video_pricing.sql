-- 0044_flat_video_pricing.sql · O01 (29/10/2026) : forfait par vidéo et par niveau, jusqu'à 30 s de clips.
-- Idempotent. Requiert 0042. Numéro 0044 : le 0043 est réservé au patch « optimisation vitesse » (L04).
-- Les colonnes de la grille à la seconde (grid_fcfa_per_second_*) restent en place : historique et retour arrière.
-- Le journal des coûts (usage_ledger.price_fcfa) garde le prix figé de chaque vidéo déjà lancée : rien n'est réécrit.
alter table public.pricing_settings add column if not exists video_price_fcfa_standard numeric(14,0) not null default 13000;
alter table public.pricing_settings add column if not exists video_price_fcfa_pro numeric(14,0) not null default 18000;
alter table public.pricing_settings add column if not exists video_price_fcfa_premium numeric(14,0) not null default 19000;
alter table public.pricing_settings drop constraint if exists pricing_settings_video_price_positive;
alter table public.pricing_settings add constraint pricing_settings_video_price_positive
  check (video_price_fcfa_standard > 0 and video_price_fcfa_pro > 0 and video_price_fcfa_premium > 0);

-- Trace du passage au forfait dans le journal des tarifs (une seule fois par marque).
insert into public.pricing_change_log(scope, brand_id, client_id, field, old_value, new_value)
select 'pricing', p.brand_id, b.client_id, 'Passage au forfait par vidéo (0044)', 'Grille à la seconde',
       p.video_price_fcfa_standard::text || ' / ' || p.video_price_fcfa_pro::text || ' / ' || p.video_price_fcfa_premium::text || ' FCFA (Standard / Pro / Premium)'
from public.pricing_settings p join public.brands b on b.id = p.brand_id
where not exists (select 1 from public.pricing_change_log l where l.brand_id = p.brand_id and l.field = 'Passage au forfait par vidéo (0044)');

notify pgrst, 'reload schema';
