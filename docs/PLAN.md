# Plan RIMCO Studio

Critères d'acceptation repris du brief utilisateur.

0. Socle — Next.js strict, Supabase SSR, thème, connexion, migrations/seed, setup SQL, Vitest et CI.
1. Administration — premier admin par trigger, gestion des comptes, rôles, prix et modèles.
2. Médiathèque — assets, téléversement signé direct, validation et filtres.
3. Studio — brief, estimation, réservation plafonnée, fournisseur mock/live et suivi.
4. Validation — envoi volontaire, décision du valideur et téléchargement uniquement après approbation. Le motif est obligatoire en cas de refus.
5. Post-production — logo/audio, suivi et coût.
6. Bibliothèque — validation, téléchargement signé après approbation, notifications internes, coût total en FCFA avec majoration de 30 %, alerte et CSV.
7. Comparaison — lancer 2 ou 3 modèles, noter, exporter.
8. Validation fal réelle — docs officielles puis appels autorisés, cumul ≤ 2 USD.
9. Vérification finale — E2E, build, tests, secrets absents, README navigateur.

## Arbitrages actuels

- L'administration affiche uniquement le total client en FCFA. Il correspond aux réservations LLM et Fal combinées, converties en FCFA puis majorées de 30 %. Les coûts fournisseurs détaillés restent internes au journal technique.
- Une vidéo peut être prévisualisée avant validation, mais aucun téléchargement n'est délivré avant l'approbation du valideur.
- Les notifications internes sont visibles depuis l'en-tête, marquées comme lues à l'ouverture et dédupliquées par utilisateur, version et type.
- La médiathèque filtre les assets par catégorie et périmètre de marque; seuls les administrateurs voient les contrôles de validation.
- Le webhook Fal reste volontairement désactivé pour cette phase; le rafraîchissement et la réconciliation continuent d'assurer le suivi.
- `supabase/setup.sql` se termine par un bloc d'état canonique idempotent afin de normaliser les contraintes, les catégories d'assets, les statuts annulés et la déduplication des notifications.
