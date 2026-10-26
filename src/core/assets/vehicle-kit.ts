/** RIMCO vehicle images supplied in the internal test-assets archive; each view states where the nose points (checked on the photos, 25/10). */
export const vehicleTestKit = [
  {
    make: 'GWM', model: 'Jolion', color: 'Bleu', variant: 'Kit d’essai visuel', slug: 'gwm-jolion',
    photos: [
      { file: 'arriere-trois-quarts.webp', title: 'Jolion bleu · arrière trois-quarts', angle: '3/4 arrière · nez à gauche' },
      { file: 'avant-trois-quarts.webp', title: 'Jolion bleu · avant trois-quarts', angle: '3/4 avant · nez à gauche' },
      { file: 'profil.webp', title: 'Jolion bleu · profil', angle: 'Profil · nez à gauche' },
    ],
  },
  {
    make: 'Kia', model: 'Tasman', color: 'Beige', variant: 'Kit d’essai visuel', slug: 'kia-tasman',
    photos: [
      { file: 'avant-trois-quarts.webp', title: 'Tasman beige · avant trois-quarts', angle: '3/4 avant · nez à droite' },
      { file: 'arriere-trois-quarts.webp', title: 'Tasman beige · arrière trois-quarts', angle: '3/4 arrière · nez à gauche' },
      { file: 'profil.webp', title: 'Tasman beige · profil', angle: 'Profil · nez à gauche' },
    ],
  },
  {
    make: 'Kia', model: 'Pegas', color: 'Rouge', variant: 'Kit d’essai visuel', slug: 'kia-pegas',
    photos: [
      { file: 'arriere-trois-quarts.webp', title: 'Pegas rouge · arrière trois-quarts', angle: '3/4 arrière · nez à droite' },
      { file: 'profil.webp', title: 'Pegas rouge · profil', angle: 'Profil · nez à gauche' },
      { file: 'avant-trois-quarts.webp', title: 'Pegas rouge · avant trois-quarts', angle: '3/4 avant · nez à gauche' },
    ],
  },
  {
    make: 'Haval', model: 'H6', color: 'Beige', variant: 'Kit d’essai visuel', slug: 'haval-h6',
    photos: [
      { file: 'avant-trois-quarts.webp', title: 'Haval H6 beige · avant trois-quarts', angle: '3/4 avant · nez à gauche' },
      // 25/10: this file shows the rear three-quarter view, not a front profile (file name kept: it is the storage path).
      { file: 'profil-avant.webp', title: 'Haval H6 beige · arrière trois-quarts', angle: '3/4 arrière · nez à gauche' },
      { file: 'avant-trois-quarts-ville.webp', title: 'Haval H6 beige · avant trois-quarts en ville', angle: '3/4 avant · nez à droite' },
    ],
  },
  {
    make: 'GWM', model: 'Tank 300', color: 'Gris', variant: 'Kit d’essai visuel', slug: 'gwm-tank-300',
    photos: [
      { file: 'avant-trois-quarts.webp', title: 'Tank 300 gris · avant trois-quarts', angle: '3/4 avant · nez à droite' },
      { file: 'arriere-trois-quarts.webp', title: 'Tank 300 gris · arrière trois-quarts', angle: '3/4 arrière · nez à gauche' },
      { file: 'profil.webp', title: 'Tank 300 gris · profil', angle: 'Profil · nez à gauche' },
    ],
  },
] as const;

export type VehicleTestKitEntry = (typeof vehicleTestKit)[number];
