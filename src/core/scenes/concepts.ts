import type { ScenePreset } from './catalog';

export const sceneConceptStyles = [
  {
    id: 'signature',
    title: 'Signature RIMCO',
    direction: 'Film automobile de signature : révéler progressivement le véhicule dans son environnement, avec un mouvement de caméra fluide et une image finale forte.',
  },
  {
    id: 'mouvement',
    title: 'En mouvement',
    direction: 'Film automobile vivant : accompagner le déplacement réaliste du véhicule avec une caméra stable, puis terminer sur une composition lisible qui le met en valeur.',
  },
  {
    id: 'ambiance',
    title: 'L’instant',
    direction: 'Film d’ambiance automobile : installer d’abord le lieu choisi, puis révéler naturellement le véhicule avec une lumière et un rythme cohérents avec la scène.',
  },
] as const;

export type SceneConceptId = typeof sceneConceptStyles[number]['id'];

export function getSceneConcepts(scene: ScenePreset) {
  return sceneConceptStyles.map((concept) => ({
    ...concept,
    summary: concept.id === 'signature'
      ? `Découverte maîtrisée · ${scene.label}`
      : concept.id === 'mouvement'
        ? `Le véhicule traverse la scène · ${scene.label}`
        : `Lumière et atmosphère · ${scene.label}`,
    direction: `${concept.direction} Scène choisie : ${scene.label}. ${scene.setting}`,
  }));
}

export function getSceneConceptDirection(scene: ScenePreset | undefined, conceptId: SceneConceptId) {
  const style = sceneConceptStyles.find((concept) => concept.id === conceptId) ?? sceneConceptStyles[0];
  if (!scene) return style.direction;
  return `${style.direction} Scène choisie : ${scene.label}. ${scene.setting}`;
}
