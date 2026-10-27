-- 0039_default_driver.sql
-- Idempotent: safe to run several times in the Supabase SQL editor.
-- « Voiture fantôme » (27/10): a car that drives has a discreet driver at the wheel. Their description is a brand
-- setting (multi-brand, never in the code), frozen in each video at launch so every shot shows the same person.
-- Without a value, the application uses a neutral description. Re-running never overwrites a value already set.

alter table public.brands add column if not exists default_driver_description text;
alter table public.brands drop constraint if exists brands_default_driver_description_check;
alter table public.brands add constraint brands_default_driver_description_check
  check (default_driver_description is null or char_length(default_driver_description) between 3 and 240);
update public.brands
  set default_driver_description = 'one adult West African driver in neat smart-casual clothes, calm and natural'
  where name = 'RIMCO Motors' and default_driver_description is null;

notify pgrst, 'reload schema';
