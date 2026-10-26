-- 0031_brand_driving_and_market.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- Brand settings read by the prompts (multi-brand: never hard-coded).

-- 1. Traffic side of the roads shown in the videos, and steering wheel side of the vehicles.
alter table public.brands add column if not exists traffic_side text not null default 'right';
alter table public.brands drop constraint if exists brands_traffic_side_check;
alter table public.brands add constraint brands_traffic_side_check check (traffic_side in ('right','left'));
alter table public.brands add column if not exists steering_side text not null default 'left';
alter table public.brands drop constraint if exists brands_steering_side_check;
alter table public.brands add constraint brands_steering_side_check check (steering_side in ('left','right'));

-- 2. City and country of the brand's market, used as the geographic anchor of every scene.
alter table public.brands add column if not exists market_location text not null default '';
update public.brands set market_location = 'Abidjan, Côte d''Ivoire' where name = 'RIMCO Motors' and market_location = '';

notify pgrst, 'reload schema';
