# RIMCO Studio · Ce que fait la V1, et ses limites (28/10/2026)

Document à partager avec RIMCO Motors à la remise des accès.

## Ce que fait la V1
- Créer une vidéo d'un véhicule de la médiathèque, dans un ou plusieurs lieux, à partir d'une description libre.
- Trois niveaux de prix (Standard, Pro, Premium), affichés avant le lancement et débités des crédits seulement quand la vidéo est prête. Un échec n'est jamais facturé.
- Validation des images clés avant la génération vidéo (selon le réglage de la marque), modification d'un plan, validation des vidéos par les personnes qui en ont le droit, téléchargement après validation.
- Logo RIMCO ajouté au montage, musique de la médiathèque en option.
- Suivi des crédits : solde, montants réservés, historique ; export CSV pour l'administrateur.

## Limites connues de la V1
| Sujet | En V1 | Prévu ensuite |
|---|---|---|
| Durée par défaut | 5 s, un seul plan : c'est un aperçu, pour tester à moindre coût | Choisir 10, 15 ou 20 s donne 2 à 6 plans |
| Transitions | Les plans s'enchaînent en coupe franche, sans fondu | Transitions au montage (fondu, fondu au noir) |
| Respect de la demande | Ce qui ne peut pas être filmé (règles de la marque, scènes en trop pour un aperçu, fondus…) est signalé avant le lancement, puis rappelé dans le détail de la vidéo | Écran de validation des plans avant les images clés |
| Préparation | Pendant « Préparation » (moins d'une minute), il faut rester sur la page : la vidéo n'est créée qu'à la fin de cette étape | Préparation entièrement côté serveur |
| Validations | L'utilisateur valide les images clés, et les clips si KÔMIAN l'a activé pour la marque | — |
| Suivi de la génération | La génération continue même onglet fermé ; les validations à faire et la vidéo prête s'affichent dans la cloche de l'application (pas d'e-mail) | Notification par e-mail |
| Délai | Environ 5 minutes de calcul pour 10 s, plus le temps des validations. Chaque plan part en vidéo dès que son image clé est validée | Suivi en temps réel à l'écran |
| Textes à l'image | Aucun texte ni logo n'est généré dans les scènes ; le logo est ajouté au montage | Textes et mentions composés au montage |
| E-mails | Aucun : l'administrateur crée les accès et transmet le mot de passe provisoire ; les alertes sont dans l'application | Service d'e-mails |
