-- 0015: autoriser la route serveur de validation à utiliser service_role.
-- L'API authentifie et vérifie le rôle, la marque et le département avant la mise à jour.
-- Le trigger conserve donc la vérification auth.uid() pour les mises à jour directes,
-- et reconnaît explicitement le rôle service_role pour les opérations serveur contrôlées.
create or replace function public.guard_validation_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.video_id is distinct from old.video_id or new.version_id is distinct from old.version_id
    or new.submitted_by is distinct from old.submitted_by or new.created_at is distinct from old.created_at then
    raise exception using errcode='42501', message='Champs de validation non modifiables';
  end if;
  if old.status <> 'pending' or new.status not in ('approved','rejected')
    or (current_setting('request.jwt.claim.role', true) <> 'service_role' and new.reviewed_by <> auth.uid())
    or new.reviewed_at is null then
    raise exception using errcode='42501', message='Transition de validation non autorisée';
  end if;
  if new.status='rejected' and length(trim(coalesce(new.reason,'')))=0 then
    raise exception using errcode='22023', message='Un motif est obligatoire pour refuser une vidéo';
  end if;
  return new;
end $$;
