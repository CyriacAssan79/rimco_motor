# RIMCO Studio

Dépôt GitHub : [oury-hash/rimcostudio](https://github.com/oury-hash/rimcostudio). Bêta interne en français pour créer et gérer des vidéos automobiles RIMCO. Le mode simulation est activé par défaut; il n'exige aucune clé fal. L'application requiert Node.js et pnpm pour le développement, mais la mise en service décrite ci-dessous se fait depuis les navigateurs GitHub, Vercel et Supabase.

## Mise en service depuis le navigateur

1. **Code** — la V1 est sur la branche locale `codex/rimco-v1`. Le dépôt GitHub privé `oury-hash/rimcostudio` est actuellement vide et ne contient pas cette branche; aucune PR n’est disponible. Le dépôt interdit les commandes distantes `git push` et `gh`. Publiez la branche depuis l’interface Codex, puis créez, relisez et fusionnez la PR avant d’attendre un déploiement Vercel.
2. **Supabase** — le projet `Rimco studio` (Frankfurt) est relié au projet Vercel `rimcostudio` par l’intégration officielle. Les variables Supabase sont confirmées en Production; leur présence complète en Preview n’est pas vérifiée. Le script `supabase/setup.sql` a été exécuté et contrôlé : `brands`, `pricing_settings`, `ai_models`, `videos`, `video_versions`, `validations`, `usage_ledger`, `comparisons`, `assets` et `profiles` sont présents; la marque RIMCO Motors, les tarifs 460/700 FCFA/s et les quatre modèles prévus sont en base.
3. **Comptes** — dans **Authentication › Sign In / Providers**, désactivez l’inscription publique. Dans **Authentication › Users › Add user**, créez votre compte avec l’e-mail confirmé. Le premier profil devient administrateur; les comptes suivants doivent être créés depuis l’Admin de l’application.
4. **Vercel** — le projet `rimcostudio` est relié au dépôt `oury-hash/rimcostudio`. `FAL_KEY` est enregistrée comme variable secrète dans Production, Preview et Development. `PROVIDERS_MODE` reste `mock`. La page Vercel ne montre encore aucun déploiement; le dépôt GitHub étant vide, le code ne peut pas être construit par l’intégration.
5. **Mode réel** — avant l’activation, vérifiez les variables Supabase de Preview et ajoutez `CRON_SECRET` et `FAL_WEBHOOK_SECRET` dans Vercel. Leur création est en attente de validation. Après un déploiement Preview, vérifiez génération, post-production, validation, lecture et téléchargement. Le budget fal autorisé de 2 USD a déjà été consommé à hauteur de 0,952866 USD hors application; le solde maximal disponible pour la suite est 1,047134 USD. Ne dépassez pas ce cumul.
6. **Plan d’hébergement** — avant un pilote client, vérifiez que le plan Vercel autorise l’usage commercial. Aucun changement de plan ou de facturation n’a été effectué.
7. **Modèles** — leur catalogue et leur état se gèrent depuis l’Admin; vérifiez la documentation fal avant d’activer un nouvel endpoint.

## Variables

Voir [`.env.example`](.env.example) et `AGENTS.md`. Ne mettez jamais de clé secrète dans un composant navigateur ni dans Git.

## État

Les vérifications locales lint, TypeScript, 31 tests unitaires et build passent. Les appels fal réels ont été exécutés dans le Playground (Kling, Veo et LLM), hors de l’application; le total est de 0,952866 USD. Le test E2E requiert Supabase local et Docker, indisponible dans l’environnement de travail. Aucun déploiement ni test live de l’application n’a été effectué. Le mode reste en simulation jusqu’à la validation de Preview. La clé fal partagée dans le chat doit être révoquée et remplacée après l’essai. Voir [`docs/PROGRESS.md`](docs/PROGRESS.md), [`docs/PLAN.md`](docs/PLAN.md), [`docs/DECISIONS.md`](docs/DECISIONS.md) et [`docs/FAL_VALIDATION.md`](docs/FAL_VALIDATION.md).
