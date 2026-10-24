import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { locationCatalog, selectableLocations } from '@/core/assets/location-catalog';
import { placeGeometryFromRow, placeGeometrySchema, placeGeometryToRow } from '@/core/assets/place-geometry';
import { undescribedPlacesIssue } from '@/core/assets/places';
import { parseVehicleView, vehicleViewIncomplete } from '@/core/assets/vehicle-views';
import { vehicleTestKit } from '@/core/assets/vehicle-kit';
import { allowedMoves, motionCatalog } from '@/core/motions/catalog';

describe('géométrie des lieux · règles', () => {
  const road = { viewpoint: 'ground', roadAxis: 'depth', roadType: 'urban', timeOfDay: 'day', landmarks: 'boulevard, palm trees' } as const;

  it('accepte un lieu cohérent et refuse les combinaisons impossibles', () => {
    expect(placeGeometrySchema.safeParse(road).success).toBe(true);
    expect(placeGeometrySchema.safeParse({ ...road, viewpoint: 'interior' }).success).toBe(false);
    expect(placeGeometrySchema.safeParse({ ...road, viewpoint: 'distant', roadAxis: 'none' }).success).toBe(false);
    expect(placeGeometrySchema.safeParse({ ...road, roadType: null }).success).toBe(false);
    expect(placeGeometrySchema.safeParse({ ...road, landmarks: 'x' }).success).toBe(false);
    expect(placeGeometrySchema.safeParse({ viewpoint: 'interior', roadAxis: 'none', roadType: null, timeOfDay: 'interior', landmarks: 'showroom floor' }).success).toBe(true);
  });

  it('relit une ligne de la médiathèque, et la considère non décrite tant qu’elle est incomplète', () => {
    expect(placeGeometryFromRow(placeGeometryToRow(road))).toEqual(road);
    expect(placeGeometryFromRow({ place_viewpoint: 'ground' })).toBeNull();
    expect(placeGeometryFromRow({})).toBeNull();
  });

  it('explique à l’utilisateur quel lieu reste à décrire', () => {
    const places = [{ id: 'a', title: 'Marché', category: null, path: 'x', geometry: null, curated: false }, { id: 'b', title: 'Pont', category: null, path: 'y', geometry: road, curated: true }];
    expect(undescribedPlacesIssue(places)).toContain('Ce lieu n’est pas encore décrit : « Marché »');
    expect(undescribedPlacesIssue(places.slice(1))).toBeNull();
  });
});

describe('géométrie des lieux · catalogue intégré', () => {
  it('décrit chaque lieu de façon valide, avec sa photo présente', () => {
    for (const place of locationCatalog) {
      expect(placeGeometrySchema.safeParse(place.geometry).success, place.title).toBe(true);
      expect(existsSync(join(process.cwd(), 'public', place.path)), place.path).toBe(true);
    }
    expect(new Set(locationCatalog.map((place) => place.id)).size).toBe(locationCatalog.length);
  });

  it('ne propose plus le faux « Pont HKB · approche », mais le garde pour l’historique', () => {
    expect(locationCatalog.some((place) => place.title === 'Pont HKB · approche, journée')).toBe(true);
    expect(selectableLocations.some((place) => place.title === 'Pont HKB · approche, journée')).toBe(false);
  });

  it('offre des lieux au niveau de la route pour le jour, le coucher de soleil et la nuit', () => {
    for (const time of ['day', 'golden', 'night'] as const) {
      expect(selectableLocations.some((place) => place.geometry.viewpoint === 'ground' && place.geometry.timeOfDay === time), time).toBe(true);
    }
  });
});

describe('kit véhicule · vues', () => {
  it('donne à chaque photo une vue complète, sens du nez compris', () => {
    for (const vehicle of vehicleTestKit) for (const photo of vehicle.photos) expect(vehicleViewIncomplete(photo.angle), `${vehicle.slug}/${photo.file}`).toBe(false);
  });

  it('permet au moins un plan roulant pour chaque véhicule du kit sur une route au sol', () => {
    const ground = selectableLocations.find((place) => place.geometry.viewpoint === 'ground' && place.geometry.roadAxis === 'crossroads')!.geometry;
    for (const vehicle of vehicleTestKit) {
      const moving = vehicle.photos.flatMap((photo) => Object.keys(allowedMoves(parseVehicleView(photo.angle), ground)))
        .filter((id) => motionCatalog[id as keyof typeof motionCatalog].driving !== 'none');
      expect(moving.length, vehicle.slug).toBeGreaterThan(0);
    }
  });
});
