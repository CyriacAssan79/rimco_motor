import { describe, expect, it } from 'vitest';
import { buildEndKeyframePrompt, buildKeyframeAnimationPrompt, buildKeyframePrompt } from '@/core/providers/fal-keyframes';
import { fitPrompt, GROUND_CONTACT, IMAGE_PROMPT_MAX_CHARS, NO_TEXT_IMAGE, NO_TEXT_VIDEO, PromptTooLongError, shortenText, VIDEO_PROMPT_MAX_CHARS, WHEEL_PHYSICS } from '@/core/prompts/rules';
import { buildDirectorInstruction, buildStoryboardInstruction, shotDraftSchema, type StoryboardShot } from '@/core/storyboard';
import { peopleForShot } from '@/core/versions/casting';
import { animationSubmitStateAfterFailure } from '@/core/versions/animation-submit-state';

/** Longest values the schema can keep after compaction (announced limits + ~25 % headroom). */
const longest: StoryboardShot = shotDraftSchema.parse({
  title: 'T'.repeat(80), shotType: 'rolling', travelDirection: 'right_to_left', travelSpeed: 'dynamic',
  scene: `${'scene '.repeat(40)}`, framing: `${'framing '.repeat(20)}`, location: `${'place '.repeat(30)}`,
  action: `${'action '.repeat(40)}`, camera: `${'camera '.repeat(30)}`,
  durationSeconds: 15, vehiclePhotoId: 'front', locationPhotoId: 'place',
});
const castTitles = ['A'.repeat(160), 'B'.repeat(160)];
const judgeFeedback = 'x'.repeat(2_000);
const lighting = 'Night, lit by the real street and city lights visible in the selected location photo';

describe('v3.2 · garde-fou de longueur', () => {
  it('ne dépasse jamais 2 000 caractères pour un moteur vidéo, même dans le pire cas (Kling refuse au-delà de 2 500)', () => {
    const cases = [
      buildKeyframeAnimationPrompt({ shot: longest, vehicle: 'GWM Tank 300 Gris Titane Édition', durationS: 15, mood: 'M'.repeat(160), lighting, castTitles, hasEndFrame: true, retryReason: judgeFeedback }),
      buildKeyframeAnimationPrompt({ shot: longest, vehicle: 'GWM Tank 300', durationS: 15, mood: 'M'.repeat(160), lighting, castDescription: 'D'.repeat(400), hasEndFrame: true, retryReason: judgeFeedback }),
    ];
    for (const prompt of cases) {
      expect(prompt.length).toBeLessThanOrEqual(VIDEO_PROMPT_MAX_CHARS);
      expect(prompt).toContain(NO_TEXT_VIDEO);
      expect(prompt).toContain(WHEEL_PHYSICS);
    }
  });

  it('garde les images clés et les images de fin sous 2 200 caractères', () => {
    const still = buildKeyframePrompt({ shot: longest, vehicle: 'GWM Tank 300', lighting, format: '16:9', retryReason: judgeFeedback, vehicleReferenceCount: 3, hasLocationReference: true, castTitles });
    const end = buildEndKeyframePrompt({ shot: longest, durationS: 15, format: '16:9', castTitles });
    for (const prompt of [still, end]) {
      expect(prompt.length).toBeLessThanOrEqual(IMAGE_PROMPT_MAX_CHARS);
      expect(prompt).toContain(NO_TEXT_IMAGE);
    }
    expect(still).toContain(GROUND_CONTACT);
  });

  it('raccourcit d’abord, retire ensuite, et ne coupe jamais un bloc verrouillé', () => {
    const locked = 'L'.repeat(50);
    expect(fitPrompt([{ text: locked }, { text: 'a'.repeat(100), shrinkTo: 20 }], 80)).toMatch(/^L{50} a+\.$/);
    expect(fitPrompt([{ text: locked }, { text: 'optional', drop: 1 }], 55)).toBe(locked);
    expect(() => fitPrompt([{ text: locked }, { text: 'L'.repeat(50) }], 60)).toThrow(PromptTooLongError);
    expect(shortenText('one two three four five', 12)).toBe('one two.');
  });

  it('prompt usuel nettement plus court qu’avant (environ 1 000 caractères)', () => {
    const shot = shotDraftSchema.parse({ title: 'Suivi', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'cruise', scene: 'SUV on the lagoon boulevard', framing: 'Medium wide', location: 'Abidjan lagoon boulevard', action: 'The SUV passes lamp posts and lane markings', camera: 'Static camera, slow pan', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'place' });
    expect(buildKeyframeAnimationPrompt({ shot, vehicle: 'Haval H6 Gris', durationS: 5, mood: 'premium', lighting: 'Natural daylight', excludePeople: true }).length).toBeLessThan(1_350); // 24/10 : +marche avant et défilement (essais A et B)
  });
});

describe('v3.2 · réalisateur', () => {
  const base = { vehicle: 'GWM Tank 300', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: '3/4 avant' }], places: [{ id: 'p', title: 'Boulevard', geometry: null }] };
  it('écrit chaque règle une seule fois et reste sous 4 000 caractères (budget relevé le 24/10 : lieux décrits, circulation, showroom ; ce n’est pas une limite du modèle de langage)', () => {
    const instruction = buildStoryboardInstruction({ ...base, durationSeconds: 20, mode: 'premium', format: '16:9' });
    expect(instruction.length).toBeLessThan(4_000);
    for (const once of ['Return only this JSON', 'FIDELITY:', 'TEXT:', 'MOTION:', 'Exactly 4 shots of 5 seconds']) {
      expect(instruction.split(once).length - 1).toBe(1);
    }
    expect(instruction).not.toMatch(/morphing|flicker|HDR|90 %/);
  });
  it('n’annonce qu’un plan pour une vidéo de 5 s', () => {
    expect(buildDirectorInstruction({ ...base, durationSeconds: 5, mode: 'pro', single: true })).toContain('Exactly 1 shot of 5 seconds.');
  });
});

