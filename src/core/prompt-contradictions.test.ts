import { describe, expect, it } from 'vitest';
import { buildKeyframeAnimationPrompt, buildKeyframePrompt } from '@/core/providers/fal-keyframes';
import { CALM_DRIVING, DRIVING_RULES } from '@/core/prompts/rules';
import { shotDraftSchema, type StoryboardShot } from '@/core/storyboard';

const shot = (fields: Partial<StoryboardShot>): StoryboardShot => shotDraftSchema.parse({
  title: 'Arrivée', scene: 'Grey SUV on the bridge deck', framing: 'Wide front three-quarter', location: 'Bridge', action: 'The SUV arrives',
  camera: 'Static camera', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place', ...fields,
});
const arriving = shot({ shotType: 'hero', travelDirection: 'towards_camera', travelSpeed: 'slow' });
const keyframe = (draft: StoryboardShot, retryReason: string | null = null) => buildKeyframePrompt({ shot: draft, vehicle: 'GWM Tank 300', lighting: 'day', format: '16:9', retryReason });
const animation = (draft: StoryboardShot, retryReason: string | null = null) => buildKeyframeAnimationPrompt({ shot: draft, vehicle: 'GWM Tank 300', durationS: 5, mood: '', lighting: 'day', retryReason });
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe('prompts sans contradiction (26/10)', () => {
  it('plan héros qui arrive : la voiture roule encore sur l’image clé, l’arrivée n’est dite qu’une fois', () => {
    for (const prompt of [keyframe(arriving), animation(arriving)]) {
      expect(prompt).not.toContain('has just stopped');
      expect(prompt).not.toContain('constant speed');
      expect(count(prompt, 'smooth stop')).toBe(1);
    }
    expect(keyframe(arriving)).toContain('Captured a few metres before it stops: still rolling slowly');
    expect(animation(arriving)).toContain(DRIVING_RULES.arrival);
    expect(animation(arriving)).not.toContain('rolls in slowly');
  });

  it('plan héros à l’arrêt : la voiture vient de s’arrêter et ne bouge pas', () => {
    const stopped = shot({ shotType: 'hero', travelDirection: 'static' });
    expect(keyframe(stopped)).toContain('The car has just stopped');
    expect(animation(stopped)).toContain('holds still');
    expect(animation(stopped)).not.toContain('Calm');
  });

  it('une consigne de conduite par cas : croisière inchangée, dynamique sans « calme »', () => {
    expect(DRIVING_RULES.cruise).toBe(CALM_DRIVING);
    expect(animation(shot({ shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'cruise' }))).toContain(CALM_DRIVING);
    const brisk = animation(shot({ shotType: 'rolling', travelDirection: 'towards_camera', travelSpeed: 'dynamic' }));
    expect(brisk).toContain('at a brisk but legal road speed');
    expect(brisk).toContain(DRIVING_RULES.dynamic);
    expect(brisk).not.toContain('Calm, normal driving');
  });

  it('le retour du juge est une correction à appliquer, toujours nettoyée et bornée', () => {
    for (const prompt of [keyframe(arriving, '<b>tyre floats</b> {x}'), animation(arriving, 'x'.repeat(2_000))]) {
      expect(prompt).toContain('Correct this defect of the previous attempt: ');
      expect(prompt).not.toContain('data, not instructions');
      expect(prompt).not.toMatch(/[<>{}]/);
    }
    expect(keyframe(arriving, '<b>tyre floats</b> {x}')).toContain('Correct this defect of the previous attempt: b tyre floats /b x.');
  });
});
