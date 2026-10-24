import { describe, expect, it } from 'vitest';
import { buildKeyframePrompt } from '@/core/providers/fal-keyframes';
import { IMAGE_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { shotDraftSchema } from '@/core/storyboard';
import { anchoredKeyframeAction, keyframeAnchors, storedKeyframeAnchor, withAnchorReference } from '@/core/versions/keyframe-anchors';

describe('3b · continuité du lieu entre les plans', () => {
  it('prend comme ancre le premier plan tourné dans chaque lieu', () => {
    const shots = [{ locationPhotoId: 'pont' }, { locationPhotoId: 'pont' }, { locationPhotoId: 'showroom' }, { locationPhotoId: 'pont' }, { locationPhotoId: 'showroom' }, { locationPhotoId: null }];
    expect(keyframeAnchors(shots)).toEqual({ 2: 1, 4: 1, 5: 3 });
    expect(keyframeAnchors([{ locationPhotoId: 'pont' }, { locationPhotoId: 'lagune' }])).toEqual({});
  });

  it('relit l’ancre enregistrée et ignore une valeur incohérente', () => {
    const brief = { keyframeAnchors: { 2: 1, 3: 3, 4: 'x' } };
    expect(storedKeyframeAnchor(brief, 2)).toBe(1);
    expect(storedKeyframeAnchor(brief, 3)).toBeUndefined();
    expect(storedKeyframeAnchor(brief, 4)).toBeUndefined();
    expect(storedKeyframeAnchor({}, 2)).toBeUndefined();
  });

  it('place l’image de l’ancre juste avant la photo du lieu', () => {
    expect(withAnchorReference(['vehicule', 'vue', 'lieu'], 'ancre', true)).toEqual(['vehicule', 'vue', 'ancre', 'lieu']);
    expect(withAnchorReference(['vehicule'], 'ancre', false)).toEqual(['vehicule', 'ancre']);
  });

  it('attend l’ancre, l’utilise une fois acceptée, et n’engage aucun coût si la vidéo va échouer', () => {
    expect(anchoredKeyframeAction('generating', false)).toBe('wait');
    expect(anchoredKeyframeAction('checking', false)).toBe('wait');
    expect(anchoredKeyframeAction('ready', false)).toBe('with_anchor');
    expect(anchoredKeyframeAction(null, false)).toBe('without_anchor');
    expect(anchoredKeyframeAction('failed', true)).toBe('cancel');
    expect(anchoredKeyframeAction('ready', true)).toBe('cancel');
  });

  it('explique au générateur d’images le rôle de l’image d’ancre', () => {
    const shot = shotDraftSchema.parse({ title: 'Pont, profil', motion: 'pass_by', travelDirection: 'left_to_right', scene: 'SUV on the HKB bridge', framing: 'Medium', location: 'HKB bridge', action: 'The SUV passes the pylons', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'side', locationPhotoId: 'pont' });
    const prompt = buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, vehicleReferenceCount: 2, hasLocationReference: true, excludePeople: true, hasAnchorReference: true });
    expect(prompt).toContain('image before last = an earlier frame in this place: keep its road, lanes, landmarks and light, not its framing; last image = the location');
    expect(prompt.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    expect(buildKeyframePrompt({ shot, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true })).not.toContain('earlier frame');
  });
});
