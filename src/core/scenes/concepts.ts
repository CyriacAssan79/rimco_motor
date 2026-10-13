import type { ScenePreset } from './catalog';

export const sceneConceptStyles = [
  {
    id: 'signature',
    title: 'Publicité · révéler le véhicule',
    purpose: 'Pour une campagne, une annonce ou un film de marque',
    direction: 'Publicité automobile : créer une découverte progressive et désirable du véhicule, avec une entrée claire, un mouvement de caméra fluide et une image finale forte qui peut porter le message de marque.',
  },
  {
    id: 'mouvement',
    title: 'Démonstration · montrer l’usage',
    purpose: 'Pour présenter la conduite, la robustesse ou un usage concret',
    direction: 'Démonstration automobile : rendre l’usage immédiatement compréhensible en accompagnant le déplacement réaliste du véhicule avec une caméra stable, un rythme lisible et une fin qui montre clairement sa posture et sa capacité.',
  },
  {
    id: 'ambiance',
    title: 'Présentation · valoriser le design',
    purpose: 'Pour une fiche produit, un showroom ou une présentation interne',
    direction: 'Présentation produit : laisser le lieu et la lumière installer le contexte, puis observer calmement la silhouette, les finitions et les proportions du véhicule avec un rythme posé et une composition très propre.',
  },
] as const;

export type SceneConceptId = typeof sceneConceptStyles[number]['id'];

export function getSceneConcepts(scene: ScenePreset) {
  return sceneConceptStyles.map((concept) => ({
    ...concept,
    summary: `${concept.purpose}. Scène : ${scene.label}.`,
    direction: `${concept.direction} Scène choisie : ${scene.label}. ${scene.setting}`,
  }));
}

export function getSceneConceptDirection(scene: ScenePreset | undefined, conceptId: SceneConceptId) {
  const style = sceneConceptStyles.find((concept) => concept.id === conceptId) ?? sceneConceptStyles[0];
  if (!scene) return style.direction;
  return `${style.direction} Scène choisie : ${scene.label}. ${scene.setting}`;
}
