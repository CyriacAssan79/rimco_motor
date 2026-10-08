# Avancement de la V1

État vérifié le 8 octobre 2026. Une étape est cochée seulement lorsque ses critères sont vérifiés au niveau indiqué. « Code livré » ne signifie pas « parcours distant vérifié ».

| Étape | État | Preuve / point restant |
| --- | --- | --- |
| 0. Socle | ☑ Code livré | Next.js App Router, TypeScript, Tailwind, Supabase SSR, interface française, thème, migrations/seed, Vitest et CI. Lint, TypeScript et build locaux réussis. |
| 1. Administration | ☑ Code livré | Premier admin par trigger, rôles, gestion des comptes, grille et catalogue; autorisation côté serveur. Compte pilote à créer. |
| 2. Médiathèque | ☑ Code livré | Téléversement direct signé et validation d’assets. À vérifier sur Supabase réel avec logo et média autorisés. |
| 3. Studio et génération | ☑ Code livré | Photo validée requise, estimation, réservation, brief, fournisseurs mock/live et suivi. Intégration live de l’application non vérifiée. |
| 4. Édition et versions | ☑ Hors périmètre V1 | L’édition après génération a été explicitement retirée du périmètre par le responsable. |
| 5. Post-production | ☑ Code livré | FFmpeg compose le logo et l’audio optionnel; rendu local mock vérifié. Storage réel et fonction Vercel non vérifiés. |
| 6. Bibliothèque, validation et coûts | ☑ Code livré | Approbation/refus motivé, téléchargement après approbation, coûts, plafond et export. Parcours distant non vérifié. |
| 7. Comparaison | ☑ Code livré | Comparaison multi-modèles et évaluation admin dans le code. Parcours distant non vérifié. |
| 8. Validation fal réelle | ☑ Validée hors application | Appels Playground Kling, Veo et LLM documentés. Total **0,952866 USD** sur 2,00 USD. L’intégration dans l’application reste à valider; aucun nouvel appel payant prévu. |
| 9. Vérification et mise en service | ☐ En attente | 31 tests unitaires, lint, TypeScript et build locaux passent; secrets absents du dépôt; garde-fou E2E local ajouté. E2E n’a pas réussi ici. Le dépôt GitHub est vide, la branche n’y est pas publiée et Vercel ne montre aucun déploiement. |

## État des services

- **Supabase** — le projet `Rimco studio` (`hqgxhdekbifyranijvbq`) a reçu `supabase/setup.sql`; le seed RIMCO et les tables ont été contrôlés. L’écran Auth confirme que l’inscription publique est activée; le responsable doit confirmer avant sa désactivation. Le premier compte administrateur, le logo, une photo et une piste audio de marque restent à créer ou valider.
- **Vercel** — projet `rimcostudio` existant, actuellement rattaché à l’équipe Hobby. `FAL_KEY` est stockée comme secret en Production, Preview et Development; `PROVIDERS_MODE` reste `mock`. L’écran Vercel ne trouve ni `CRON_SECRET` ni `FAL_WEBHOOK_SECRET`; les variables Supabase sont confirmées en Production, mais leur présence complète en Preview n’est pas vérifiée. La consultation des variables via l’API Vercel a répondu 403.
- **GitHub** — le connecteur ChatGPT Codex est installé sur le compte `oury-hash` et son accès est limité au seul dépôt privé `oury-hash/rimcostudio` (vérifié dans Chrome et dans le connecteur GitHub). Le dépôt est vide; la branche complète `codex/rimco-v1` et ses commits existent uniquement en local. Aucune PR ni CI distante n’est possible avant publication de la branche.
- **Déploiement** — la liste Vercel du projet ne contient aucun déploiement. Le premier déploiement devra être déclenché après l’arrivée du code sur GitHub et le contrôle des variables Preview. Le plan Hobby est signalé comme non adapté au pilote commercial; vérifier un plan approprié avant tout déploiement de production.
- **Sécurité de clé** — la clé fal a été partagée dans le chat par son propriétaire, puis stockée dans Vercel. Elle doit être révoquée et remplacée après validation contrôlée.

## Vérifications

- `pnpm lint` : réussi.
- `pnpm typecheck` : réussi.
- `pnpm test` : réussi, 31 tests sur 10 fichiers.
- `pnpm build` : réussi sur l’état actuel; les routes Next.js et les pages ont été générées, y compris les fonctions qui embarquent FFmpeg.
- `pnpm test:e2e` : non validé dans cet environnement. Docker/Supabase local et l’écoute du serveur Playwright sont indisponibles (`EPERM` sur `127.0.0.1:3000`). La CI décrit l’exécution E2E avec Supabase local; aucun run GitHub n’est observable tant que le dépôt reste vide.
- `git ls-files '.env*'` : seul `.env.example` est suivi. Recherche d’une clé fournisseur dans les fichiers du dépôt : aucune occurrence.

## À terminer pour une V1 réellement utilisable

1. Rendre la branche locale disponible dans le dépôt privé GitHub, puis créer et faire relire la PR avant fusion.
2. Le responsable doit saisir `CRON_SECRET` et `FAL_WEBHOOK_SECRET` comme secrets dans Vercel (Production et Preview), et vérifier les variables Supabase Preview. Ces deux secrets sont absents.
3. Contrôler la CI, notamment E2E, puis déployer en Preview.
4. Créer le premier administrateur et charger/valider les médias RIMCO.
5. Exécuter un seul parcours live en Preview dans le budget fal déjà autorisé, de la génération jusqu’au téléchargement; aucun nouvel appel fal ne doit dépasser le plafond cumulé documenté de 2 USD.
6. Remplacer la clé fal exposée dans la conversation après l’essai; vérifier le plan Vercel commercial avant la mise en production.
