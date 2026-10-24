import { describe, expect, it } from 'vitest';
import { headingAtEnd, headingAtStart, turnScreenSide } from '@/core/motions/catalog';
import { buildEndKeyframePrompt, buildEndKeyframeQualityPrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt, buildKeyframeQualityPrompt, buildVideoQualityPrompt } from '@/core/providers/fal-keyframes';
import { FORWARD_ONLY, IMAGE_PROMPT_MAX_CHARS, PARALLAX, VIDEO_PROMPT_MAX_CHARS } from '@/core/prompts/rules';
import { shotDraftSchema } from '@/core/storyboard';

const base = { title: 'Plan', scene: 'SUV by the lagoon', framing: 'Medium', location: 'Lagoon boulevard', action: 'The SUV passes the lamp posts', camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'side', locationPhotoId: 'lagune' };
const shot = (fields: Record<string, unknown>) => shotDraftSchema.parse({ ...base, ...fields });

describe('sens de la voiture à l’écran (essai B du 24/10 : demi-tour puis marche arrière)', () => {
  it('donne le sens du nez en termes d’écran', () => {
    expect(headingAtStart({ motion: 'arrive_and_stop', travelDirection: 'left_to_right' })).toBe('The car’s nose points to the right side of the frame.');
    expect(headingAtStart({ motion: 'approach', travelDirection: 'towards_camera' })).toContain('its front is seen');
    expect(headingAtStart({ motion: 'hero_still', travelDirection: 'static' })).toBeNull();
  });

  it('calcule le côté de sortie d’un virage selon le point de vue', () => {
    expect(turnScreenSide('turn_right', 'towards_camera')).toBe('left');
    expect(turnScreenSide('turn_left', 'towards_camera')).toBe('right');
    expect(turnScreenSide('turn_right', 'away_from_camera')).toBe('right');
    expect(turnScreenSide('pass_by', 'left_to_right')).toBeNull();
    expect(headingAtEnd({ motion: 'turn_right', travelDirection: 'towards_camera' })).toBe('After turning to its own right, the car’s nose points towards the left side of the frame.');
    expect(headingAtEnd({ motion: 'arrive_and_stop', travelDirection: 'left_to_right' })).toBe('The car’s nose points to the right side of the frame, exactly as at the start.');
  });

  it('impose le sens à l’image-clé, à l’image de fin et aux juges', () => {
    const stop = shot({ motion: 'arrive_and_stop', travelDirection: 'left_to_right', travelSpeed: 'slow' });
    const keyframe = buildKeyframePrompt({ shot: stop, vehicle: 'GWM Tank 300 gris', lighting: 'day', format: '16:9', retryReason: null, hasLocationReference: true, excludePeople: true });
    expect(keyframe).toContain('The car’s nose points to the right side of the frame. Mirror the car of the reference photos if needed');
    expect(keyframe.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
    const end = buildEndKeyframePrompt({ shot: stop, durationS: 5, format: '16:9', excludePeople: true });
    expect(end).toContain('exactly as at the start. Use image 2 for the car’s identity only, not its orientation');
    expect(buildEndKeyframeQualityPrompt({ excludePeople: true, shot: stop })).toContain('A car facing the opposite way, or one that would have to drive backwards from image 2, is a defect.');
    expect(buildKeyframeQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, moving: true, heading: headingAtStart(stop) })).toContain('A car facing the other way is a defect.');
    expect(buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: true, motion: 'arrive_and_stop', durationS: 5 })).toContain('a car that drives backwards or flips its direction; a missing wheel;');
  });
});

describe('marche avant et défilement du décor (essai A du 24/10 : haubans figés)', () => {
  it('ajoute marche avant et défilement aux plans en mouvement seulement', () => {
    const follow = buildKeyframeAnimationPrompt({ shot: shot({ motion: 'follow_behind', travelDirection: 'away_from_camera', travelSpeed: 'cruise' }), vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true });
    expect(follow).toContain(FORWARD_ONLY);
    expect(follow).toContain(PARALLAX);
    expect(follow.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
    const still = buildKeyframeAnimationPrompt({ shot: shot({ motion: 'hero_still', travelDirection: 'static' }), vehicle: 'GWM Tank 300 gris', durationS: 5, mood: '', lighting: 'day', excludePeople: true });
    expect(still).not.toContain(PARALLAX);
  });
});
