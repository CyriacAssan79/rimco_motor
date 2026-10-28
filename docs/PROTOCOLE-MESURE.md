# Protocole de mesure : vitesse, coût et qualité (28/10/2026)

L'objectif est de mesurer avant et après chaque changement du pipeline (moteurs, juges, prompts, réglages), toujours sur les mêmes vidéos. Sans cette mesure, les gains annoncés restent des hypothèses.

## Les 5 vidéos de référence

Ce sont toujours les mêmes réglages, lancés depuis un compte opérateur (vidéos internes, non débitées) :

| # | Véhicule | Lieu | Durée | Niveau | Ce qu'elle teste |
|---|---|---|---|---|---|
| 1 | GWM Tank 300 gris | Pont HKB · journée | 5 s | Standard | Aperçu à un plan |
| 2 | GWM Tank 300 gris | Pont HKB · journée | 10 s | Standard | Deux plans, voiture qui roule |
| 3 | Haval H6 | Boulevard lagunaire · nuit | 10 s | Pro | Nuit, conductrice |
| 4 | Haval H6 | Showroom contemporain | 15 s | Pro | Intérieur, voiture immobile |
| 5 | Haval Jolion | Route rouge · virage | 20 s | Premium | Quatre plans, plan de détail |

Description, identique pour les cinq : « La voiture traverse le lieu à vitesse normale, puis s'arrête face à la caméra. »

## Ce qu'on relève pour chaque vidéo

- **Durées par étape**, lues dans la File de génération puis dans la Bibliothèque : images clés, vidéo des plans, contrôle qualité, montage, temps total.
- **Attente humaine**, hors calcul : affichée à part (« Votre validation »).
- **Coût réel fal**, dans Espace KÔMIAN, Coûts de production.
- **Reprises automatiques** : nombre de plans repris et motif, dans le détail technique.
- **Contrôles fixes** : dans les journaux Vercel, ligne `clip_fixed_check_failed` avec les codes `duration`, `black_frames` ou `frozen`.
- **Juge** : nombre de jetons et durée, dans la ligne `vision_usage` des journaux Vercel.
- **Qualité, vue par la DA** : véhicule fidèle (oui ou non), lieu reconnaissable (oui ou non), défaut visible (lequel).

## Calibrer le juge (une fois par série)

Dans Coûts de production, le relevé « Désaccords avec le vérificateur » liste les plans acceptés par le juge puis modifiés par un humain, avec le motif.

- **Un motif qui revient** (par exemple « véhicule ») : le juge laisse passer ce défaut. On renforce la consigne du juge pour ce code, ou on l'ajoute aux codes signalés en rouge (`CRITICAL_DEFECT_CODES`).
- **Un plan repris automatiquement que la DA aurait accepté** : le juge est trop sévère sur ce code. On assouplit sa consigne.

On ne change qu'une chose à la fois, puis on relance les 5 vidéos.

## Tester un juge plus rapide (variable `VISION_MODEL`)

1. Sur un déploiement Preview, renseignez `VISION_MODEL` avec le modèle à tester. Ce ne doit jamais être un modèle Google, puisque les images clés sont faites par Gemini.
2. Relancez les 5 vidéos de référence. Comparez la durée du contrôle qualité, le coût, et les reprises acceptées ou refusées à tort.
3. Gardez le nouveau modèle seulement si la qualité relevée par la DA est égale. Sinon, videz la variable : on revient à `LLM_MODEL`.
