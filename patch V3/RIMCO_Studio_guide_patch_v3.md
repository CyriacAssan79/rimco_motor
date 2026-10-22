# RIMCO Studio · Guide d'application du patch qualité v3

Fichier : `rimco-qualite-v3.patch`. Il s'applique sur la version `fix-qualite-v2` (26 fichiers, dont 1 migration SQL). Il a été vérifié sur une copie propre de cette version : lint, typecheck, 257 tests et build OK. Il n'a pas encore été testé sur une vraie génération fal : c'est l'objet de l'étape 4.

**Ordre à respecter : 1. migration Supabase → 2. code → 3. variable Vercel (facultative) → 4. tests.**
Sans la migration, l'envoi d'une photo de casting est refusé par la base, et le suivi des plans échoue (colonnes `end_keyframe_*` manquantes).

---

## 1. Migration Supabase (5 minutes)

1. Supabase → projet RIMCO → **SQL Editor** → **New query**.
2. Coller tout le contenu de `supabase/migrations/0030_casting_and_end_keyframes.sql` (fichier ajouté par le patch).
3. **Run**. Le script peut être relancé sans risque.
4. Contrôle, dans une nouvelle requête :

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'assets_kind_check';
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'video_shots' and column_name like 'end_keyframe%';
```

Résultat attendu : la contrainte contient `'character'`, et 6 colonnes `end_keyframe_…` sont listées.

## 2. Code

1. Appliquer le patch sur une **nouvelle branche** (par exemple `qualite-v3`). Avec un terminal : `git apply rimco-qualite-v3.patch`. Sinon, confier le fichier à Codex ou à Oury avec la consigne « appliquer ce patch tel quel ».
2. Ouvrir la PR. La CI GitHub doit passer.
3. Vercel déploie automatiquement un **Preview** de la branche. Faire tous les tests de l'étape 4 sur ce Preview avant de fusionner sur `main`.

## 3. Variable `KEYFRAME_END_FRAME_ROLLING` (facultative)

Elle active l'**image de fin** des plans roulants : le moteur reçoit la première image et la dernière (voiture plus loin sur la route), ce qui force un vrai déplacement. Elle est **désactivée par défaut**.

| Valeur | Effet |
|---|---|
| absente, vide ou `false` | Désactivée : comportement normal. |
| `true` | Activée : environ +0,13 $ par plan roulant (0,08 $ d'image et 0,05 $ de contrôle, indicatif), réservé avant l'appel. |

Pour un test A/B : Vercel → Settings → **Environment Variables** → ajouter `KEYFRAME_END_FRAME_ROLLING` = `true`, **uniquement pour l'environnement Preview**, puis **Redeploy** du Preview. Une variable ne s'applique qu'aux déploiements créés après son ajout.

Un échec de l'image de fin ne bloque jamais la vidéo : le plan est alors animé depuis sa seule image de départ.

Rappel : `VIDEO_COST_CAP_USD` est toujours vide par défaut, et dans ce cas aucun plafond n'est appliqué. Pour appliquer la règle des 15 $, saisir `15`.

## 4. Tests à faire sur le Preview

| # | Test | Ce qu'on vérifie |
|---|---|---|
| 1 | Vidéo **Pro** de 10 s | Correctif Kling : l'animation démarre, sans erreur 422 de fal. |
| 2 | Médiathèque → **Casting** : charger une photo (une personne, en pied, fond simple, ex. « Awa, 30 ans, chemise blanche »), puis la valider en admin | La photo apparaît dans le Studio, bloc « Casting ». |
| 3 | Vidéo Premium avec cette personne sélectionnée et un brief qui la met en scène | Même visage, même coiffure et même tenue dans tous les plans où elle apparaît, et personne d'autre. Les plans sans elle montrent un véhicule vide. |
| 4 | Vidéo sans casting, avec le brief « une famille part à Assinie » | La famille reste la même d'un plan à l'autre (ressemblance approximative sans photo). |
| 5 | Vidéo avec les lieux « Rue urbaine » et « La Pyramide » | Aucune enseigne ni aucun panneau lisible dans les images clés et les clips. |
| 6 | Plans roulants | La voiture avance par rapport aux marquages et aux poteaux, et les roues tournent. Le « Voir le prompt généré » contient « Tyres roll without slipping ». |
| 7 | A/B image de fin : même brief, avec et sans `KEYFRAME_END_FRAME_ROLLING=true` | La DA (Beni) compare la qualité du mouvement. On garde le réglage seulement si c'est nettement mieux. |
| 8 | Logs Vercel, route `/api/versions/[id]/refresh` | Durée du montage nettement sous 45 s. Aucune ligne `montage_failed`. |

## 5. Si un montage échoue

Après 3 échecs, la vidéo passe en « Échec », avec la cause (FFmpeg introuvable, délai dépassé…). La cause détaillée est dans les logs Vercel (`montage_failed`). Les clips restent stockés. Pour relancer le montage sans nouveau coût fal, une fois la cause corrigée, exécuter dans le SQL Editor (en remplaçant l'identifiant) :

```sql
update public.video_versions
set status = 'postprocessing', error_message = null, updated_at = now() - interval '2 minutes'
where id = 'ID_DE_LA_VERSION';
```

Puis ouvrir la page **File de génération** avec un compte admin : le montage repart automatiquement.

## 6. Points de vigilance

- **Droit à l'image** : ne valider une photo de casting qu'avec une cession signée par la personne.
- **Durée du montage** : le montage garde désormais la cadence native des clips (24, 25 ou 30 i/s). À 30 i/s, l'encodage prend environ 25 % de temps en plus (13 s mesurées en local pour 22 s en 1080p). Si les logs dépassent 40 s, le signaler.
- **Photos de lieux** : le prompt et le juge suppriment le texte, mais une photo pleine d'enseignes augmente le nombre de refus. Le showroom (logo de marque au fond) est le plus exposé.
