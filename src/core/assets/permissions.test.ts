import { describe, expect, it } from 'vitest';
import { HttpError } from '@/core/auth/guards';
import { assertPlaceUploadAdmin, assertVehicleDossierAdmin } from './permissions';

describe('asset upload permissions', () => {
  it('allows only admins and KÔMIAN operators to upload places', () => {
    expect(() => assertPlaceUploadAdmin('admin')).not.toThrow();
    expect(() => assertPlaceUploadAdmin('operateur')).not.toThrow();
    expect(() => assertPlaceUploadAdmin('collaborateur')).toThrowError(HttpError);
    expect(() => assertPlaceUploadAdmin('collaborateur')).toThrow('L’ajout de lieux est réservé à l’administration.');
  });

  it('allows only admins and operators to attach photos to vehicle dossiers', () => {
    expect(() => assertVehicleDossierAdmin('admin')).not.toThrow();
    expect(() => assertVehicleDossierAdmin('operateur')).not.toThrow();
    expect(() => assertVehicleDossierAdmin('collaborateur')).toThrowError(HttpError);
  });
});
