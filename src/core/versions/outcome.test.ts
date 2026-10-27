import { describe, expect, it } from 'vitest';
import { libraryVideoHref } from '@/components/video-outcome';
import { formatFcfa } from '@/core/pricing';
import { billingSummary, failureBillingText, failureExplanation, playbackDurationSeconds, studioSettings } from './outcome';

describe('end of a video in the Studio', () => {
  it('affiche la durée du montage raccourci au lieu de la durée de génération historique', () => {
    expect(playbackDurationSeconds({ finalDurationSeconds: 13 }, 17)).toBe(13);
    expect(playbackDurationSeconds({ finalDurationSeconds: 4.5 }, 12)).toBe(4.5);
    expect(playbackDurationSeconds({}, 17)).toBe(17);
  });
  it('reads back the settings of a video to create a variant or relaunch it', () => {
    expect(studioSettings({
      user_direction: 'Une Haval H6 sur le pont HKB', vehicleDossierId: 'd1', vehiclePhotoIds: ['p1', 'p2'], placeIds: ['l1'],
      castAssets: [{ id: 'c1', title: 'Awa' }], storyMode: 'pro', clipDurationSeconds: 10, format: '9:16', scene_preset_id: 'golden', audioAssetId: 'a1',
    }, 'Haval H6 · Plateau')).toEqual({
      title: 'Haval H6 · Plateau', description: 'Une Haval H6 sur le pont HKB', vehicleDossierId: 'd1', vehiclePhotoIds: ['p1', 'p2'], placeIds: ['l1'],
      castAssetIds: ['c1'], tier: 'pro', durationS: 10, format: '9:16', scenePresetId: 'golden', audioAssetId: 'a1',
    });
    expect(studioSettings({ user_direction: 'sans véhicule' })).toBeNull();
  });

  it('gives the direct link that opens the video in the library', () => {
    expect(libraryVideoHref({ id: 'version-1', videoId: 'video-1' })).toBe('/bibliotheque?video=video-1');
    expect(libraryVideoHref({ id: 'version-1' })).toBe('/bibliotheque?video=version-1');
  });
});

describe('failure message', () => {
  it('propose le montage seul après un échec FFmpeg, même si le détail mentionne un délai', () => {
    expect(failureExplanation('Montage impossible : le montage dépasse le délai autorisé.')).toMatchObject({ cause: 'Le montage a échoué. Les clips générés sont conservés.', advice: expect.stringContaining('sans nouvelle génération') });
  });
  it('explains a provider refusal in French and keeps the original as technical detail', () => {
    expect(failureExplanation('Content policy violation: the request was flagged by the safety filter (fal error 422).')).toEqual({
      cause: 'Le fournisseur a refusé le contenu demandé (filtre de sécurité).',
      advice: 'Reformulez la description ou choisissez une autre photo, puis relancez.',
      detail: 'Content policy violation: the request was flagged by the safety filter (fal error 422).',
    });
    expect(failureExplanation('Insufficient balance on the account').cause).toBe('Le compte du fournisseur a atteint sa limite (crédit ou quota).');
    expect(failureExplanation('Une image-clé n’a pas passé le contrôle. Aucun plan vidéo n’a été envoyé.').cause).toContain('Une image clé n’a pas passé le contrôle');
  });

  it('keeps a French message of the application, and never shows English alone', () => {
    expect(failureExplanation('Le véhicule de référence est introuvable.')).toMatchObject({ cause: 'Le véhicule de référence est introuvable.', detail: null });
    expect(failureExplanation('Unexpected internal server error')).toMatchObject({ cause: 'La génération a échoué chez le fournisseur.', detail: 'Unexpected internal server error' });
    expect(failureExplanation(null).cause).toBe('La génération a échoué chez le fournisseur.');
  });

  it('says what was billed', () => {
    expect(failureBillingText(billingSummary([{ kind: 'generation', status: 'released', price_fcfa: 2300 }]))).toBe('Rien ne vous est facturé pour cette vidéo.');
    expect(failureBillingText(billingSummary([{ kind: 'generation', status: 'charged', price_fcfa: 2300 }]))).toBe(`${formatFcfa(2300)} facturés : le fournisseur a déjà produit une partie de la vidéo.`);
    expect(failureBillingText(billingSummary([{ kind: 'generation', status: 'released', price_fcfa: 0 }, { kind: 'keyframe', status: 'reserved', price_fcfa: 0 }]))).toContain('en cours de vérification');
  });
});
