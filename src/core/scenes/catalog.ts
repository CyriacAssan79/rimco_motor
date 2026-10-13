export const vehicleCategories = ['berline', 'suv', 'pickup', 'camion', 'bus', 'engin', 'autre'] as const;
export type VehicleCategory = typeof vehicleCategories[number];

export const vehicleCategoryLabels: Record<VehicleCategory, string> = {
  berline: 'Berline / voiture électrique',
  suv: 'SUV / 4x4',
  pickup: 'Pick-up',
  camion: 'Camion / poids lourd',
  bus: 'Bus / transport collectif',
  engin: 'Engin de chantier',
  autre: 'Autre véhicule',
};

export type ScenePreset = {
  id: string;
  category: VehicleCategory;
  label: string;
  bestFor: string;
  description: string;
  location: string;
  setting: string;
  character?: string;
  lighting: string;
  vehicleAction: string;
  cameraMovement: string;
  mood: string;
};

export const scenePresets: ScenePreset[] = [
  { id: 'sedan-business-day', category: 'berline', label: 'Quartier d’affaires · jour', bestFor: 'Présentation produit', description: 'Un cadre professionnel et lumineux pour montrer le design avec clarté.', location: 'Abidjan, quartier d’affaires du Plateau', setting: 'Architecture contemporaine, boulevard dégagé et circulation discrète', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule avance lentement et régulièrement sur une courte distance', cameraMovement: 'Travelling latéral fluide en trois-quarts avant, à hauteur du véhicule', mood: 'Élégant, moderne et rassurant' },
  { id: 'sedan-business-night', category: 'berline', label: 'Quartier d’affaires · nuit', bestFor: 'Publicité premium', description: 'Des reflets urbains et une ambiance nocturne pour une image plus statutaire.', location: 'Abidjan, quartier d’affaires du Plateau', setting: 'Façades de bureaux éclairées, boulevard calme et reflets naturels', lighting: 'Nuit urbaine avec éclairage doux et réaliste', vehicleAction: 'Le véhicule roule lentement sur une courte distance', cameraMovement: 'Travelling latéral stable en trois-quarts avant', mood: 'Premium, sobre et contemporain' },
  { id: 'sedan-coast-evening', category: 'berline', label: 'Route côtière · fin de journée', bestFor: 'Campagne émotionnelle', description: 'Une sensation d’évasion et de confort, avec une lumière chaude qui valorise la silhouette.', location: 'Abidjan, boulevard côtier', setting: 'Route ouverte, horizon dégagé et végétation côtière discrète', lighting: 'Lumière douce de fin de journée', vehicleAction: 'Le véhicule suit la route à vitesse régulière', cameraMovement: 'Travelling avant parallèle au véhicule, sans coupe', mood: 'Libre, élégant et apaisant' },
  { id: 'suv-city-day', category: 'suv', label: 'Avenue urbaine · jour', bestFor: 'Présentation polyvalente', description: 'Une scène claire et active pour montrer le véhicule dans son usage quotidien.', location: 'Abidjan, avenue moderne bordée d’arbres', setting: 'Voie dégagée et architecture urbaine contemporaine', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule avance lentement dans sa voie', cameraMovement: 'Travelling trois-quarts avant, stable et à hauteur du véhicule', mood: 'Confiant, polyvalent et premium' },
  { id: 'suv-coast-evening', category: 'suv', label: 'Route côtière · fin de journée', bestFor: 'Publicité lifestyle', description: 'Un décor ouvert pour associer le véhicule au confort, au voyage et à la liberté.', location: 'Route côtière près d’Abidjan', setting: 'Route ouverte avec végétation tropicale en arrière-plan', lighting: 'Lumière douce de fin de journée', vehicleAction: 'Le véhicule progresse sans accélération brusque', cameraMovement: 'Travelling latéral fluide qui garde le véhicule au centre', mood: 'Évasion, confort et maîtrise' },
  { id: 'pickup-worksite-day', category: 'pickup', label: 'Site professionnel · jour', bestFor: 'Démonstration métier', description: 'Un contexte concret pour faire comprendre la robustesse et l’utilité du véhicule.', location: 'Zone d’activité en périphérie d’Abidjan', setting: 'Site de travail ordonné, matériaux rangés et circulation dégagée', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule avance lentement sur une voie stabilisée', cameraMovement: 'Plan bas en travelling trois-quarts avant', mood: 'Robuste, fiable et professionnel' },
  { id: 'truck-logistics-day', category: 'camion', label: 'Plateforme logistique · jour', bestFor: 'Présentation professionnelle', description: 'Un environnement lisible pour illustrer la capacité, la fiabilité et le transport.', location: 'Plateforme logistique près d’Abidjan', setting: 'Entrepôts propres, espace de manœuvre large et activité en arrière-plan discrète', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule traverse lentement la plateforme en ligne droite', cameraMovement: 'Plan large puis travelling parallèle régulier', mood: 'Puissant, fiable et maîtrisé' },
  { id: 'bus-terminal-day', category: 'bus', label: 'Terminal moderne · jour', bestFor: 'Présentation de service', description: 'Une scène rassurante pour montrer l’accueil, la capacité et la fiabilité.', location: 'Abidjan, terminal de transport moderne', setting: 'Quai propre, architecture fonctionnelle et voyageurs discrets au loin', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule avance lentement le long du quai', cameraMovement: 'Travelling latéral large et régulier', mood: 'Sûr, accueillant et fiable' },
  { id: 'equipment-worksite-day', category: 'engin', label: 'Chantier organisé · jour', bestFor: 'Démonstration de performance', description: 'Un chantier propre et contrôlé pour rendre la puissance immédiatement compréhensible.', location: 'Chantier d’infrastructure près d’Abidjan', setting: 'Terrain de chantier sécurisé, sol stable et équipements en arrière-plan', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule effectue un mouvement lent et maîtrisé sur place', cameraMovement: 'Plan bas trois-quarts, caméra stable avec un léger travelling', mood: 'Précis, puissant et professionnel' },
  { id: 'other-urban-day', category: 'autre', label: 'Scène urbaine · jour', bestFor: 'Premier test', description: 'Une base neutre et facile à lire lorsque l’usage n’est pas encore défini.', location: 'Abidjan, rue calme et contemporaine', setting: 'Architecture sobre, voie dégagée et arrière-plan peu chargé', lighting: 'Lumière naturelle claire du matin', vehicleAction: 'Le véhicule avance lentement et régulièrement', cameraMovement: 'Travelling trois-quarts avant, stable et sans coupe', mood: 'Moderne, naturel et rassurant' },
  { id: 'waterfront-morning', category: 'autre', label: 'Front de mer · matin', bestFor: 'Publicité lifestyle', description: 'Une lumière fraîche et un horizon ouvert pour une vidéo positive et aspirante.', location: 'Abidjan, front de mer de Treichville', setting: 'Promenade dégagée, horizon lumineux et végétation tropicale discrète', lighting: 'Lumière douce du début de matinée', vehicleAction: 'Le véhicule avance calmement le long de la promenade', cameraMovement: 'Travelling latéral fluide en trois-quarts avant', mood: 'Ouvert, lumineux et désirable' },
  { id: 'showroom-interior', category: 'autre', label: 'Showroom · intérieur', bestFor: 'Présentation produit', description: 'Un cadre maîtrisé pour observer les détails, les finitions et la technologie.', location: 'Showroom automobile contemporain à Abidjan', setting: 'Sol propre, baies vitrées et éclairage architectural doux', lighting: 'Lumière intérieure diffuse et régulière', vehicleAction: 'Le véhicule avance très lentement dans le showroom', cameraMovement: 'Travelling rapproché stable sur la face avant et le profil', mood: 'Précis, premium et rassurant' },
  { id: 'residential-evening', category: 'autre', label: 'Quartier résidentiel · soir', bestFor: 'Usage quotidien', description: 'Une scène proche de la vie réelle pour projeter le véhicule dans un usage familial.', location: 'Abidjan, quartier résidentiel calme', setting: 'Rue propre, maisons modernes et éclairages domestiques discrets', lighting: 'Lumière douce de fin de journée', vehicleAction: 'Le véhicule avance doucement dans sa voie', cameraMovement: 'Travelling trois-quarts avant à hauteur du véhicule', mood: 'Chaleureux, fiable et accessible' },
  { id: 'periurban-sunrise', category: 'autre', label: 'Route périphérique · lever du jour', bestFor: 'Campagne de lancement', description: 'Un départ symbolique et une lumière progressive pour annoncer une nouveauté.', location: 'Périphérie d’Abidjan, route dégagée', setting: 'Route large, végétation basse et horizon qui s’éclaire', lighting: 'Lumière de lever du jour, douce et réaliste', vehicleAction: 'Le véhicule démarre puis avance régulièrement', cameraMovement: 'Travelling avant lent qui accompagne la progression', mood: 'Nouveau, confiant et ambitieux' },
  { id: 'event-esplanade-evening', category: 'autre', label: 'Esplanade événementielle · soirée', bestFor: 'Lancement ou événement', description: 'Une présence plus spectaculaire pour révéler le véhicule devant un public.', location: 'Esplanade contemporaine à Abidjan', setting: 'Architecture événementielle, éclairages maîtrisés et espace dégagé', lighting: 'Éclairage de soirée doux, sans couleurs artificielles excessives', vehicleAction: 'Le véhicule avance lentement vers son point de présentation', cameraMovement: 'Travelling frontal puis léger trois-quarts, sans coupe', mood: 'Présent, élégant et mémorable' },
];

export function inferVehicleCategory(make?: string | null, model?: string | null): VehicleCategory {
  const normalizedMake = (make ?? '').toLocaleLowerCase('fr');
  const normalizedModel = (model ?? '').toLocaleLowerCase('fr');
  const identity = `${normalizedMake} ${normalizedModel}`;
  if (/liugong|chargeuse|excavatrice|bulldozer|niveleuse|compacteur/.test(identity)) return 'engin';
  if (/zhongtong|autocar|bus/.test(identity)) return 'bus';
  if (/sinotruk|howo|poids lourd|tracteur routier|camion/.test(identity)) return 'camion';
  if (/pick.?up|poer|wingle|cannon/.test(identity)) return 'pickup';
  if (/haval|gwm|tank\s?\d|jolion|h6|h9|suv|sportage|sorento|seltos|stonic|tucson|ev[3569]/.test(identity)) return 'suv';
  if (/starlight|sedan|berline|k[3458]|cerato|forte|stinger/.test(identity)) return 'berline';
  return 'autre';
}

export function getScenePresets(category?: VehicleCategory): ScenePreset[] {
  return category ? scenePresets.filter((preset) => preset.category === category) : scenePresets;
}

export function getScenePreset(id: string, category?: VehicleCategory): ScenePreset | undefined {
  return scenePresets.find((preset) => preset.id === id && (!category || preset.category === category));
}