describe('v3.2 · présence des personnes', () => {
  const shot = { title: 't', scene: 's', framing: 'f', location: 'l', action: 'a', camera: 'c', durationSeconds: 5, vehiclePhotoId: 'v' };
  it('vient de la fiche du réalisateur, plus des mots-clés du brief', () => {
    expect(peopleForShot({ promptRules: 'v3.2', user_direction: 'Une famille part à Assinie', castDescription: '' }, shot).excludePeople).toBe(true);
    expect(peopleForShot({ promptRules: 'v3.2', user_direction: 'sans personne', castDescription: 'Woman, 30, white shirt' }, shot).excludePeople).toBe(false);
  });
  it('garde l’ancienne détection pour les vidéos lancées avant le v3.2', () => {
    expect(peopleForShot({ character: 'as explicitly requested in the user direction; otherwise none', user_direction: 'Une famille part à Assinie' }, shot).excludePeople).toBe(false);
  });
});

describe('v3.2 · refus 422 du moteur', () => {
  it('est un refus certain : plan en échec, sans réconciliation de coût', () => {
    expect(animationSubmitStateAfterFailure(422)).toBe('failed');
    expect(animationSubmitStateAfterFailure(null)).toBe('reconciliation');
  });
});

describe('v3.2 · conduite normale et personnes dans la voiture (essais du 22/10)', () => {
  const moving = shotDraftSchema.parse({ title: 'Ville', shotType: 'rolling', travelDirection: 'left_to_right', travelSpeed: 'dynamic', scene: 'City street', framing: 'Medium wide', location: 'Plateau', action: 'The SUV drives along the avenue', camera: 'Static camera, slow pan', durationSeconds: 5, vehiclePhotoId: 'front', locationPhotoId: 'p' });
  const stopped = { ...moving, shotType: 'hero' as const, travelDirection: 'static' as const };
  const arriving = { ...moving, shotType: 'hero' as const, travelDirection: 'towards_camera' as const };

  it('impose une conduite calme dans sa voie, sans drift, et une voiture alignée sur la route', () => {
    const animation = buildKeyframeAnimationPrompt({ shot: moving, vehicle: 'Haval H6', durationS: 5, mood: '', lighting: 'day', excludePeople: true });
    expect(animation).toContain('no drift, skid, spin');
    expect(animation).toContain('brisk but legal road speed');
    expect(buildKeyframePrompt({ shot: moving, vehicle: 'Haval H6', lighting: 'day', format: '16:9', retryReason: null })).toContain('points along its lane');
  });

  it('met les personnes dans la voiture quand elle roule, dehors seulement quand elle est arrêtée', () => {
    const inside = buildKeyframeAnimationPrompt({ shot: moving, vehicle: 'Haval H6', durationS: 5, mood: '', lighting: 'day', castDescription: 'Woman, 30, white shirt' });
    expect(inside).toContain('seated inside the car (the driver at the wheel, facing forward, eyes on the road ahead)');
    expect(inside).toContain('nobody walks or stands outside the moving car');
    const outside = buildKeyframeAnimationPrompt({ shot: stopped, vehicle: 'Haval H6', durationS: 5, mood: '', lighting: 'day', castDescription: 'Woman, 30, white shirt' });
    expect(outside).toContain('nobody leans on the car');
    expect(outside).not.toContain('seated inside');
  });

  it('ne contredit plus un plan héros qui arrive : il ralentit et s’arrête', () => {
    const prompt = buildKeyframeAnimationPrompt({ shot: arriving, vehicle: 'Haval H6', durationS: 5, mood: '', lighting: 'day', excludePeople: true });
    expect(prompt).toContain('rolls in slowly and comes to a smooth, gentle stop');
    expect(prompt).not.toContain('wheels do not turn');
    expect(buildKeyframeAnimationPrompt({ shot: stopped, vehicle: 'Haval H6', durationS: 5, mood: '', lighting: 'day', excludePeople: true })).toContain('holds still');
  });

  it('fait juger le drift, la personne hors d’une voiture qui roule et le badge recoloré comme bloquants', async () => {
    const { buildVideoQualityPrompt } = await import('@/core/providers/fal-keyframes');
    const judge = buildVideoQualityPrompt({ vehicleReferenceCount: 1, hasLocationReference: true, excludePeople: false, shotType: 'rolling', durationS: 5 });
    expect(judge).toContain('drifting or skidding vehicle');
    expect(judge).toContain('a person outside a moving car');
    expect(judge).toContain('a badge, grille, light or wheel whose design or colour differs');
  });

  it('demande au réalisateur une vitesse de ville, un sens cohérent avec la photo et la place des personnes', () => {
    const instruction = buildStoryboardInstruction({ durationSeconds: 10, mode: 'standard', vehicle: 'H6', vehiclePhotos: [{ id: 'front', role: 'exterior', title: 'Avant', angle: '3/4 avant' }], places: [], format: '16:9' });
    expect(instruction).toContain("dynamic only where the place's roadType is open");
    expect(instruction).toContain('never mirrored');
    expect(instruction).toContain('While the car moves, the people are inside it');
    expect(instruction.length).toBeLessThan(4_000);
  });
});
