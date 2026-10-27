import { HttpError, type Role } from '@/core/auth/guards';
import { hasAdminRights } from '@/core/auth/roles';

export function assertPlaceUploadAdmin(role: Role): void {
  if (!hasAdminRights({ role })) throw new HttpError(403, 'L’ajout de lieux est réservé à l’administration.');
}

export function assertVehicleDossierAdmin(role: Role): void {
  if (!hasAdminRights({ role })) throw new HttpError(403, 'L’ajout de photos à un dossier véhicule est réservé à l’administration.');
}
