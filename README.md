# RIMCO Studio

Bêta interne en français pour générer des vidéos automobiles RIMCO de cinq secondes, les consulter et télécharger le MP4. La V1 n’inclut pas l’approbation des vidéos ni leur édition après génération.

## Accès à la bêta

Le code V1 est fusionné dans `main` et le déploiement Production est prêt. Le mode Production reste en simulation. Un déploiement Preview séparé est configuré en mode réel pour permettre l’essai contrôlé de fal.ai.

L’invitation Supabase à `oury@odk-agency.com` a été envoyée. Son destinataire doit l’accepter et définir son mot de passe. Le premier utilisateur reçoit automatiquement le rôle administrateur. L’application est accessible sur [rimcostudio.vercel.app](https://rimcostudio.vercel.app); pour le test de génération, utiliser le Preview configuré en mode réel et se connecter avec le compte activé.

## Préparer la première génération

1. Connectez-vous avec le compte invité.
2. Dans la médiathèque, ajoutez le logo RIMCO et une vraie photo du véhicule à animer.
3. Faites valider ces médias par l’administration. La génération exige une photo véhicule validée; le logo validé est nécessaire à l’habillage de marque.
4. Dans le Studio, choisissez la photo, décrivez la scène et vérifiez le prix affiché avant de lancer.
5. Suivez la progression dans le Studio ou la bibliothèque. Une fois prête, la vidéo se visionne et se télécharge en MP4 depuis la bibliothèque.

Un seul essai réel fal.ai depuis l’application a été autorisé, dans le solde maximal de 1,047134 USD restant sous le plafond convenu de 2 USD. Aucun appel réel depuis l’application n’a encore été exécuté. Le projet de base de données ne contient pas de photo véhicule ou de logo à utiliser pour cet essai.

## Services et sécurité

- Supabase : projet `Rimco studio`, schéma et seed appliqués, buckets privés.
- Vercel : projet `rimcostudio`; Preview est en mode live; Production reste en simulation.
- fal.ai : clé stockée comme secret Vercel, jamais dans le navigateur ni dans Git.
- Signature des storyboards : dans Vercel, Settings → Environment Variables, ajouter `STORYBOARD_SIGNING_KEY` (64 caractères aléatoires tirés d’un générateur de mots de passe) pour Preview et Production, puis redéployer. Obligatoire en mode live : sans elle, la préparation du storyboard affiche un message clair et aucune vidéo n’est lancée.
- L’accès est privé, les inscriptions publiques sont désactivées et les médias nécessitent une authentification.
- Avant tout pilote commercial, vérifier que le plan Vercel utilisé autorise cet usage.

Les clés fal.ai et Supabase de service doivent être remplacées après le test contrôlé, car elles ont été exposées dans le contexte de travail. Mettre ensuite les nouvelles valeurs à jour dans Vercel.

## Développement

Le projet utilise Next.js App Router, TypeScript strict, Tailwind CSS, Supabase et pnpm. Les contrôles automatisés de la PR fusionnée couvrent lint, types, tests unitaires, build et E2E. Pour les commandes de développement local, consulter `package.json` et `AGENTS.md`.

Voir [docs/PROGRESS.md](docs/PROGRESS.md) pour l’état de livraison, [docs/DECISIONS.md](docs/DECISIONS.md) pour les choix d’architecture, et [DESIGN.md](DESIGN.md) pour la référence visuelle.
# Mise à jour du 27 octobre 2026

Dans GitHub, ouvrir `supabase/migrations/0038_human_review_and_pricing.sql`, copier tout le contenu, puis l’exécuter dans l’éditeur SQL de Supabase. Ce script est idempotent. Pour une installation complète, utiliser `supabase/setup.sql`. Aucune migration n’est appliquée automatiquement à un projet distant par Codex.

Après déploiement Vercel, vérifier dans **Administration → Facturation** les trois tarifs de RIMCO : Standard **460 FCFA/s**, Pro **700 FCFA/s**, Premium **950 FCFA/s** (**19 000 FCFA pour 20 secondes de clips**). Les prix déjà enregistrés restent inchangés. Le niveau Test suit Premium.

Le réglage **Validation humaine (images clés et clips)** commande deux pauses : images clés avant l’animation, clips avant le montage. La seconde planche permet de valider, modifier ou désactiver un clip ; il en faut au moins un actif. Le prix client reste identique si le film est raccourci. Après 48 heures, les clips restent disponibles ; seules les réservations de correction inutilisées sont libérées. Les mesures et les désaccords avec le vérificateur sont consultables dans **Coûts**, avec exports CSV.

Une seule modification humaine est possible par image clé et une par clip. Sans transition explicite dans la description ou dans le choix des lieux, le premier lieu extérieur fixe la lumière du film. Les aperçus d’enchaînement sont muets, sans logo, temporaires et en 540p.
