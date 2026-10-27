# Décisions

## Correction · Durées Pro et reprise du montage (2026-10-27)

- **Erreur observée** : le montage vérifiait encore une liste fermée de durées finales (7, 12, 17 ou 22 s). Un clip Pro peut durer 3 ou 4 s ; après désactivation d’un plan, le film peut donc avoir une autre durée légitime. Le contrat vérifie maintenant une durée de clips positive et finie, puis **exactement deux secondes de logo**. Le rendu FFmpeg d’un clip actif de 4 s produit bien un film de 6 s ; musique et durée affichée suivent les clips retenus.
- La durée réellement montée reste dans `brief_json.finalDurationSeconds`. L’affichage utilise cette valeur : on ne réécrit pas `generation_seconds`, dont la contrainte historique n’accepte que certaines durées. Le tarif et les coûts historiques restent inchangés.
- En cas d’échec du montage, le Studio propose à l’admin **« Relancer uniquement le montage »**. La route serveur contrôle le rôle, l’échec de montage, les clips disponibles et leur validation, puis réserve la reprise par mise à jour conditionnelle de la version. Deux onglets ne peuvent pas lancer deux montages. Cette reprise appelle uniquement FFmpeg et Storage : aucune génération fal, aucun mouvement dans le journal des coûts. Les fichiers restent conservés si l’essai échoue encore.
- **Notifications** : l’erreur `notifications.dedupe_key does not exist` correspond à la migration **0036** manquante sur la base utilisée. La lecture conserve les notifications existantes sans erreur 500 pendant la mise à jour ; l’administrateur voit dans la cloche quel fichier SQL appliquer. La migration 0036 à jour accepte aussi `expired` (ajouté par 0037), afin de pouvoir être relancée après les migrations suivantes. Le même correctif figure dans `setup.sql`.
- Vérifications : contrôles de droits et de concurrence, conservation des clips après échec, lecture du schéma ancien et du schéma actuel, durées Pro et rendu vidéo réel ; Playwright confirme le bouton de montage, son blocage pendant le calcul et **zéro nouvelle demande de génération**. Le contrôle SQL local exécute 0036 deux fois avec une notification `expired`, puis vérifie les huit groupes de contrôles de 0038. Aucun projet Supabase distant n’est modifié.
- Résultat des contrôles globaux : **79 fichiers / 542 tests**, lint et TypeScript réussis ; parcours navigateur de reprise réussi. Le build de production est vérifié en mode simulation.
- **Action du responsable** : exécuter le contenu actuel de `supabase/migrations/0036_notifications_actions.sql` dans l’éditeur SQL Supabase si la colonne manque, puis actualiser l’application avec le code corrigé. Sur la vidéo en échec, utiliser **« Relancer uniquement le montage »** avec un compte admin. Aucune nouvelle migration n’est nécessaire pour le calcul de durée et la reprise.

## Partie 6 · Vérification finale et mise en service (2026-10-27)

- Livraison locale sur **`preambule`**, conformément au choix du responsable. Aucun appel de génération payant, aucune migration distante et aucune commande Git vers un service distant.
- Contrôles réussis : lint, TypeScript, **77 fichiers / 524 tests unitaires**, build Next.js en simulation. Le parcours Playwright avec réponses injectées couvre **images clés → clips → désactivation → montage** : durée ramenée à 7 s, dernier clip actif protégé et aucun montage avant validation.
- La migration 0038 est exécutée deux fois dans un PostgreSQL embarqué local (PGlite), avec un schéma de test reproduisant les colonnes concernées et les rôles Supabase. **Huit groupes de contrôles SQL** couvrent tarifs, idempotence, décisions réversibles, réservation à 48 h, reprise ciblée, départ unique du montage et droits serveur. Ce contrôle ne constitue pas un essai sur un projet Supabase complet. Le banc facultatif `scripts/check-review-migration.mjs` utilise une dépendance de test isolée sous `.generated/sql-check`, sans modifier les dépendances de l’application.
- Les [prompts générés](PROMPT-EXAMPLES-2026-10-27.md) présentent le réalisateur, l’image clé et les deux juges avec les deux lieux sélectionnés : sans transition, seul le jour est retenu ; avec « du jour à la nuit », l’ordre jour → coucher de soleil est permis et l’absence de lieu de nuit est signalée. Le fichier provient des constructeurs réellement employés, sans appel fal.
- Le responsable doit, dans son navigateur : **1)** copier la migration `0038_human_review_and_pricing.sql` dans l’éditeur SQL Supabase et l’exécuter avant déploiement ; **2)** déployer cette branche via le parcours GitHub/Vercel habituel ; **3)** vérifier dans Administration les tarifs Standard **460**, Pro **700**, Premium **950 FCFA/s**, et le réglage **Validation humaine (images clés et clips)** ; **4)** ouvrir le Studio pour son essai interne. Aucune nouvelle variable d’environnement n’est nécessaire.
- Les anciennes vidéos gardent leurs réservations automatiques et leur prix figé. La limite humaine d’une reprise par étape s’applique immédiatement : un plan déjà modifié une fois n’a plus de reprise disponible ; ses actions d’acceptation et de validation restent utilisables. Les clips payés ne sont jamais annulés du fait de l’attente humaine.

## Partie 5 · Premium à 19 000 FCFA, Pro inchangé (2026-10-27)

- La migration **0038** crée `pricing_settings.grid_fcfa_per_second_pro`, la remplit avec le tarif Premium de chaque marque **avant** toute hausse, puis fixe Premium RIMCO à **950 FCFA/s**, soit **19 000 FCFA pour 20 s**. Pro RIMCO reste à **700 FCFA/s**, Standard à **460 FCFA/s**. Le niveau Test suit Premium.
- Le remplissage Pro ne concerne que les valeurs nulles : relancer la migration ne remplace pas un tarif Pro déjà enregistré. Aucune écriture dans `usage_ledger`, dont chaque ligne garde le tarif appliqué au lancement.
- L’Administration permet de modifier séparément les trois tarifs par marque. Le Studio lit la grille depuis le serveur ; aucune chaîne de prix Premium à l’ancien montant n’est codée dans son interface. Les tarifs de repli de la simulation suivent aussi la nouvelle grille RIMCO.
- Tests : quatre niveaux, grille par marque, prix réservé figé ; non-régression de la clôture du journal. Les décisions datées plus anciennes conservent le contexte de l’époque ; cette entrée fait foi pour les prochains lancements.

## Partie 4 · Désaccords avec le vérificateur (2026-10-27)

- Choix retenu : `verification_history`, sans nouvelle table ni vue. Une entrée humaine `human_disagree` précède la modification d’une image clé ou d’un clip accepté par le juge (vert ou orange). La désactivation d’un clip accepté est également enregistrée, dans la même transaction SQL que la désactivation.
- Chaque entrée fige vidéo/version, plan, étape, niveau, lieu, type de plan, verdict et avertissements du juge, motifs, commentaire nettoyé et date. Un plan rouge modifié ne crée pas de désaccord. La décision du juge reste intacte.
- Page **Coûts** (admin) : tableau par motif et étape, taux de plans acceptés puis modifiés/désactivés. Dénominateur = plans distincts acceptés par le juge à cette étape ; numérateur = plans distincts concernés, sans double comptage si plusieurs motifs ou actions. L’export CSV détaille les événements et protège contre les formules de tableur.
- Calcul interne à partir des données Supabase ; aucun envoi de ce relevé à un service tiers. Le relevé et son CSV exigent le rôle admin côté serveur.
- Tests : vert/orange enregistré, rouge exclu, contexte et nettoyage, regroupement, dénominateurs, taux et CSV.

## Partie 3 · Validation des clips avant le montage (2026-10-27)

- Le réglage existant `brands.keyframe_approval_mode` couvre les images clés et les clips ; il conserve son nom SQL. Quand il est actif, tous les clips contrôlés (y compris ceux refusés après leur relance automatique) passent sur une planche avant le montage. Le mode `off` conserve le parcours automatique existant.
- La planche affiche le verdict en vert, orange ou rouge, l’action et les avertissements en français. Validation réversible, désactivation réversible (au moins un clip actif), reprise vidéo ou retour à l’image clé. Le retour à l’image rouvre la planche pour ce seul plan ; les autres images restent validées. Les deux reprises consomment le même budget d’une modification du clip. Coût affiché et réservé avant l’appel ; plafond facultatif revérifié.
- Une seule migration **0038** ajoute les fonctions SQL de décision et de départ du montage : elles prennent le même verrou de version. Les décisions arrivées après le départ sont refusées ; deux onglets ne peuvent pas lancer deux montages. Les fonctions de mutation ne sont exécutables que par le serveur, après vérification du propriétaire ou du rôle admin.
- Le montage ne prend que les clips actifs et validés, dans l’ordre. Il peut ne rester qu’un clip. Durée du film, musique et carte de logo sont recalculées ; le prix client figé ne change pas. Les clips déjà générés sont comptabilisés avant la pause.
- Aperçu à la demande : FFmpeg local identique au montage, sans musique ni logo, 540p, stockage privé et URL signée. Cache lié aux fichiers actifs ; l’aperçu est temporaire et renouvelable. Benchmark local reproductible `scripts/benchmark-clip-preview.mjs` : **5,344 s** pour six clips de 5 s, source 1080p/30 i/s, sortie 540p/24 i/s, un fil d’encodage. Cette mesure ne garantit pas les transferts ni les performances Vercel ; un dépassement laisse les clips intacts et permet de réessayer.
- Notification à l’ouverture, rappels à 24 h et 48 h. À 48 h, seules les réservations de correction inutilisées sont libérées : aucune annulation et aucun effacement des clips payés. Une nouvelle correction réserve de nouveau son coût. Le retour à l’image clé ne peut pas faire expirer les clips déjà payés. Chrono suspendu et attente exclue de l’estimation.
- Les validations/désactivations restent dans `verification_history` (`video`, `human_approve` / `human_disable`), sans nouvelle table. Attente, nombre de clips modifiés et désactivés sont exportés par vidéo.

## Partie 2 · Une lumière cohérente par film (2026-10-27)

- Le premier lieu extérieur sélectionné fixe le moment du film (`day`, `golden`, `night`). Un intérieur est neutre. Les autres moments ne figurent ni dans la liste des lieux du réalisateur ni dans sa table de mouvements autorisés. Sans choix explicite, le lancement reste possible.
- Le Studio avertit d’un mélange et permet de garder un moment (avec les intérieurs) ou de demander explicitement une transition. Une transition écrite dans le brief est aussi reconnue : « du jour à la nuit », « jusqu’au coucher du soleil », « la nuit tombe », etc. Elle suit jour → coucher de soleil → nuit, sans retour en arrière, uniquement avec les lieux disponibles.
- Une réponse du réalisateur qui mélange les moments sans transition ou revient en arrière est invalide : elle passe par sa tentative corrigée existante. Le lancement vérifie aussi cette règle avant toute réservation vidéo. Un moment manquant demandé dans une transition est signalé dans les conflits du brief, sans inventer ni rééclairer un lieu.
- Le moment est figé avec la vidéo. Le juge de l’image vérifie hauteur/couleur du soleil et ombres ; celui du clip refuse un changement de moment pendant le plan. Nouveau motif français « lumière » dans les avertissements. Les anciennes vidéos gardent leurs lieux et leur lumière.
- Voiture parallèle aux marquages de voie et au trottoir ; la carrosserie ne se tourne pas vers la caméra sauf si le plan le requiert. La règle est partagée avec le juge, et les plafonds de longueur restent vérifiés en pire cas.
- Tests : filtrage, transition explicite, ordre monotone, intérieurs, conflits, message et boutons du Studio, consignes des juges, non-régression des prompts.

## Partie 1 · Boucles allégées (2026-10-27)

- Une seule correction automatique de l’image clé : deux images et deux contrôles réservés par plan, une correction du réalisateur. La relance automatique du clip reste unique.
- Une modification humaine pour l’image clé et, séparément, une pour le clip, quel que soit le bouton de reprise. « Refaire » sans commentaire consomme aussi ce budget. Ces limites s’appliquent aux vidéos déjà lancées : une modification déjà utilisée épuise désormais le budget de l’étape.
- Compatibilité : le budget automatique est lu dans les réservations de chaque plan, sans le plafonner par la nouvelle constante. Les trois réservations des anciens lancements restent utilisables. Aucun montant historique n’est modifié.
- Pire cas recalculé hors storyboard et images de fin : Standard 20 s **6,44 USD**, Pro 15 s **5,19 USD**, Premium 20 s **21,68 USD**. Les modifications humaines restent réservées à la demande, hors de ces montants. Le calcul et les réservations partagent les constantes. Ces valeurs remplacent celles du tableau du 26/10 plus bas.
- Interface : « 1 modification possible » puis « Modification utilisée ». Aucun changement SQL.
- Vérification : tests de boucle, budgets humains séparés, anciennes réservations et pire cas ; tests des actions et de la planche.

## Validation des images clés avant la vidéo (P2, 2026-10-27)

- **Constat** : une image clé acceptée par le juge partait en animation automatiquement ; l'humain ne voyait que les images refusées.
- **Décision** (étape 5 de l'architecture : deux validations humaines bon marché avant l'étape coûteuse) :
  - **Réglage par marque** dans l'Admin (`brands.keyframe_approval_mode`, migration `0037`) :
    - `off` : comportement d'avant ;
    - `optional` : une case dans le Studio, décochée par défaut ;
    - `premium_default` : la case est cochée par défaut en Premium ;
    - `always` : validation obligatoire. **C'est la valeur par défaut, et celle de RIMCO pendant la bêta.**

    Avant la migration, l'application applique `always` sans rien casser. Dans le Studio, la case « Valider les images clés avant la vidéo » suit ce réglage : cochée et grisée en `always`, absente en `off`. Le choix est figé au lancement (`brief_json.keyframeApproval`), et le réglage de la marque a le dernier mot.
  - **Planche** : quand toutes les images clés sont prêtes, l'animation attend, à l'étape « Votre validation ». La planche montre les images dans l'ordre du film, en grand et en plein écran au clic. Pour chaque plan, elle affiche le titre, l'action en français (tirée des listes fermées : type de plan, sens, vitesse, durée) et les photos du véhicule et du lieu. Actions :
    - « Valider » ou « Modifier ce plan », plan par plan ;
    - **« Tout valider et lancer la vidéo »**, en un clic.

    La vidéo part quand le **dernier** plan est validé, en une seule soumission même avec deux onglets (verrou de soumission existant). Une image modifiée sur la planche doit être validée à nouveau ; son image de fin éventuelle est retirée, et le plan est animé depuis son image de départ.
  - **Stockage** : chaque validation est une entrée « human_approve » dans `verification_history`. Il n'y a pas de nouvelle colonne pour les plans.
  - **Attente** :
    - une notification « action requise » à l'ouverture de la planche ;
    - un rappel à 24 h ;
    - **à 48 h, expiration** : réservations libérées, rien facturé, **images clés conservées**, vidéo annulée avec le message « Images clés non validées sous 48 h ».

    Le rappel et l'expiration sont appliqués à chaque rafraîchissement, donc dès qu'un onglet est ouvert, et par le cron. Ils s'affichent en bandeau (type « expired » ajouté par `0037`).
  - **Chrono** : il est suspendu pendant la validation. Cette attente n'est comptée ni dans les durées, ni dans l'estimation.
  - **Mesures enregistrées pour chaque vidéo** : temps d'attente de validation (`waitSeconds`), nombre de plans modifiés sur la planche (`modifiedShots`) et expiration. Elles figurent dans l'export CSV du suivi de consommation, pour décider, après la bêta, s'il faut passer à `premium_default`.
  - **Coût** : aucun appel supplémentaire si tout est validé. Une modification coûte comme dans P1. Le délai machine ne change pas, car l'animation attendait déjà toutes les images clés.
- **Évolution prévue : « Reprendre la vidéo » après expiration.** Il faut recréer les réservations du clip et de ses contrôles, revérifier le plafond (`VIDEO_COST_CAP_USD` / `VIDEO_COST_CAP_MODE`), puis revenir sur la planche sans refaire les images. C'est plus qu'un effort S : pour l'instant, une vidéo expirée se relance avec les mêmes réglages, avec un nouveau storyboard et de nouvelles images.

## « Modifier ce plan » sur une image clé (P1, partie image clé, 2026-10-27)

- **Décision** : sur le panneau de décision, et sur la planche de P2, « Modifier ce plan » remplace la relance sans commentaire.
  - **Ce que l'utilisateur saisit** : des cases cochées dans une liste fermée, traduites en anglais pour le réalisateur, et/ou un commentaire de 400 caractères au plus. Il faut au moins l'un des deux.
  - **Le commentaire est une donnée** : il est nettoyé (sans `< > { } [ ]` ni caractères de contrôle) et transmis au réalisateur seul, entre balises `<user_feedback>`. Il ne va jamais dans un prompt d'image ou de vidéo : l'image corrigée ne reçoit que les défauts du juge. Le message système du réalisateur rappelle les règles verrouillées.
  - **Ce que le réalisateur peut changer** : seulement les champs déjà modifiables (`applyShotRevision`), dans la matrice (`keepWithinMatrix`), sans manœuvre interdite (`forbiddenShotText`).
  - **Demande interdite** (logo, texte, dérapage, nuit sur un lieu de jour, autre véhicule…) : l'intention est gardée par un moyen autorisé. L'utilisateur voit l'encadré « Votre demande a été adaptée aux règles de la marque », alimenté par la liste fermée tout de suite, puis complété par les phrases du réalisateur (`feedbackConflicts`).
  - **Limite** : `HUMAN_REVISIONS_PER_SHOT = 2` modifications humaines par plan, en plus des corrections automatiques (la relance sans commentaire compte dans ce budget). Au-delà, seuls « Accepter » et « Annuler la vidéo » restent. Avec `MAX_KEYFRAME_ATTEMPTS = 6` (contrainte de la migration 0033) : 1 essai + 2 corrections automatiques + 2 humaines = 5. **Aucune migration** n'est donc nécessaire pour cette partie.
  - **Coût** : en FCFA, avec la même conversion et la même majoration que le reste de l'application (dollars pour l'admin seulement). Il est réservé avant tout appel : environ 181 FCFA en Standard et Pro, environ 212 FCFA en Premium. Le plafond de coût de la vidéo est vérifié avant toute réservation (coût engagé + cette modification ; en mode `worst_case`, au moins le pire cas prévu au lancement). En cas de dépassement, le message ne donne aucun montant.
  - **Historique** : chaque modification est enregistrée dans `verification_history` (`human_revise`, commentaire nettoyé, cases, étendue, conflits).
  - **Simulation** : la route répond désormais (correction simulée, sans appel) au lieu de renvoyer 409.
  - **Reprise d'un clip refusé** : « Refaire la vidéo de ce plan » garde l'image clé validée ; « Refaire l'image clé puis la vidéo » réserve aussi une nouvelle image et son contrôle. Dans les deux cas, le réalisateur adapte le plan avant la nouvelle animation. Le coût du nouveau clip a sa propre ligne interne du journal (`ai_model_id` nul, prix client nul), soldée quand Fal livre le clip ; il n'est donc ni confondu avec la réservation initiale ni facturé une seconde fois au client. La reprise conserve l'ancien MP4 et utilise un suffixe `redo-N` unique. Les états et l'historique existants suffisent : aucune migration n'est requise.
  - **Reprise d'un seul plan** : l'orchestrateur soumet les plans encore en attente même si les autres ont déjà leur identifiant Fal. La liste des plans déjà soumis reste protégée par l'état de soumission atomique.

## Corrections légères de l'audit UX (U6, 2026-10-26)

Seulement des corrections d'affichage, sans changement de logique métier, de données ni de coût. Captures avant/après dans `docs/audit-ux/u6/`. Le détail est en fin de `docs/AUDIT-UX-2026-10-26.md`.

- **Bibliothèque** :
  - statuts justes : « Prête » (générée, pas encore approuvée), « En validation », « Validée » (seulement après l'approbation), « Refusée », « En cours », « Échec » ;
  - nouvel onglet « Validées » ;
  - une vidéo en échec affiche « Non facturée » et sa cause en français, au lieu de « Montant indisponible ».
- **Studio** :
  - le panneau d'options n'est plus collant, il ne recouvre donc plus le bouton « Générer » ;
  - pendant un conflit du brief, le grand bouton est désactivé et la page défile jusqu'à l'encadré, qui devient le seul moyen de lancer ;
  - la pastille « Prête à lancer » dépend de la description ;
  - « Images clés produites » remplace « Images-clés retenues » ;
  - « Voir le prompt généré » est réservé à l'admin.
- **À valider** : le refus passe par une fenêtre avec un motif obligatoire (3 caractères au moins), et un message confirme chaque décision.
- **Coûts** :
  - la marge d'une ligne annulée affiche « — » au lieu de 2 300 FCFA ;
  - euros au format français (« 2,30 € ») ;
  - la description ne parle plus de « plafonds », qui ne sont pas affichés.
- **Médiathèque** :
  - « Médiathèque » et « Médias de marque » remplacent « Médiathèque assets » et « Assets de marque » ;
  - une catégorie technique (« place ») s'affiche avec son nom français ;
  - le compteur « Tout » garde le total pendant un filtre.
- **Lisibilité et accessibilité** sur les écrans audités (Studio, menu, Bibliothèque, À valider, Médiathèque, Coûts) :
  - plus aucun texte sous 12 px ;
  - le gris d'aide devient le gris `muted` de la charte (`#626269`, contraste d'environ 6:1 sur blanc) ;
  - puces, champs, boutons, cloche et indicateur d'en-tête font 44 px au moins.
- **Non fait** : griser les options pendant une génération (audit #11). Cela contredirait la décision du même jour qui permet de préparer une nouvelle vidéo pendant qu'une autre tourne.

## Fin de vidéo dans le Studio : la regarder, l'envoyer, recommencer (2026-10-26)

- **Constat** : une vidéo prête affichait seulement « Votre vidéo est prête à consulter » et un lien vers la Bibliothèque générale. L'envoi au valideur n'était pas proposé à cet endroit. En cas d'échec, le message du fournisseur pouvait s'afficher tel quel, en anglais.
- **Décision** :
  - **Vidéo prête** :
    - le lecteur de la vidéo finale est intégré, avec l'URL signée renvoyée par `/refresh`, redemandée une fois si le Studio retrouve une vidéo déjà prête ;
    - la durée, le niveau, le format et le nombre de points signalés par le contrôle automatique sont affichés ;
    - trois boutons : « Envoyer au valideur » (route existante `POST /api/validations`), « Créer une variante » (mêmes réglages dans le formulaire, titre suffixé « · variante ») et « Ouvrir dans la Bibliothèque » ;
    - un rappel : « Le téléchargement est possible après l'approbation du valideur. »
    - L'état de la validation suit la vidéo : envoyée et en attente, approuvée, ou refusée.
    - Dans le parcours du Studio (storyboard), aucune vidéo n'est approuvée automatiquement, même pour un administrateur : l'envoi au valideur vaut pour tous.
  - **Lien direct** : `/bibliotheque?video=<identifiant>` ouvre le détail de la vidéo, y fait défiler la page et l'encadre. Les notifications « prête », « approuvée » et « refusée » utilisent ce lien.
  - **Échec** :
    - la cause en français (filtre de sécurité, limite du compte du fournisseur, délai dépassé, image clé refusée, animation refusée), avec ce qu'il faut faire ; le message d'origine reste dans « Détail technique » ;
    - ce qui a été facturé, lu dans le journal des coûts : « Rien ne vous est facturé pour cette vidéo », le montant facturé, ou « un coût est en cours de vérification » ;
    - deux boutons : « Relancer avec les mêmes réglages », qui remplit le formulaire et relance aussitôt (le réalisateur repasse, donc un nouveau storyboard), et « Modifier les réglages ».
  - **Réglages repris** : description, véhicule et ses photos, lieux, casting, niveau, durée, format, lumière, musique et titre. Ils sont enregistrés dans `brief_json` (repris par `studioSettings`), ou gardés au lancement. Le choix « personnage » sans casting n'est pas enregistré aujourd'hui et n'est donc pas repris. Un véhicule, un lieu ou une piste qui n'existe plus est ignoré, avec un message pour le véhicule.

## Panneau « Décision requise » compréhensible (2026-10-26)

- **Constat** : les défauts du contrôle automatique s'affichaient en anglais (« t=2.5s blocking: tyre floats »). Le coût d'une relance était donné en dollars à tous, et de plus faux : 0,15 $ affichés pour 0,23 $ réservés. L'image refusée était petite, sans les photos de référence pour comparer.
- **Décision** :
  - **Défauts en français, sans appel payant de plus** : le juge ajoute à chaque défaut un code d'une liste fermée (`identity`, `framing`, `cut_off`, `wrong_direction`, `floating`, `sliding`, `treadmill`, `place`, `foreign_setting`, `pasted_on`, `extra_vehicle`, `people`, `steering`, `traffic_side`, `text`, `other`). L'interface affiche la phrase française de ce code (`src/core/verification/defects.ts`), avec sa gravité (« bloquant », « mineur ») et son instant (« vers 2,5 s »). Le texte anglais reste pour le réalisateur et dans « Détail technique ».
  - **Budget du juge** : les codes ajoutent au plus environ 35 jetons à la réponse, soit moins de 1 % de la limite (`VISION_MAX_OUTPUT_TOKENS` = 4 000).
  - **Robustesse** : un code inconnu, une liste mal formée ou un verdict d'avant ce changement (sans code) ne perdent jamais le verdict. Le défaut s'affiche alors « Autre défaut signalé par le contrôle automatique ».
  - **Coûts** : en FCFA pour tous, avec la même conversion et la même majoration de 30 % que le reste de l'application ; en dollars aussi, mais pour l'administrateur seulement. Le serveur n'envoie jamais les dollars à un autre rôle. Une relance réserve la correction du réalisateur, une image clé et son contrôle : 0,23 $ ≈ 181 FCFA (Standard, Pro) et 0,27 $ ≈ 212 FCFA (Premium, image 2K). Durée annoncée : environ 2 min.
  - **Conséquence affichée sous chaque bouton** :
    - « Accepter : le plan est gardé tel quel ; le valideur verra l'avertissement » ;
    - « Relancer avec le réalisateur : nouvelle image clé et nouveau contrôle, puis la vidéo du plan ; environ N FCFA, environ 2 min » ;
    - « Annuler la vidéo : la vidéo s'arrête ; rien d'autre n'est facturé ».
  - **Comparaison** : grand aperçu de l'image ou du clip refusé, ouvrable en plein écran, avec la photo du véhicule et celle du lieu du plan à côté.
  - **Plusieurs plans en attente** : ils sont présentés dans l'ordre du film, avec « 2 décisions requises » en tête.
- **À venir** : le bouton « Modifier ce plan » (commentaire de l'utilisateur, options pour un clip refusé) attend les arbitrages du plan présenté le 26/10. Le bouton actuel « Relancer avec le réalisateur » reste la relance sans commentaire.

## Notifications : action requise, vidéo prête, échec, validation (2026-10-26)

- **Constat** : le parcours du Studio (storyboard) ne créait aucune notification. La validation n'en créait pas non plus. La cloche et le badge « À valider » ne se rechargeaient qu'au changement de page. Il y avait aussi un défaut caché : l'index d'unicité des notifications était **partiel** (`where version_id is not null`). Or un `ON CONFLICT (user_id, version_id, type)` sans prédicat ne peut pas s'appuyer sur un index partiel : l'écriture échouait, et l'erreur était seulement journalisée.
- **Décision** :
  - **Module partagé** `src/core/notifications/notify.ts`, utilisé par l'ancien parcours (`live.ts`), l'annulation, le parcours storyboard et la validation.
  - **Parcours storyboard** (`src/core/notifications/storyboard.ts`) : après chaque rafraîchissement, y compris par le cron, il notifie la vidéo prête, l'échec définitif avec sa cause, et une « action requise » par plan arrêté. Exemple : « Plan 2 · décision requise : l'image clé a été refusée par le contrôle automatique ». Une vidéo terminée ou annulée ferme les décisions restantes. Une décision sur un plan ferme celle de ce plan uniquement.
  - **Validation** : la soumission notifie les valideurs de la marque et du département, ou les administrateurs s'il n'y a aucun valideur. Le collaborateur est prévenu de l'approbation ou du refus, avec le motif.
  - **Déduplication** (migration `0036`, ajoutée à `setup.sql`) : nouvelle colonne `dedupe_key`, avec un index d'unicité complet sur `(user_id, version_id, dedupe_key)`. Pour une action requise, la clé contient le plan, l'étape et l'heure du refus : le même état revu ne notifie pas deux fois, mais un autre plan, ou le même plan refusé plus tard, notifie de nouveau. Un déclencheur remplit la clé avec le type pour les écritures d'un déploiement plus ancien. **La migration doit être appliquée** : sans elle, les notifications ne sont pas écrites, mais les vidéos avancent normalement.
  - **Interface** :
    - la cloche, le badge « À valider » et un bandeau « Action requise · … » avec le bouton « Voir le plan » se mettent à jour toutes les 60 s quand l'onglet est visible, et aussitôt qu'une vidéo suivie change d'état ;
    - « Voir le plan » mène au panneau de décision du plan dans la file ;
    - le titre de l'onglet devient « (1) Action requise · RIMCO Studio », puis « Vidéo prête · RIMCO Studio ».
  - **Notifications du navigateur** (API Notification, sans service externe) : uniquement si l'utilisateur les active depuis la cloche, jamais par une demande automatique. Elles concernent les actions requises et les vidéos prêtes, et ne s'affichent qu'une fois, même avec plusieurs onglets ouverts. Elles ne fonctionnent que si un onglet RIMCO Studio est ouvert, puisque le suivi en dépend.
- **E-mail : non fait** (hors périmètre de la bêta). Pour l'ajouter, il faudrait :
  - un fournisseur d'envoi (Resend, Postmark, Brevo, SendGrid…) et sa clé dans Vercel ;
  - un domaine d'envoi vérifié (enregistrements SPF et DKIM, et DMARC conseillé) ;
  - une colonne `emailed_at` et un envoi après l'écriture de la notification, idempotent sur la même clé ;
  - une préférence par utilisateur (choix des types reçus) et un lien de désinscription ;
  - des modèles en français, dans la charte RIMCO.

  La file de jobs durable, encore à choisir, serait le bon endroit pour l'envoi et ses nouvelles tentatives.

## Progression lisible : étapes, chronos et fin estimée (2026-10-26)

- **Constat** : seule la durée de l'étape en cours s'affichait, en secondes brutes. Les étapes n'étaient pas les mêmes dans le Studio et dans la file, et certains libellés étaient techniques (« Transfert », « Clôture des coûts »). `processing-display.ts` ignorait le contrôle qualité et la décision : des durées s'affichaient à tort « À venir ».
- **Décision** :
  - **Un seul composant, `GenerationProgress`**, et une seule vue (`progressView`, dans `src/core/versions/progress.ts`), pour le Studio, la file et l'indicateur d'en-tête. La Bibliothèque reprend les mêmes libellés. `processing-display.ts` est supprimé.
  - **Cinq étapes en langage simple** : Préparation (le storyboard), Images clés, Vidéo des plans, Contrôle qualité, Montage. « Votre décision » s'insère après l'étape concernée quand un plan attend une décision. Transfert, clôture des coûts et habillage font partie du Montage. Le Contrôle qualité n'apparaît que si la vidéo a un contrôle des clips (`videoQualityMode`, aujourd'hui sur tous les niveaux à images clés).
  - **Progression par plan** : « image clé en cours », « image clé prête », « vidéo en cours », « vidéo prête », « contrôle en cours », « contrôlé », « à décider », « échec ».
  - **Chronos** : un chrono total depuis le lancement (`requestedAt`), un chrono de l'étape en cours, mis à jour chaque seconde dans le navigateur. Les heures viennent du serveur et sont corrigées de l'écart d'horloge du poste. Pendant « Votre décision », le chrono total s'arrête et le suivi affiche « En attente de votre décision depuis … ».
  - **Temps de décision** : il est déduit de l'historique de vérification déjà enregistré pour chaque plan (refus du vérificateur, puis décision humaine). Aucune nouvelle écriture en base. Ce temps n'est compté ni dans les chronos, ni dans les durées, ni dans l'estimation.
  - **Estimation de fin** : médiane, étape par étape, des 20 dernières vidéos prêtes du même niveau, avec le même nombre de plans et le même contrôle qualité. Les simulations sont exclues et le calcul est gardé 10 min en mémoire. Avec moins de 3 vidéos, une valeur fixe tirée des essais du 22/10 prend le relais, pour 2 plans : Standard ≈ 6 min 20 s, Pro ≈ 5 min 30 s. Premium, jamais mesuré, est une hypothèse prudente (≈ 8 min). Images clés, vidéos et contrôle sont proportionnés au nombre de plans, comme demandé ; c'est pessimiste, car les plans tournent en parallèle, et l'historique remplacera ces valeurs dès 3 vidéos.
  - **Affichage** : « Fin estimée vers 14 h 32 (≈ 3 min) », en minutes entières, avec 1 minute au minimum. Pendant une décision : « Fin estimée ≈ N min après votre décision ». Au-delà de l'estimation + 50 % : « Plus long que d'habitude », sans heure.
- **Évolution prévue** : enregistrer la fin du contrôle qualité dans `processingMetrics`. Aujourd'hui, elle est déduite du début de la clôture des coûts.

## Suivi unique des vidéos en cours, sur toutes les pages (2026-10-26)

- **Constat (audit UX du 26/10)** : la vidéo en cours n'existait que dans la mémoire du Studio. Elle disparaissait dès qu'on changeait de page. Le Studio, la file de génération et la Bibliothèque avaient chacun leur propre boucle d'appels à `/api/versions/[id]/refresh`, à des rythmes différents (5 s, 30 s, 30 s). En dehors de ces pages, seul le cron quotidien faisait avancer une vidéo.
- **Décision** :
  - **Un seul suivi pour toute l'application** (`src/core/versions/generation-tracker.ts`, monté dans le menu par `src/components/generation-tracker.tsx`). Il charge les vidéos de l'utilisateur et appelle `/refresh` pour celles qui sont en cours. Le délai suit celui indiqué par le serveur, entre 10 s (rythme d'AGENTS.md) et 180 s ; il est de 15 s par défaut et de 5 s après une décision sur un plan. Le Studio, la file et la Bibliothèque lisent ce suivi : aucune page n'appelle plus `/refresh` elle-même.
  - **Pas de doublon entre onglets** : l'heure du prochain appel de chaque vidéo est partagée par les onglets du navigateur, et l'appel est pris sous un verrou du navigateur (Web Locks). Ainsi, une vidéo est interrogée une fois par intervalle, quel que soit le nombre de pages ouvertes. Le résultat est diffusé aux autres onglets (BroadcastChannel).
  - **Pause** quand l'onglet est caché ; reprise immédiate quand il redevient visible.
  - **Le Studio retrouve la vidéo** à son ouverture : la dernière vidéo en cours de l'utilisateur, sinon une vidéo terminée depuis moins de 30 minutes qui n'a pas encore été ouverte (« Voir ma vidéo ») ni masquée (« Masquer ce suivi »).
  - **Indicateur dans l'en-tête**, sur toutes les pages et sur mobile : « 1 vidéo en cours · Images-clés · 3 min 12 s ». La durée est comptée depuis le lancement. L'indicateur mène à la file de génération.
  - **Message honnête** dans le suivi du Studio et dans la file : « La génération avance tant qu'une page RIMCO Studio est ouverte… ». Fermer le **dernier** onglet RIMCO Studio pendant une vidéo en cours déclenche l'avertissement standard du navigateur, qui ne bloque pas la fermeture.
  - **Deux vidéos en cours au maximum par utilisateur, dans le Studio.** On peut préparer et lancer une nouvelle vidéo pendant qu'une autre tourne. L'API n'impose aujourd'hui **aucune limite** : cette limite n'existe que dans l'interface. **Évolution prévue** : la vérifier aussi côté serveur, dans `POST /api/versions`, avant toute réservation de coût.
- **Option à décider par l'équipe : un cron Vercel toutes les minutes.** Aujourd'hui, `vercel.json` appelle `/api/cron/reconcile` une fois par jour, ce qui est la limite de l'offre Hobby. Sur l'offre Pro, un cron toutes les minutes ferait avancer les vidéos même sans aucun onglet ouvert. Rappel : l'offre Pro est de toute façon requise pour un usage client, car Hobby est réservé à un usage personnel et non commercial (voir plus bas).
  - *Pour* : plus besoin de garder un onglet ouvert ; changement limité à `vercel.json` (planification `* * * * *`) une fois l'offre Pro souscrite.
  - *Contre* : le cron traite 10 vidéos par passage, avec un délai maximal de 60 s par route. Il faudra mesurer la durée d'un passage avec FFmpeg avant de l'activer. Un appel par minute reste plus lent que le suivi des pages ouvertes (10 à 15 s).
  - *En attendant* une file de jobs durable : le choix entre Trigger.dev, Inngest ou Cloud Run reste ouvert.
  - `vercel.json` n'est **pas** modifié tant que l'équipe n'a pas tranché.

## Marche arrière et demi-tour interdits de nouveau (2026-10-26)

- **Constat** : la règle « la voiture roule seulement en marche avant », ajoutée le 24/10 après l’essai B (un demi-tour puis une marche arrière), a disparu avec le retour à la version du 23/10 (commit du 25/10). Elle n’a pas été remise depuis. Un demi-tour n’était plus interdit en amont : seul le juge du clip pouvait le refuser après coup, indirectement (« va dans un autre sens »), et seulement en Premium.
- **Décision** :
  - **Générateurs** : les trois phrases de conduite (croisière, arrivée, conduite dynamique) disent « no drift, skid, spin, reversing, U-turn… ». Pas de bloc à part : les prompts d’animation sont déjà au plafond de 2 000 caractères dans les pires cas. L’image de fin montre la voiture « having driven forward » plus loin.
  - **Juge du clip** : une voiture qui recule ou fait demi-tour est un défaut bloquant, écrit explicitement.
  - **Juge de l’image de fin** : une voiture retournée, ou qui aurait dû reculer depuis l’image de départ, est bloquante. Cela vaut pour les nouvelles vidéos seulement (marqueur `frameChecks: 2`).
  - **Réalisateur** : « reverses, in reverse, backs up, U-turn, turns round, three-point turn » dans la scène ou l’action rendent sa réponse invalide ; elle est alors corrigée automatiquement. Ces mots ne sont pas lus dans le champ caméra : « reverse tracking », c’est-à-dire un travelling arrière, reste permis.
  - **Liste fermée des conflits** : « marche arrière », « demi-tour », « recule »… donnent « Marche arrière ou demi-tour demandé : la voiture roule toujours en marche avant. ». « La caméra recule » n’est pas signalé.
- **Vidéos déjà lancées** : les phrases de conduite des générateurs, l’image de fin « driven forward » et la formulation du juge du clip s’appliquent à la prochaine étape. Le nouveau contrôle du juge de l’image de fin ne s’applique pas.

## Prompts « preambule » : incohérences corrigées après vérification (2026-10-26)

- **Constat** (vérification des prompts générés sur la branche `preambule`) :
  - sur une reprise d’image clé, la description du lieu et la règle « tout ce que la caméra révèle appartient à ce lieu » formaient un seul bloc raccourcissable : le prompt finissait par « Everything the camera reveals belongs to this same. », ou perdait la règle entière ;
  - la règle de circulation parlait de « voitures en face », alors que les générateurs reçoivent « aucun autre véhicule » et que les juges bloquent tout véhicule bien visible ;
  - le réalisateur avait interdiction de tout gros plan sans photo correspondante, alors que la table ALLOWED propose des plans détail pour toutes les photos ;
  - une puce de lumière sans rapport avec les lieux (« fin de journée » avec des lieux de jour) était envoyée au réalisateur, puis ignorée par les générateurs sans que l’utilisateur le sache ;
  - le juge du clip demandait des roues qui tournent même pour une voiture à l’arrêt ;
  - plusieurs formulations ne correspondaient pas à la scène : une route en showroom, un « tablier de pont » hors d’un pont, des vitres sombres alors que le volant doit se voir au travers, etc.
- **Décision** :
  - **Règle du lieu verrouillée** : `placeRule` renvoie deux parties. La description (« Place: … ») peut être raccourcie jusqu’à 40 caractères, et seulement après l’action, le cadrage, la lumière et le retour du juge (nouvelle option `shrinkLast` de `fitPrompt`). La règle n’est jamais touchée. Dans un cas extrême seulement (fiche de personnes de 400 caractères sur un plan roulant rapide, tous les champs au maximum), la description peut être retirée en tout dernier recours ; la règle reste. En intérieur, la règle parle de « murs, vitres et sol » au lieu de « route, bâtiments et végétation ».
  - **Circulation** : la règle garde le côté de la voie, sans « voitures en face » (générateurs, réalisateur, correction). Les juges bloquent toujours une voiture dans la voie du mauvais côté.
  - **Gros plans** : « un gros plan seulement sur un détail visible sur la photo du plan ; pas d’intérieur, d’arrière ni de profil sans photo correspondante ».
  - **Lumière** : si le moment de la puce ne correspond à aucun des lieux choisis (et que tous les lieux ont un moment connu), un conflit s’ajoute à la liste fermée : « Lumière « fin de journée » demandée : les lieux choisis sont de jour, la lumière suit le lieu. ». La puce n’est alors pas envoyée au réalisateur.
  - **Voiture à l’arrêt** : le juge du clip demande « pneus au contact du sol ou de la route, roues immobiles ». La phrase « les pneus doivent continuer à tourner » est réservée aux plans en mouvement.
  - **Longueur du réalisateur** : la table ALLOWED utilise des références courtes (P1… pour les photos, L1… pour les lieux), expliquées une seule fois dans les listes. Les photos qui ont les mêmes combinaisons sont regroupées. Le code vérifie toujours les vrais identifiants, comme avant. Une réponse qui donnerait « P1 » au lieu d’un identifiant est refusée puis corrigée automatiquement. Avec 12 lieux et 6 photos, la consigne passe de **17 246 à 10 796 caractères** (la table seule, de 9 715 à 2 790).
  - **Jetons des juges** : chaque contrôle visuel journalise `vision_usage` (étape, `completionTokens`, plafond `VISION_MAX_OUTPUT_TOKENS` = 4 000) dans les journaux Vercel, pour comparer la consommation réelle au plafond.
  - **Formulations** : en showroom, l’image clé dit « voiture exposée, à l’arrêt » et « sol » au lieu de « route » ; « (a bridge: its deck) » n’apparaît que pour un pont ; une voiture vide est « visible à travers les vitres » ; sans personnage, le réalisateur reçoit la règle du volant pour une voiture vide.
  - **Juges des images fixes** : le juge de l’image clé ne tolère plus une voiture qui entre ou sort du cadre (la tolérance reste pour le clip). Le juge de l’image de fin contrôle aussi le cadrage demandé, l’effet « voiture collée » et un véhicule en trop. Le générateur de l’image de fin reçoit la règle « voiture entière dans le cadre ».
  - **`ANIMATION_PROMPT_MAX_LENGTH` supprimée** : sa seule valeur (Kling, 2 500) est au-dessus du plafond commun de 2 000 caractères. Elle ne changeait donc rien.
  - **Retour du juge trié par gravité** : avant, le retour était coupé par la fin. Dans un essai, cette coupe a fait disparaître un défaut **bloquant** (« une deuxième voiture blanche ») et gardé deux défauts mineurs, alors que l’action du plan était réduite à « The SUV drives. ». Désormais :
    - les défauts bloquants (ou sans gravité indiquée) forment un bloc de 300 caractères au plus, raccourci en tout dernier et retiré seulement en ultime recours. Dans les cas réels, il reste entier ;
    - les défauts marqués « minor » sont raccourcis en premier : « If possible, also avoid: … » ;
    - les juges de l’image clé et de l’image de fin commencent maintenant chaque défaut par sa gravité, comme le juge du clip le faisait déjà.
  - **Ordre de raccourcissement** : défauts mineurs, puis la scène, l’action, le cadrage, la caméra et la lumière, puis la description du lieu, puis les défauts bloquants. Les blocs d’un même rang se partagent l’excédent au prorata de ce que chacun peut céder : l’action n’est plus réduite à son minimum pendant que les blocs suivants restent entiers. Une coupe ne finit plus sur un article ou une préposition (« as in the. »).
  - **Plafond des prompts d’image** : 2 500 caractères au lieu de 2 200. La valeur de 2 200 était une marge prise faute de limite connue. Le schéma fal de Nano Banana 2 (edit) documente `maxLength: 50000` (vérifié le 26/10). Le plafond vidéo reste à 2 000, pour garder de la marge sous la limite de 2 500 de Kling.
- **Vidéos déjà lancées** : leur premier prompt d’image clé est déjà envoyé. Les corrections ne les touchent qu’à la prochaine étape (nouvelle tentative, image de fin, animation, contrôle) :
  - **s’appliquent** (formulations) : règle du lieu entière, circulation sans voitures en face, roues immobiles à l’arrêt dans le juge du clip, formulations du showroom, du pont et de la voiture vide, retour du juge trié par gravité et nouvel ordre de raccourcissement, plafond d’image à 2 500 ;
  - **ne s’appliquent pas** (comportement des juges) : le juge de l’image clé sans tolérance d’entrée ou de sortie du cadre, et le juge et le générateur de l’image de fin complétés. Ils dépendent du marqueur `frameChecks: 2`, enregistré seulement à la création des nouvelles vidéos ;
  - **sans objet** : gros plans, conflit de lumière, règle du volant du réalisateur et table ALLOWED ne servent qu’à la préparation du storyboard.
- **Non traité** :
  - **Puces de lumière** : griser dans le Studio les puces incompatibles avec les lieux choisis est proposé, mais pas codé.

## Plans Pro de 3 à 5 s, coût maximal affiché, mode du plafond au choix de l’équipe (2026-10-26)

- **Constat** :
  - Pro autorisait des plans de 3 à 15 s, alors que l’architecture fixe des plans de 3 à 5 s, parce que les moteurs tiennent mal au-delà de quelques secondes ;
  - le plafond `VIDEO_COST_CAP_USD`, facultatif, ne visait que le coût nominal (une tentative de chaque étape), alors que le code réserve bien plus en cas de relances.
- **Décision** :
  - **Pro** : le storyboard impose des plans de 3 à 5 s. Le réalisateur reçoit « 2 à 3 plans » pour 10 s, « 3 à 5 plans » pour 15 s, « 4 à 6 plans » pour 20 s. Un plan unique Pro long est découpé en plans de 5 s. Le catalogue du moteur Kling n’est pas modifié (il accepte toujours 15 s). Le storyboard simulé utilise des plans de 5 s sur tous les niveaux.
  - **Coût maximal** (`worstCaseVideoCostUsd`, `src/core/billing/video-cap.ts`), calculé à partir des mêmes constantes que les réservations du lancement. Par plan : 3 images clés et 3 contrôles, 2 corrections du réalisateur à 0,05 $, 2 clips et 2 contrôles de clip ; plus les images de fin et le storyboard. Les relances demandées ensuite par un humain n’y sont pas : chacune est réservée au moment où elle est demandée.
  - **Enregistrement** : les deux montants sont figés à la création dans `brief_json.costPlanUsd`. Le nominal garde son format d’avant ; le coût maximal et le mode du plafond sont ajoutés à côté.
  - **Affichage** : la page Coûts de l’admin affiche la colonne « Coût prévu (nominal / maximum) » en dollars, aussi dans l’export CSV. Pour les vidéos créées avant, seul le nominal est connu.
  - **Mode du plafond inchangé** : nouvelle variable `VIDEO_COST_CAP_MODE` = `nominal` (défaut, comportement actuel) ou `worst_case`. C’est à l’équipe de choisir. Sans `VIDEO_COST_CAP_USD`, il n’y a toujours aucun plafond.
- **Ordres de grandeur** (tarifs indicatifs du catalogue, sans storyboard ni images de fin) :

  | Vidéo | Nominal | Maximum |
  |---|---|---|
  | Standard 20 s (4 plans Wan) | 3,12 $ | 6,44 $ |
  | Pro 15 s (3 plans Kling de 5 s) | 2,52 $ | 5,19 $ |
  | Premium 20 s (4 plans Seedance, images 2K) | 10,74 $ | 21,68 $ |

  En mode `worst_case`, un plafond de 15 $ refuserait donc le Premium 20 s, qu’il accepte en mode `nominal`.
- **Vidéos déjà lancées** : leurs plans gardent leur durée. Les corrections du réalisateur ne peuvent pas changer la durée d’un plan.

## Demandes du brief écartées signalées avant le lancement, storyboard signé (2026-10-26)

- **Constat** :
  - le réalisateur écartait en silence ce que les règles interdisent (drift, texte ou logo à l’écran, nuit sur un lieu de jour…), et rien ne remontait à l’utilisateur ;
  - `/api/versions` acceptait le storyboard envoyé par le navigateur : ses textes allaient tels quels dans les prompts des générateurs ;
  - aucun ordre de priorité n’était écrit entre le brief et les règles.
- **Décision** :
  - **Priorité** : le message système du réalisateur dit maintenant « règles verrouillées > brief > choix créatifs ». Quand le brief est en conflit avec une règle, le réalisateur garde son intention (énergie, émotion, lieu) par un moyen autorisé et le signale.
  - **Conflits signalés** (`briefConflicts`, de 0 à 5 phrases en français) : ils sont écrits par le réalisateur et complétés par une liste fermée vérifiée par le code (`src/core/brief/conflicts.ts`) : drift ou dérapage, vitesse excessive, texte ou logo, nuit sur un lieu de jour et l’inverse, intérieur sans photo d’habitacle, voiture qui roule en showroom. En simulation, cette liste fournit seule les conflits. Les conflits ne vont jamais aux générateurs ni aux juges.
  - **Studio** : quand il y a au moins un conflit, le lancement s’arrête après la préparation. Un encadré « Votre demande a été adaptée aux règles de la marque » s’affiche avec deux boutons, « Lancer la vidéo » et « Modifier ma demande ». La préparation du réalisateur (quelques centimes) est déjà payée ; la génération ne l’est pas. Sans conflit, le parcours reste d’un seul clic.
  - **Storyboard signé** : `/api/storyboard/suggest` signe (HMAC-SHA256) les plans et la fiche des personnes exactement tels qu’il les renvoie, pour cet utilisateur, ce dossier véhicule, ce niveau, cette durée, ce format et ce parcours, avec une validité de 24 h. `/api/versions` refuse tout autre storyboard avec un 422 en français. Le parcours `photo_fidelity`, qui n’envoie ni texte ni prompt et n’est pas utilisé par le Studio, n’est pas concerné.
  - **Textes du réalisateur** : balises, accolades et caractères de contrôle sont retirés avant tout prompt. Un plan qui décrit une manœuvre interdite (drift, dérapage, burnout, course) est refusé et corrigé.
  - **Corrections dans la boucle** : `applyShotRevision` ne modifie que la scène, le cadrage, le lieu (texte), l’action, la caméra, le type de plan, le sens et la vitesse (vérifié et testé). Elles ne passent jamais par le navigateur, donc pas de signature. Une correction qui écrit une manœuvre interdite est écartée : nouvelle image avec les seuls défauts du juge.
- **Nouvelle variable `STORYBOARD_SIGNING_KEY`** :
  - serveur uniquement ;
  - 32 caractères au moins ; 64 caractères aléatoires recommandés, tirés d’un générateur de mots de passe et collés dans Vercel (procédure dans le README) ;
  - **obligatoire en mode live, donc dans l’aperçu Vercel actuel** : sans elle, la préparation affiche un message clair avant tout appel payant. L’application ne refuse pas de démarrer pour autant ;
  - en simulation, une clé de développement fixe est utilisée (CI et test de bout en bout) ;
  - la changer invalide seulement les storyboards préparés et pas encore lancés.
- **Futur écran de validation du storyboard** : une route `POST /api/storyboard/validate` recevra le storyboard modifié et la signature d’origine.
  - Les **champs fermés** (type de plan, sens, vitesse, photo, lieu, personnes oui ou non, durée, ordre, suppression) pourront être modifiés directement, puis revérifiés par le code et resignés.
  - Les **textes** ne seront jamais saisis librement : une consigne de l’utilisateur passera par le réalisateur, comme donnée, avec un coût réservé ; le résultat sera revérifié puis resigné.
- **Longueur** : la consigne du réalisateur passe de 3 500 à 4 000 caractères au plus (règle de priorité et champ des conflits). C’est un budget de lisibilité ; aucun moteur n’impose de limite ici.
- **Non traité** :
  - le français des conflits écrits par le réalisateur n’est pas vérifié ;
  - le détecteur par mots-clés peut manquer une formulation inhabituelle, ou signaler un conflit en trop (par exemple « affiche » au sens de « montre »).

## Une lumière par plan, prompts en anglais, plus de texte libre dans la couche verrouillée (2026-10-26)

- **Constat** :
  - un même prompt d’image clé pouvait dire « plein jour » (description du lieu) et « Lumière douce de fin de journée » (puce du Studio) : seuls les conflits jour, nuit et intérieur étaient détectés ;
  - la lumière, l’ambiance et les noms de lieux étaient en français dans des prompts anglais ;
  - les routes `/api/storyboard/suggest` et `/api/versions` acceptaient la lumière et l’ambiance en texte libre (160 caractères), injecté dans le message système du réalisateur et dans le prompt d’image : c’était une porte du brief vers la couche verrouillée.
- **Décision** :
  - **Lieux** : chaque lieu du catalogue a un nom anglais (`placeEn`), suivi de sa description anglaise sans moment de la journée. Le titre d’un lieu importé est envoyé sans ses mots de moment de la journée (« nuit », « fin de journée », « coucher de soleil »…). Les textes français du catalogue restent pour l’équipe.
  - **Lumière** : chaque puce du Studio a une phrase anglaise et un moment de la journée (`src/core/scenes/prompt-values.ts`). Une seule lumière par plan : la puce n’est utilisée que si son moment est celui du lieu ; sinon la lumière du lieu l’emporte. Le réalisateur reçoit la même phrase anglaise.
  - **Ambiance (option retenue : traduire)** : les 15 ambiances du catalogue des scènes sont traduites. L’ambiance oriente encore le réalisateur, et elle reste le premier bloc supprimé du prompt vidéo s’il est trop long. Si elle n’apporte rien à l’essai, la retirer du prompt vidéo est un changement d’une ligne.
  - **Catalogue seulement** : la lumière et l’ambiance n’acceptent que les valeurs du catalogue des scènes. Toute autre valeur est ignorée sans erreur, donc une page du Studio restée en cache continue de fonctionner. Les constructeurs eux-mêmes ignorent une ambiance hors catalogue.
  - **Message système des juges** : il est en anglais, comme leur prompt.
- **Effets visibles** :
  - les défauts listés par les juges (avertissements vus par le valideur) arrivent en anglais ;
  - un lieu « plein jour » choisi avec la puce « fin de journée » est maintenant éclairé en plein jour.
- **Vidéos déjà lancées** : la lumière déjà figée par plan est gardée. Si elle était en français, l’image clé reçoit à la place la lumière neutre « lumière naturelle du lieu ». Une ambiance ancienne hors catalogue n’est plus envoyée.
- **Non traité** : l’ancien parcours plan unique (`briefToPrompt`, route `/api/versions` hors storyboard) envoie encore en français le lieu, le décor, l’action, la caméra et le personnage saisis. Seules la lumière et l’ambiance y sont traduites ou filtrées.

## Personnes sans casting : seulement dans les plans prévus, apparence contrôlée (2026-10-26)

- **Constat** :
  - sans photo de casting, la fiche des personnes écrite par le réalisateur partait dans **tous** les plans, y compris les plans larges et les détails ;
  - les juges ne la recevaient pas : ils vérifiaient où étaient les personnes (dans la voiture quand elle roule), jamais leur apparence ;
  - la fiche finissait par « . » suivi de « ; » dans le prompt.
- **Décision** :
  - **Choix du réalisateur, plan par plan** : chaque plan porte un indicateur `withPeople` (personnes visibles : oui ou non). Le réalisateur doit le remplir pour chaque plan, avec au moins un plan où les personnes sont visibles, dès qu’il écrit une fiche. Sinon sa réponse est refusée et corrigée.
  - **Plan sans personnes** : la voiture est vide, avec la consigne « personne dans ni autour de la voiture », et le juge refuse toute personne visible.
  - **Plan avec personnes** : il reçoit la fiche.
  - **Juges** : les deux juges (et celui de l’image de fin) reçoivent la fiche comme donnée nettoyée. Toute personne visible doit lui correspondre ; une personne différente ou en trop est bloquante.
  - **Inchangé** : « personne hors d’une voiture qui roule » et « personne ne s’appuie sur la carrosserie ».
  - **Avec un casting photo** : `withPeople` est ignoré ; c’est la liste des photos de casting de chaque plan qui décide, comme avant.
- **Correction d’un plan** : la correction du réalisateur ne peut pas changer `withPeople`, car les personnes font partie de ce qui est verrouillé.
- **Vidéos déjà lancées** :
  - leurs plans n’ont pas `withPeople` : la fiche reste dans tous les plans, comme avant ;
  - les juges reçoivent toutefois la fiche dès leur prochain contrôle ;
  - l’image clé dit maintenant « identiques là où elles apparaissent » au lieu de « identiques dans chaque plan ».
- **Longueurs** : la consigne du réalisateur reste sous son budget de 3 500 caractères. Les pires cas des prompts d’image et de vidéo passent.
- **Ce qui n’est pas traité** : la fiche est comparée plan par plan. Aucun juge ne compare deux plans entre eux, et une dérive progressive reste donc possible si chaque plan correspond « à peu près » à la fiche.

## Chaque règle a son contrôle : plan du storyboard, effet collé, véhicule en trop (2026-10-26)

- **Constat** :
  - du plan, les juges ne recevaient que le titre, la scène, le cadrage et le lieu ;
  - ils ne vérifiaient ni le sens de marche, ni l’arrêt d’une arrivée, ni le mouvement de caméra, ni l’effet « collé », ni un véhicule en trop, ni l’alignement de la voiture sur sa voie (image clé) ;
  - le juge du clip ne voyait pas l’image clé validée.
- **Décision** :
  - **Plan du storyboard** : il est donné aux deux juges comme donnée, nettoyée et bornée : type de plan, phrase de trajet, action, caméra, et la scène pour le juge de l’image clé.
  - **Image clé** : le sens se lit à l’orientation de la voiture ; une voiture tournée dans le mauvais sens ou en biais sur sa voie est bloquante.
  - **Clip** : sont bloquants une voiture qui va dans le mauvais sens, qui ne bouge pas alors qu’elle doit rouler, qui roule alors qu’elle doit être arrêtée, ou une arrivée qui ne s’arrête jamais. Un mouvement de caméra différent du plan est mineur.
  - **Effet collé et véhicule en trop** : deux contrôles écrits une seule fois dans `rules.ts` (`INTEGRATION_CHECK`, `NO_EXTRA_VEHICLE_CHECK`) et utilisés par les deux juges. Une voiture « collée » (perspective, échelle, ombre, reflets) est bloquante ; un autre véhicule bien visible est bloquant, un minuscule véhicule au loin est mineur.
  - **Image clé validée pour le juge du clip** : elle est sa première référence, après les images extraites du clip, et la numérotation des images en tient compte.
  - **Lisibilité** : le prompt du juge du clip garde une liste de défauts bloquants courte et fixe ; seuls les détails dépendent du type de plan.
- **Longueur des prompts des juges** (plan type avec personnes, règles de conduite, matrice et cadrage) : juge de l’image clé +12 à +20 %, juge du clip +16 à +20 %, au lieu de +21 à +24 % avant resserrage. La consigne sur le texte lisible a été raccourcie pour y arriver.
- **Coût** : le juge du clip lit une image de plus, une hausse de l’ordre de quelques millièmes de dollar, couverte par la réserve de 0,10 USD.
- **Règles et leur contrôle** :

  | Règle (réalisateur ou générateurs) | Contrôle |
  |---|---|
  | Durées, nombre de plans, photos et lieux autorisés, lieu obligatoire | code (réponse refusée puis corrigée) |
  | Combinaisons photo × lieu, vitesse maximale, poussière | code (matrice) |
  | Showroom immobile | code, et juges image et clip |
  | Identité, couleur, badge, calandre, logo | juges image et clip |
  | Pneus au sol, pas de collage ni d’écran partagé | juges image et clip |
  | Même lieu, rien d’une autre ville ou d’un autre pays | juges image et clip |
  | Côté de circulation, côté du volant, conducteur tourné vers la route | juges image et clip |
  | Personnes : aucune si non demandée, casting fidèle, à bord quand la voiture roule | juges image et clip |
  | Cadrage demandé, voiture entière (sauf plan de détail) | juges image et clip |
  | Voiture alignée sur sa voie, le long de la route du lieu | juge image (**nouveau** hors matrice) ; juge clip (trajectoire) |
  | Sens de marche | juge image (orientation, **nouveau**) ; juge clip (**nouveau**) |
  | Roule / à l’arrêt / arrivée qui s’arrête | juge clip (**nouveau**) |
  | Mouvement de caméra | juge clip, mineur (**nouveau**) |
  | Éclairée comme le lieu : ombres, reflets, perspective | juges image et clip (**nouveau**) |
  | Aucun autre véhicule | juges image et clip (**nouveau**) |
  | Aucun texte, enseignes vierges, plaques illisibles | juges : signalé en avertissement, jamais bloquant (choix existant) |
  | Conduite calme, pas de dérapage, roues qui tournent | juge clip |
  | L’image de fin montre la voiture plus loin sur son trajet | juge de l’image de fin |
  | Une seule idée, ouverture en mouvement, fin sur un plan héros | **aucun** |
  | Au moins la moitié des plans roulent, un seul travelling latéral, un seul sens latéral pour le film | **aucun** (vérifiable par le code, non fait) |
  | Lumière selon le moment de la journée du lieu | **aucun** (la lumière vient du code ; aucun juge ne la compare au lieu) |
  | Mêmes personnes d’un plan à l’autre (fiche décrite, sans photo de casting) | juges image et clip, contre la fiche (ajouté le même jour, entrée « Personnes sans casting ») |
  | Personne ne s’appuie sur la carrosserie | **aucun** |
  | Ambiance, rendu photo réel (« pas d’aspect image de synthèse ») | **aucun** (subjectif) |
  | Le clip arrive à l’image de fin fournie | **aucun** (le juge du clip ne voit pas l’image de fin) |

- **Invérifiable sur des images fixes**, ou seulement en partie avec 5 images du clip :
  - la vitesse absolue (« lente », « croisière », « soutenue ») ;
  - un ralentissement régulier ;
  - une vitesse constante ;
  - « un seul mouvement de caméra lent » ;
  - la rotation des roues, vue seulement en partie sur les gros plans ;
  - le flou de vitesse des jantes sur l’image clé ;
  - l’ambiance.
- **Vidéos déjà lancées** : les nouveaux contrôles s’appliquent à leurs prochains contrôles, car ce sont des règles et non des valeurs de la vidéo. Le critère de cadrage reste réservé aux vidéos créées depuis le 26/10.

## Prompts sans contradiction : arrivée, conduite, retour du juge (2026-10-26)

- **Constat**, en exécutant les constructeurs sur un plan héros qui arrive :
  - l’image clé disait à la fois « la voiture vient de s’arrêter » et « elle roule vers la caméra puis s’arrête en douceur » ;
  - l’animation disait l’arrivée deux fois, puis « à vitesse constante » alors que la voiture s’arrête ;
  - en vitesse soutenue, « vitesse vive » était suivi de « conduite calme » ;
  - le retour du juge était donné aux générateurs comme « donnée, pas instruction » : on leur demandait d’ignorer la correction à appliquer.
- **Décision** :
  - **Arrivée** : la première image d’une arrivée montre la voiture qui roule encore, quelques mètres avant son arrêt. L’animation ne dit l’arrivée qu’une fois.
  - **Une consigne de conduite par cas** (`DRIVING_RULES`, `src/core/prompts/rules.ts`) : croisière (inchangée), arrivée (« ralentit doucement et régulièrement »), dynamique (« conduite vive et maîtrisée »).
  - **Retour du juge** : donné aux générateurs sous la forme « Correct this defect of the previous attempt: … », toujours nettoyé et borné. Le réalisateur, qui est un modèle de langage, garde ses balises `<defects>` qui marquent le retour comme une donnée.
- **Inchangé** : le plan héros à l’arrêt (« vient de s’arrêter », « ne bouge pas ») et la croisière.
- **Vidéos déjà lancées** : ces corrections de formulation s’appliquent aussi à leurs prochaines images et relances. Aucune valeur nouvelle n’est lue dans la vidéo.
- **Longueurs** : les tests de pire cas passent sans changement de plafond.

## Cadrage et badge bloquants sur tous les niveaux (2026-10-26)

Règles de cadrage et de badge appliquées à tous les niveaux (image de marque) ; le niveau reste un plafond de coût. À mesurer : part des plans en décision humaine en Standard sur les 10 premières vidéos ; au-delà d'un plan sur trois, corriger les prompts d'image clé plutôt qu'assouplir le juge.

- **Constat** :
  - le badge n’était cité comme bloquant que par le juge du clip ;
  - le véhicule coupé par le cadre et le cadrage n’étaient contrôlés nulle part ; le cadrage demandé n’était donné au juge de l’image clé qu’à titre d’information ;
  - la phrase du juge sur le lieu (« un autre cadrage ou recadrage du lieu est normal ») pouvait l’amener à tolérer un véhicule mal cadré.
- **Règle de cadrage** (`src/core/prompts/rules.ts`), selon le type de plan : en plan d’ensemble, plan qui roule ou plan héros, la voiture est entière dans le cadre, avec de l’air autour ; en plan de détail, le détail demandé est net et entier, et la voiture peut être coupée. Dans un passage latéral, la voiture peut entrer dans le cadre ou en sortir.
- **Générateurs** : l’image clé reçoit cette règle (bloc verrouillé). L’animation la reçoit aussi, en rappel : elle peut être supprimée en dernier recours si le prompt est trop long, car le cadrage est déjà fixé par l’image clé de départ et le juge du clip le vérifie.
- **Juges, image clé et clip, tous niveaux** :
  - **bloquant** : véhicule coupé par le cadre (sauf plan de détail) ; badge, calandre, logo constructeur, phare ou jante déformé, mal écrit ou recoloré (même texte pour les deux juges) ; cadrage nettement différent de celui demandé ;
  - **mineur** : cadrage un peu plus serré, plus large ou légèrement décentré. Il est gardé comme avertissement pour le valideur ; c’est maintenant aussi le cas sur l’image clé, comme sur le clip ;
  - le cadrage demandé par le storyboard devient un critère explicite ;
  - **le niveau n’est jamais transmis** pour ces règles : un test vérifie que la liste envoyée aux juges est identique en Standard, Pro et Premium.
- **Phrase du lieu reformulée** : « un autre angle ou une autre partie du même décor est normal ». Elle ne parle plus de cadrage.
- **Longueur des prompts** : la règle tient au pire cas, pour chaque mouvement et chaque type de plan (test). Pour cela, l’action, le bloc cadrage-caméra et la lumière peuvent être raccourcis davantage, seulement sur des plans exceptionnellement longs.
- **Vidéos déjà lancées** : la règle de cadrage est figée dans la vidéo à sa création (`brief_json.framingRules`). Les vidéos lancées avant gardent leurs prompts et leurs juges, sauf deux points qui s’appliquent à toutes : le badge cité par le juge de l’image clé, et la phrase du lieu reformulée.
- **Coût** : aucun appel nouveau. Le juge du clip tournait déjà sur les trois niveaux. Un refus déclenche la boucle existante : 2 corrections du réalisateur pour l’image clé, 1 relance pour le clip, puis décision humaine. Les règles rendent seulement ce maximum plus fréquent ; il est déjà réservé au lancement, et le prix client ne change pas.
- **Surcoût maximal par plan** (toutes les corrections automatiques consommées, juge compté à sa réservation de 0,10 USD ; coût réel mesuré ≈ 0,04 USD) :

  | Niveau | Image clé (2 corrections) | Clip (1 relance) | Total par plan |
  |---|---|---|---|
  | Standard (Wan, 5 s) | 0,46 USD | 0,60 USD | **1,06 USD** |
  | Pro (Kling, 5 s ; 15 s) | 0,46 USD | 0,66 USD ; 1,78 USD | **1,12 USD ; 2,24 USD** |
  | Premium (Seedance, 5 s, image clé 2K) | 0,54 USD | 2,47 USD | **3,01 USD** |

  Une correction d’image clé coûte : réalisateur 0,05 + image 0,08 (0,12 en 2K) + juge 0,10. Une relance de clip coûte : 5 s de vidéo (Wan 0,10, Kling 0,112, Seedance 0,473 USD/s) + juge 0,10. Une relance demandée ensuite par un humain coûte environ 0,23 USD (0,27 en Premium) de plus.
- **Ce qui n’est pas traité** :
  - **Image de fin** : son juge ne reçoit pas encore la règle de cadrage. Une image de fin refusée ne bloque jamais la vidéo : le plan est animé sans elle.
  - **Critère de cadrage non vérifié** : le cadrage demandé est un texte du réalisateur ; aucun contrôle ne vérifie qu’il correspond au type de plan (par exemple « gros plan » pour un plan héros).
  - **Tests en parallèle** : sur ce poste, la suite complète lancée avec tous les processus fait parfois dépasser à des tests d’adaptateurs fal leur délai de 5 s ; avec 4 processus, tout passe. Cela n’a pas de lien avec ce changement.

## Lieux réintégrés : contrôle des photos (2026-10-26)

- **Historique Git** : les seuls lieux ajoutés après le kit du 16/10 sont les 8 lieux du samedi 24/10 (commit `a0b41cb`). Ils sont réintégrés depuis la livraison de la matrice, en WebP de 1600 px de large, avec leurs identifiants du 24/10 (`…d212` à `…d219`). Les identifiants des 11 lieux existants ne changent pas.
- **Chaque lieu** a son moment de la journée dans sa fiche et un texte anglais pour les modèles, sans moment de la journée.
- **Plus de texte français envoyé aux modèles** : le texte français des lieux intégrés (« en plein jour », « de nuit »…) ne leur est plus jamais transmis, même en secours ; un test le vérifie.
- **Corrections après relecture des photos** :
  - la « Route rouge · virage » est une piste sinueuse qui descend, et non un virage à gauche (texte anglais et texte français corrigés) ;
  - le **showroom** montre du texte et des logos lisibles (enseigne « …INGO MOTORS », arche « NOUVEAU KIA TASMAN », logos Kia) : il est maintenant marqué « texte lisible ».
- **Texte lisible** : La Pyramide (journée, coucher, nuit), la rue urbaine (journée, coucher) et le showroom.
- **Photos sous 800 px de large** : Boulevard lagunaire · nuit (447×447), Front lagunaire · nuit, vue aérienne (399×501), Plateau et bord de mer · journée (739×415).
- **Photos sous 1280 px, au format d’origine** : Pont HKB · journée (1000×759, PNG), Route rouge · végétation tropicale (1024×678, JPEG), Plateau et lagune · nuit (1140×740, JPEG).
- **Non traité** : ces 6 photos ne sont ni agrandies (cela n’ajoute aucun détail) ni converties (les vidéos passées retrouvent leur lieu par son chemin de fichier). Il faut les remplacer par des photos d’origine plus grandes, sous un nouveau nom de fichier.
- **Autres constats sur les photos** :
  - le « Boulevard côtier · journée », la vue « Plateau et bord de mer » et les vues de nuit du front lagunaire montrent d’autres voitures ;
  - la « Route rouge · végétation tropicale » montre des deux-roues au loin ;
  - la règle « aucun autre véhicule » des prompts s’applique, mais ces photos invitent le moteur à en recopier.

## Fiche de lieu proposée par le modèle de vision et validée par l’admin (2026-10-26)

- **Constat** : un lieu ajouté à la médiathèque n’avait qu’un titre et une catégorie. Son moment de la journée était deviné d’après les mots du titre, et sa description envoyée aux modèles était « titre · catégorie ». La matrice de mouvement du matin donnait au lieu un profil prudent tant que l’admin ne le décrivait pas à la main.
- **Décision : une fiche par lieu, même schéma pour le catalogue et les lieux importés** (`src/core/motion/place-motion.ts`). Elle contient :
  - le moment de la journée (journée, lever ou coucher du soleil, nuit, intérieur) ;
  - le point de vue (route, en hauteur, aérien) ;
  - les axes de la route (la voiture suit la route, passage latéral) ;
  - les plans permis, la poussière, la vitesse maximale ;
  - une **description anglaise** de 140 caractères au plus, sans moment de la journée (refusée sinon) ;
  - un indicateur **« texte lisible »**.

  Les sens de marche ne sont pas stockés : ils se déduisent des axes de la route croisés avec la photo du véhicule. Les 19 lieux intégrés ont leur fiche dans `location-catalog.ts`, avec les descriptions anglaises relevées photo par photo le 24/10. La route rouge, qui n’avait pas de moment de la journée, est maintenant « journée ».
- **Proposition automatique, une fois par lieu** :
  - à l’ajout d’un lieu, le coût (0,10 USD au plus) est réservé dans le journal des coûts **avant** l’appel ;
  - le modèle de vision des juges lit la photo par la file d’attente fal et propose la fiche ;
  - la proposition est stockée comme « proposée » (migration `0035_place_profile_proposal.sql`, ajoutée à `supabase/setup.sql`) ;
  - la médiathèque suit la proposition toutes les 10 s ; le coût est clôturé à son montant réel, libéré si fal a échoué, facturé à la réservation au plus après 10 min sans réponse ;
  - la réponse du modèle est ramenée à une fiche cohérente : valeurs fermées seulement, description nettoyée et débarrassée des mots de moment de la journée ;
  - un lieu n’est jamais proposé deux fois ;
  - en mode simulation, la fiche est fictive et aucun appel n’est fait.
- **Validation par l’admin** :
  - la carte d’un lieu en attente affiche la fiche en champs fermés (listes, cases), modifiables ;
  - le bouton « Valider le lieu et sa fiche » valide les deux ensemble, et le serveur refuse de valider un lieu sans fiche valide ;
  - la description anglaise est en lecture seule ; l’admin peut la vider, le lieu est alors décrit par « titre · catégorie » ;
  - si la photo montre du texte lisible, un avertissement s’affiche (première cause de texte recopié dans les images).
- **Repli prudent** : un lieu validé avant cette évolution, ou sans fiche, reçoit plans héros et détails seulement, une arrivée lente au plus, pas de poussière, vitesse lente (intérieur si son nom le dit). Ce profil **remplace** le profil prudent du matin, plus permissif. Le réalisateur voit ce lieu marqué « profile: default » et la consigne « garder des plans simples ».
- **Vidéos déjà lancées** : la fiche, sa description et son moment de la journée sont figés dans la vidéo à sa création, avec la matrice. Modifier un lieu ne change aucune vidéo lancée.
- **À faire par le responsable** : coller `supabase/setup.sql` dans l’éditeur SQL de Supabase (migration 0035 ; la 0034 est déjà appliquée). Avant cela, l’ajout de lieux fonctionne sans proposition automatique : aucun coût n’est réservé et l’admin remplit la fiche à la main.
- **Ce qui n’est pas traité** :
  - **Fidélité de la description** : la description anglaise vient du modèle de vision et va dans les prompts des générateurs. Elle est bornée, nettoyée et relue par l’admin, mais aucun juge ne vérifie qu’elle décrit fidèlement la photo.
  - **Usage de « texte lisible »** : l’indicateur ne sert qu’à l’avertissement ; il ne change pas encore les prompts.
  - **Clé fal remplacée** : si la clé fal est remplacée pendant une proposition, la proposition échoue et l’admin remplit la fiche à la main.
  - **Lieux non relus** : les lieux importés avant aujourd’hui ne reçoivent pas de proposition automatique ; l’admin peut les décrire avec « Décrire ».

## Mouvement cohérent avec la photo et le lieu : matrice simple (2026-10-26)

- **Constat** : le réalisateur ne recevait qu’une consigne générale (« 3/4 avant = vers la caméra, profil = latéral, 3/4 arrière = s’éloigne ») et le lieu ne limitait aucun mouvement : rien n’empêchait un passage latéral sur le tablier d’un pont, une vitesse soutenue sur une piste rouge ou un showroom importé « Showroom · nuit » traité comme une rue de nuit. Aucun juge ne contrôlait cette cohérence. Le catalogue de mouvements du samedi 24/10 avait été retiré avec le retour à la version du vendredi.
- **Ce qui est repris du 24/10** : les 8 lieux au niveau de la route (dont 2 photos du tablier du pont HKB), le retrait de « Pont HKB · approche » (la photo montre un autre pont ; il reste lisible pour les anciennes vidéos), le côté du nez des photos véhicule (« 3/4 avant · nez à gauche »…) et l’étiquetage corrigé du kit d’essai (le « profil avant » du Haval H6 est un 3/4 arrière). **Non repris** : les 12 mouvements imposés, la caméra imposée et les axes « sur la photo ».
- **Décision : une matrice fermée** (`src/core/motion/place-motion.ts`, fonctions pures et testées). Chaque lieu a un profil :
  - intérieur ou extérieur, enregistré tel quel et non plus deviné d’après le titre ;
  - point de vue : au niveau de la route, en hauteur ou aérien ;
  - sens possibles : la voiture suit la route (vers la caméra ou en s’éloignant) et/ou passe latéralement ;
  - types de plan permis, poussière possible ou non, vitesse maximale.

  Chaque photo autorise des sens de marche : 3/4 avant vers la caméra, 3/4 arrière en s’éloignant, profil latéral du côté du nez. Sans côté du nez connu, une photo garde le comportement d’avant. Exemples : sur le tablier du pont, la voiture suit le tablier, jamais en passage latéral ; la piste rouge permet la poussière à vitesse lente ; le boulevard lagunaire permet le passage latéral ; le showroom reste immobile ; une vue aérienne ne permet que le plan d’ensemble.
- **Où vivent les profils** : dans le code (`location-catalog.ts`) pour les 19 lieux intégrés ; dans la colonne `assets.place_profile` (migration `0034_place_profile.sql`, ajoutée à `supabase/setup.sql`) pour les lieux importés. L’admin les décrit dans la médiathèque (bouton « Décrire » sur la carte du lieu). Un lieu non décrit reçoit un **profil prudent** : il n’est pas refusé (route au niveau du sol, la voiture suit la route, vitesse normale, pas de poussière ; intérieur si son nom le dit).
- **Ce que vérifie chaque étape** :
  - **Réalisateur** : il reçoit, pour chaque lieu et chaque photo, la liste des combinaisons permises. Une réponse hors matrice (sens, type de plan, vitesse, poussière dans le texte) est refusée et déclenche sa tentative corrigée, comme pour le showroom.
  - **Correction d’un plan refusé** : sa correction ne peut pas sortir de la matrice ; si elle en sort, le plan garde son mouvement validé.
  - **Création de la vidéo** : un storyboard modifié dans le Studio est ramené dans la matrice, comme le showroom est ramené à l’arrêt.
  - **Image clé** : elle décrit l’orientation de la voiture par rapport à la route du lieu (« dans sa voie, le long de la route ; sur un pont, le long du tablier »), et non plus par rapport au cadre.
  - **Juges** : celui de l’image clé et celui de l’image de fin refusent une voiture en biais, contre l’axe ou hors de la route. Celui du clip refuse une trajectoire qui sort de la route ou change d’axe.
- **Détection du showroom corrigée** : l’intérieur est testé avant la nuit ; il est surtout enregistré explicitement dans le profil. Les lieux « coucher de soleil » reçoivent une lumière basse et chaude au lieu de la lumière du brief.
- **Longueur des prompts** : la règle d’axe remplace l’ancienne phrase « la voiture pointe le long de sa voie ». Au pire cas, la scène du plan peut maintenant être supprimée en dernier recours ; l’action et le cadrage décrivent toujours le plan. Le pire cas tient pour chaque mouvement et chaque type de plan (test ajouté).
- **Vidéos déjà lancées** : la matrice est figée dans la vidéo à sa création (`brief_json.motionMatrix`). Une vidéo qui ne l’a pas garde exactement ses prompts, ses juges et ses corrections (test ajouté).
- **À faire par le responsable** :
  1. Coller `supabase/setup.sql` dans l’éditeur SQL de Supabase (migration 0034). Avant, tout fonctionne avec le profil prudent, mais l’enregistrement d’un profil de lieu affiche un message clair.
  2. Relancer l’import dans l’espace Admin, onglet « Kit d’essai », pour que les photos du kit prennent leur côté du nez.
  3. Décrire les lieux importés.
- **Ce qui n’est pas traité** :
  - **Erreur de saisie** : un profil de lieu ou un côté du nez mal saisi n’est contrôlé par personne ; les juges n’en verront que les effets.
  - **Poussière** : la règle « pas de poussière » est vérifiée sur le texte du réalisateur, mais aucun juge ne refuse un nuage de poussière sur une route goudronnée.
  - **Côté de la voiture** : aucun juge ne vérifie que l’image montre bien la voiture du côté de sa photo. Une voiture retournée en miroir n’est repérée qu’indirectement, par le juge du volant.
  - **Mouvements absents** : les virages et la continuité du lieu d’un plan à l’autre ne sont pas dans la matrice.

## Côté de circulation et volant de la marque, même sans personne à bord (2026-10-26)

- **Constat** : le réglage `brands.traffic_side` (« à droite » pour RIMCO, migration 0031) existait mais n’était lu nulle part : rien ne demandait aux moteurs de faire rouler la voiture du bon côté de la route. La règle du volant (à gauche) n’était envoyée que si une personne était visible : une voiture vide pouvait avoir son volant à droite. Le réalisateur ne connaissait aucune des deux règles.
- **Décision** :
  - **Réglage de la marque** : le côté de circulation est lu avec les autres réglages (`src/core/brand-market.ts`) et figé dans la vidéo à sa création (`brief_json.trafficSide`), comme la ville et le côté du volant. Rien n’est écrit en dur : une autre marque peut avoir d’autres valeurs.
  - **Règle écrite une seule fois** (`src/core/prompts/rules.ts`) : « la voiture reste dans la voie de droite de **son propre sens** de circulation (sa droite, pas celle de l’image) ; les véhicules en face passent à sa gauche ». Elle parle de la voie de la voiture et non de la gauche ou de la droite de l’image. C’est important pour une voiture qui vient vers la caméra : en circulation à droite, elle apparaît dans la moitié gauche de l’image, et c’est correct (cas testé).
  - **Où elle s’applique** : image clé, image de fin et animation des plans en mouvement. Un plan à l’arrêt ou en showroom ne la reçoit pas. Elle s’applique aussi au réalisateur (bloc MOTION) et au réalisateur qui corrige un plan refusé.
  - **Volant** : tous les plans reçoivent désormais la règle du volant. Dans une voiture vide, elle devient « le volant, visible à travers le pare-brise, est à gauche ».
  - **Contrôles** : le juge de l’image clé, celui de l’image de fin et celui du clip classent **bloquant** un volant du mauvais côté, que quelqu’un soit à bord ou non, ainsi qu’une voiture qui roule dans la voie du mauvais côté. Sur l’image clé, un refus renvoie le plan au réalisateur (boucle du 25/10) avant tout paiement de clip.
- **Longueur des prompts** : en mesurant le pire cas réel (éclairage de 160 caractères, description des personnes de 400, deux photos de casting), le prompt d’image clé dépassait **déjà** la limite de 2 200 caractères avant ce changement, jusqu’à 2 223. La génération aurait été refusée avec un message d’erreur. Pour faire de la place sans couper aucune règle :
  - la règle de circulation a été raccourcie ;
  - le texte d’éclairage peut maintenant être raccourci (« la voiture est éclairée comme le lieu » reste intact) ;
  - l’action, le cadrage et la caméra peuvent être raccourcis un peu plus.

  Le pire cas tient maintenant pour chaque mouvement et chaque type de plan : au plus 2 200 caractères pour l’image, 2 000 pour la vidéo (test ajouté). Ces raccourcis ne jouent que sur des plans exceptionnellement longs.
- **Vidéos déjà lancées** : celles qui n’ont pas `trafficSide` dans leur brief, c’est-à-dire toutes celles créées avant cette mise en ligne, gardent exactement leurs prompts et leurs contrôles : pas de règle de circulation, et la règle du volant seulement si une personne est visible (test ajouté).
- **Aucune migration** : la colonne existe déjà (0031) avec « droite » par défaut ; `supabase/setup.sql` est inchangé.
- **Ce qui n’est pas traité** :
  - **Contrôle chez le réalisateur** : son texte n’est pas vérifié par le code, car ses plans n’ont pas de champ « voie » à contrôler. Le respect de la règle n’est vérifié qu’en aval, par le juge de l’image clé (payant, environ 0,04 à 0,10 USD par contrôle).
  - **Voiture garée** : une voiture à l’arrêt garée du mauvais côté de la rue n’est pas contrôlée. La règle de circulation ne vise que les plans en mouvement.
  - **Réglage dans l’espace Admin** : le côté de circulation et le côté du volant ne sont pas encore modifiables dans l’espace Admin. Ils se changent dans la table `brands` depuis Supabase.
  - **Éclairage saisi** : le texte d’éclairage saisi dans le Studio va toujours directement dans le prompt d’image clé, sans passer par le réalisateur. C’est un point existant, signalé ici et non corrigé.

## Images clés Premium en 2K (2026-10-26)

- **Demande du responsable** : remettre la résolution 2K du Premium (étape 4 du 24/10), sans le reste de cette étape.
- **Ce qui change** : en Premium, Nano Banana 2 produit les images clés (et les images de fin) en 2K au lieu de 1K. C’est la base de chaque plan : badges, calandre et jantes plus nets avant l’animation. Standard et Pro restent en 1K.
- **Coût à cette date** : 0,12 USD par image au lieu de 0,08 (page fal du 24/10 : « 2K … 1.5 times the standard rate »), soit +0,16 USD par vidéo Premium de 4 plans, jusqu’à +0,48 USD avec les 2 corrections par plan de la boucle. Le prix client suivait la grille Premium de l’époque, remplacée par la décision du 27/10.
- **Coûts justes** : la résolution et son prix sont figés dans `brief_json.renderSettings` au lancement (`src/core/versions/render-settings.ts`) et relus pour chaque image, réservation, facturation et relance humaine. Les versions créées avant restent en 1K à 0,08 USD.
- **Non repris** : clips Seedance en 1080p (+13,80 USD par vidéo, au-dessus du prix de vente ; disponibilité à confirmer chez fal) et juges plus stricts en Premium.

## Boucle de vérification : réalisateur, deux vérificateurs, décision humaine (2026-10-25)

Architecture visée par le responsable : brief → réalisateur (découpage) → images clés (Nano Banana) → **vérificateur** (porte les contraintes ; si le script ou une image a un souci, retour au réalisateur) → choix du modèle → plans vidéo → montage. Décisions du responsable : **2 corrections au plus** par plan ; plan encore refusé = **pause pour décision humaine** ; orchestrateur **automatique par plan dans le niveau choisi** (étape suivante, non livrée ici).

- **Vérificateur 1, script** (gratuit) : les règles fixes existantes sur la réponse du réalisateur (durées, lieux, photos autorisées) ; une réponse invalide déclenche sa tentative corrigée.
- **Vérificateur 1, images clés** : le juge de vision existant rend un verdict ; la décision est dans `src/core/verification/loop.ts` (fonctions pures, testées). Image refusée → statut `revising` : le **réalisateur réécrit ce seul plan** à partir des défauts (scène, cadrage, caméra, action, sens et vitesse), sans jamais toucher au véhicule, au lieu, à la durée, aux personnes ni au titre (`applyShotRevision`). Nouvelle image, nouveau contrôle. Au plus 2 corrections ; ensuite statut `awaiting_review`. Texte lisible seul : une nouvelle image « enseignes vierges » sans appel au réalisateur, puis avertissement (inchangé).
- **Le réalisateur passe par la file d’attente fal** (`fal-shot-revision.ts`), comme les contrôles : la route de suivi (60 s) n’attend jamais un modèle de langage. Sans réponse valide après 10 min, ou en cas d’échec, l’image est relancée avec les seuls défauts (comportement d’avant) : la boucle ne se bloque pas.
- **Vérificateur 2, clips** : relance du seul plan raté une fois (inchangé) ; un clip encore refusé passe en `awaiting_review` au lieu d’être monté avec un avertissement. **Le montage ne prend que des plans acceptés** (par le vérificateur ou par un humain).
- **Contrôle illisible** (le juge a répondu et a été payé mais son verdict ne se lit pas) : ce n’est plus une acceptation avec avertissement, le plan attend une décision humaine.
- **Décision humaine** : panneau « Décision requise » dans le Studio et la file de génération, avec l’image ou le clip refusé et ses défauts. « Accepter ce plan » (avertissement conservé pour le valideur), « Relancer avec le réalisateur » (image clé seulement, ≈ 0,15 $ réservés à ce moment), « Annuler la vidéo » (annulation existante, réservations libérées). Route `POST /api/versions/[id]/shots/[shot]/review`, logique dans `src/core/versions/shot-review.ts`. Rien ne s’anime ni ne se monte pendant la pause, et aucun appel n’est fait.
- **Coûts** : 3 images et 3 contrôles réservés par plan au lancement (au lieu de 2) ; les réservations non utilisées sont libérées dès qu’une image est acceptée. Chaque correction du réalisateur est réservée (0,05 $) puis clôturée à son coût réel, sur la même ligne de journal que le storyboard (`kind = generation`, sans modèle vidéo, non facturée au client). Les vérificateurs, eux, **sont facturés par fal** (juge de vision ≈ 0,04 à 0,10 $ par contrôle) : ils ne sont pas gratuits, contrairement à ce qu’indiquait l’analyse ChatGPT.
- **Historique** : chaque contrôle, correction et décision humaine est conservé par plan dans `video_shots.verification_history` (20 derniers), pour mesurer le coût réel par plan accepté (protocole de test avant de revoir les prix).
- **Migration `0033_verification_loop.sql`** (ajoutée à `supabase/setup.sql`) : nouveaux statuts `revising` et `awaiting_review`, jusqu’à 6 tentatives d’image clé (2 automatiques + relances humaines), colonnes `revised_draft`, `revision_request_id`, `revision_ledger_id`, `verification_history`. Le numéro 0032 est laissé libre (utilisé par la version du samedi pour la géométrie des lieux). **À appliquer avant la mise en ligne de ce code**, sinon les plans refusés ne peuvent pas changer de statut.
- **`QUALITY_GATE_MODE` supprimée** : la boucle remplace les modes `warn` et `block`. La variable peut être retirée de Vercel.
- **Vidéos lancées avant** : 2 tentatives réservées, donc une seule correction (`keyframeCorrectionsAllowed`), puis décision humaine.
- **Non livré** : l’orchestrateur qui choisit le moteur par plan (il faut d’abord décider quels moteurs chaque niveau peut utiliser, et à quel prix) ; la relance d’un clip refusé depuis le panneau (un clip coûte 0,50 à 2,40 $) ; la continuité du lieu d’un plan à l’autre (image « ancre » du samedi).

## Cadre fidèle au lieu, sur la version du vendredi 23/10 (2026-10-25)

Le responsable est revenu à la version du vendredi 23/10, puis a demandé de remettre ce qui garde le décor en Côte d’Ivoire (« pour ne pas se retrouver dans un cadre hors Côte d’Ivoire »), sans le catalogue de mouvements du samedi. Les règles du samedi dépendaient de ce catalogue : elles sont réécrites en version allégée.

- **Ville de la marque** : la consigne du réalisateur lit `brands.market_location` (migration `0031_brand_driving_and_market.sql`, identique à celle du samedi pour que la base reste cohérente si elle a déjà été appliquée ; ajoutée à `supabase/setup.sql`). « Côte d’Ivoire » n’est plus écrit en dur. Avant la migration, la vidéo est faite sans nom de ville ni règle de volant (avertissement `brand_settings_unavailable`), les lieux sélectionnés suffisent à l’ancrer. La colonne `traffic_side` de la même migration n’est pas encore utilisée.
- **Showroom immobile** (demande du responsable ; essai Pro du 24/10 : voiture qui « entre » dans le showroom et flotte au-dessus d’un podium). Dans un lieu intérieur (`placeTimeOfDay` = `interior`), un plan est un plan héros ou un détail, voiture à l’arrêt (`travelDirection` = `static`). Le réalisateur en est informé ; une réponse qui fait rouler la voiture en intérieur est invalide et corrigée (`interiorShotIssue`). Côté serveur, `holdStillInInterior` force à l’arrêt tout plan de showroom à la création et après chaque correction de la boucle. Les prompts d’image clé et d’animation ajoutent « la voiture reste posée au sol, n’entre ni ne sort, seule la caméra bouge » (bloc verrouillé) ; les juges de l’image clé et du clip classent bloquants une voiture qui flotte, qui roule ou dont les roues tournent. Les lieux intérieurs sont figés dans `brief_json.interiorPlaceIds`.
- **Conducteur** (oubli signalé par le responsable) : le choix « Personnage » du Studio est repris du samedi (`src/core/people-presets.ts` : Aucun, Conducteur ou conductrice, Conducteur et passager, Conducteur près de la voiture à l’arrêt). Sans photo de casting, le réalisateur doit alors écrire la fiche de la personne, sinon sa réponse est invalide et corrigée. Dès qu’une personne est visible, le volant et le conducteur sont du côté de `brands.steering_side` (gauche pour RIMCO), figé dans `brief_json.steeringSide` ; quand la voiture roule, le conducteur regarde la route. Les juges de l’image clé, de l’image de fin et du clip classent un volant du mauvais côté ou un conducteur tourné bloquant.
- **Lieu obligatoire** : le Studio, la route du réalisateur et la création de la version refusent un plan sans lieu sélectionné ; une réponse du réalisateur sans `locationPhotoId` déclenche sa tentative corrigée.
- **Description du lieu** (160 caractères au plus, `placeDescription`) donnée au réalisateur puis figée par plan dans `brief_json.placeDescriptions`, avec la ville dans `brief_json.marketLocation`.
- **Conformité au lieu** : image clé (première et reprise), animation et image de fin reçoivent « tout ce que la caméra révèle appartient à ce même lieu ; rien d’une autre ville ou d’un autre pays ». Bloc raccourcissable : les plafonds de longueur restent garantis (test au pire cas).
- **Juges** : sur l’image clé comme sur le clip, une rue, un bâtiment ou un tracé d’une autre ville ou d’un autre pays est bloquant. Sur l’image clé, cela déclenche la reprise à 0,08 USD au lieu de payer un clip.
- **Non repris** : la continuité du lieu d’un plan à l’autre (image clé « ancre », étape 3b du samedi). Elle modifie l’ordre de lancement des images clés et sera reprise avec la boucle de vérification, qui change ce même enchaînement.
- **Vidéos créées avant** : sans `placeDescriptions`, les prompts restent ceux d’avant.

## Juge coupé et version échouée facturée (2026-10-24, essai A)

- **Constat** : version `122cde4e` en échec mais facturée 10 500 FCFA. Les plans 2 et 4 n’avaient pas été rejetés par le juge : sa réponse était coupée au milieu du JSON (`completion_tokens` = 1 500 = `max_tokens`). Le modèle de vision raisonne obligatoirement avant de répondre, et les vérifications ajoutées (route, lieu, cadrage) ont consommé tout le budget. Le verdict illisible était traité comme un échec, alors que le juge approuvait le plan 4.
- **Budget du juge** : `VISION_MAX_OUTPUT_TOKENS` = 4 000 au lieu de 1 500 ; réserve d’un contrôle relevée de 0,05 à 0,10 USD (0,039 USD mesuré pour 1 500 jetons, environ 0,10 USD au pire avec 4 000).
- **Verdict illisible** : en mode « warn » (par défaut), si le juge a bien répondu (et a été payé) mais que son verdict est illisible, l’image-clé ou le clip est gardé avec l’avertissement « Contrôle automatique illisible : vérifier ce plan à l’œil », visible sur la page « À valider ». La vidéo n’échoue plus après que ses clips ont été payés. Sans réponse confirmée de fal, le comportement prudent (réconciliation) est inchangé. Les erreurs du juge vidéo sont maintenant journalisées (`video_quality_failed`).
- **Facturation** : les coûts étaient clôturés avant de savoir si la vidéo serait assemblée. Une version qui n’est pas assemblée garde désormais son coût réel au journal, avec un prix client de 0 ; un échec définitif du montage remet aussi le prix client à 0. Défaut antérieur à aujourd’hui, révélé par le premier échec à ce stade.
- **Donnée DEV à corriger à la main** (aucune écriture distante par l’agent) : ligne `usage_ledger` `a4b01b94-d8e1-4015-ba4d-f1cffbff9d7d`, prix client à remettre à 0.

## Patch qualité v3.2 : règles rationalisées et prompts plafonnés (2026-10-22)

- **Base** : appliqué sur la branche `qualite-v3` (v3 + v3.1 + correctifs des essais du 22/10, voir l’entrée suivante). Les correctifs de l’équipe sont conservés : rejet 400/422 sans réconciliation, plan en échec qui ne bloque plus la version, avertissements sur la page « À valider », chemin FFmpeg Windows. L’ajustement Kling de l’équipe (`ANIMATION_PROMPT_MAX_LENGTH`, paramètre `maxLength`) est gardé comme limite propre au moteur, sous le plafond commun de 2 000 caractères.
- **Conduite normale** (essai : drift sur une route de ville en début de vidéo) : les plans en mouvement reçoivent une consigne de conduite calme (dans sa voie, vitesse constante, ni drift, ni dérapage, ni virage brusque) ; l’image-clé aligne la voiture sur sa voie dans son sens de marche, car une voiture posée de biais oblige le moteur vidéo à la faire pivoter ; le réalisateur garde « slow » ou « cruise » en ville et choisit un sens cohérent avec l’angle de la photo (3/4 avant = vers la caméra, profil = latéral, 3/4 arrière = s’éloigne). Le juge vidéo classe drift et dérapage comme bloquants.
- **Personnes dans la voiture qui roule** (essai : un personnage marche à côté de la voiture en mouvement) : dans un plan en mouvement, les personnes sont assises dans la voiture (conducteur au volant) ; elles ne sont dehors que dans un plan où la voiture est arrêtée. Règle donnée au réalisateur, aux prompts image et vidéo, et au juge (bloquant).
- **Plan héros** : « à l’arrêt » veut dire immobile pendant tout le plan ; une voiture qui arrive puis s’arrête reçoit son sens de marche, une vitesse lente et une consigne d’arrêt en douceur (essai : prompt contradictoire « les roues ne tournent pas » + « elle arrive »).
- **Juge plus strict sur l’identité** : un badge, une calandre, un feu ou une jante dont le dessin ou la couleur change est un défaut bloquant (essai : badge passé du gris au rouge, classé « mineur »).

- **Bug corrigé** : Kling O3 Pro refusait l’animation (`body.prompt: String should have at most 2500 characters`). Le prompt d’animation du v3.1 dépassait 2 500 caractères dès que l’action et la caméra du réalisateur étaient longues. Les prompts sont maintenant assemblés par blocs (`src/core/prompts/rules.ts`, `fitPrompt`) avec un plafond garanti : 2 000 caractères pour un moteur vidéo, 2 200 pour une image. En cas de dépassement, l’ambiance puis le retour du juge puis les champs du réalisateur sont raccourcis ; la fidélité, le zéro texte et les personnes ne sont jamais coupés. Mesures : animation 956 caractères en usage courant, 2 000 au pire cas ; image-clé 1 190 / 2 193 ; réalisateur Premium 3 272 (contre 8 225), envoyé au modèle de langage, sans limite de 2 500.
- **Rationalisation** (audit du 22/10, 93 règles ramenées à 34) : chaque consigne commune est écrite une seule fois ; le réalisateur ne reçoit plus les défauts d’image ; un seul constructeur de prompt réalisateur pour tous les niveaux ; champs du réalisateur plus courts (titre 60, scène 120, cadrage 80, lieu 100, action 160, caméra 120 caractères annoncés).
- **Palette 90 % bleu retirée des prompts IA** (décision du 22/10) : elle teintait toutes les scènes et contredisait la lumière réelle des lieux. La charte reste sur la carte de fin et dans l’étalonnage commun du montage.
- **Personnes** : présentes seulement avec un casting ou si le réalisateur a écrit une fiche (`castDescription`), ce qu’il fait quand le brief le demande. La détection par mots-clés ne sert plus qu’aux vidéos lancées avant le v3.2 (`brief_json.promptRules`). Les puces « Personnage » du Studio sont retirées.
- **Durées Pro** : vérifiées, plus recalculées en silence ; une erreur déclenche la nouvelle tentative corrigée du réalisateur.
- **Limite héritée retirée** : le réalisateur voit toutes les photos et lieux sélectionnés (la limite de 4 photos en Pro venait des anciens moteurs reference-to-video).
- **Tarif non revérifié** : ne bloque plus le lancement ; avertissement au-delà de 30 jours (log `pricing_unverified`, `brief_json.pricingWarning`). Résout aussi le blocage Pro relevé aux essais (fiche reference-to-video non datée alors qu’elle ne sert pas à générer).
- **Musique** : l’API accepte la piste validée pour les storyboards ; sélecteur « Musique » dans le Studio.
- **Supprimé** : parcours Premium 10 s, `shotToPrompt`, réglage de complexité envoyé par le Studio.
- Inchangés : rythme Premium 4 × 5 s (après le test moteur), 720p des moteurs, parcours « fidélité photo » caché. Le nettoyage du code mort restant (ancien parcours clip unique) fera l’objet d’un patch séparé.
## Correctifs après les essais réels du 22/10 (voir docs/ESSAIS-2026-10-22.md)

- **Prompt Kling limité à 2 500 caractères** : fal refuse au-delà (422). Le prompt d'animation est ajusté à la limite du moteur (`ANIMATION_PROMPT_MAX_LENGTH`) : versions courtes des consignes, puis retrait des phrases facultatives (humeur, lumière, étalonnage, enseignes), puis coupe en dernier recours. Wan et Seedance, sans limite documentée, gardent le prompt complet. Évolution prévue : raccourcir les consignes à la source plutôt que d'empiler des phrases.
- **Rejet 400/422 de fal pendant le suivi** : plus de réconciliation manuelle, car rien n'a été généré ni facturé. Les autres erreurs terminales (401, 403, 404, réseau, 5xx) la gardent.
- **Plan en échec** : son contrôle qualité n'est plus attendu, la version passe en échec au lieu de rester « en génération ».

## Patch qualité v3.1 : contrôle non bloquant, contact pneu-route (2026-10-22)

- **Écart temporaire à l’architecture cible, assumé.** La cible veut une image-clé validée avant toute vidéo. Après les premiers essais du v3 (« Image-clé refusée après une reprise : lettres lisibles sur la façade… », « … roue de secours absente ; disposition du lieu différente ; panneau publicitaire »), le responsable a demandé que la vidéo soit générée même si l’image-clé n’est pas parfaite, en attendant une orchestration de vérification. Nouvelle variable `QUALITY_GATE_MODE` : `warn` (défaut) garde une image-clé ou un clip encore refusé après sa reprise automatique, avec ses défauts en avertissements ; `block` rétablit l’échec du plan. Le contrôle et la reprise restent actifs ; le valideur RIMCO reste la barrière finale. Les échecs techniques (fal sans réponse, réponse illisible du juge) restent bloquants car le coût est incertain. Coût accepté : un clip peut être payé sur une image-clé défectueuse.
- **Texte** : un texte lisible ne justifie plus un refus. Le juge le signale dans un champ séparé (`readableText`). Image-clé : une reprise avec la consigne « enseignes vierges », puis avertissement. Clip : aucune relance payante pour du texte seul. Les prompts demandent toujours des enseignes vierges.
- **Juge du lieu recalibré** : l’image-clé replace la voiture selon le point de vue du plan ; un autre angle du même lieu n’est plus un défaut. Seul un lieu manifestement différent l’est.
- **Contact pneu-route** (remarque du DG, analyse du 22/10) : les prompts imposent ombre de contact, pneus écrasés au sol, poids, inertie et suspension sans oscillation artificielle, et un flou et un défilement à la même vitesse ; le réalisateur évite les personnes appuyées sur la carrosserie.
- **Juge vidéo** : il tourne désormais sur tous les niveaux (la vidéo analysée était en Standard et n’avait pas été contrôlée). Il reçoit 5 images réparties sur tout le clip et 2 gros plans de la zone roues-route, et chaque défaut est daté et classé (`blocking` ou `minor`). Seuls les défauts bloquants déclenchent la relance ; les mineurs deviennent des avertissements. Réservation : 2 contrôles par plan à 0,05 USD (indicatif) et une relance éventuelle du clip, sur tous les niveaux.
- **Avertissements** : enregistrés dans `video_shots.keyframe_quality` / `video_quality` (jsonb, `warning: true`, sans migration) et figés dans `brief_json.qualityWarnings` avant le montage ; affichés dans le Studio et sur la page « À valider » (badge sur la carte, détail par plan dans l’aperçu, confirmation demandée avant d’approuver une vidéo signalée). Choix du responsable (22/10) : rester en `warn`, y compris en production.
- **Consigne roues** : « The SUV has real weight » remplacé par « The vehicle has real weight », la gamme comprenant aussi des berlines et des camions.
- Hors périmètre : contrôles mesurables image par image (suivi des roues, flux optique) ; ils demandent un worker hors Vercel, donc la décision sur l’orchestration.

## Patch qualité v3 : casting, mouvement, texte dans les décors (2026-10-22)

- **Kling (niveau Pro)** : l’animation des images-clés envoyait `start_image_url`, alors que la fiche fal de `fal-ai/kling-video/o3/pro/image-to-video` documente `image_url` (déjà utilisé par `fal-kling.ts`). Corrigé. À confirmer par une génération Pro réelle.
- **Casting (personnages constants)** : nouveau type de média `character` (« Casting ») dans la médiathèque, validé par l’admin comme les autres photos. Une photo par personne ; ne valider qu’avec une cession de droit à l’image. Le Studio permet d’en choisir 0 à 2. Le réalisateur indique pour chaque plan qui apparaît (`castIds`) ; les mêmes personnes restent du début à la fin sauf demande explicite du brief. Un plan sans personne garde le véhicule inoccupé. Les photos de casting sont envoyées comme références à l’image-clé (après les vues du véhicule, avant le lieu ; 6 références au maximum) et les juges vérifient visage, coiffure et tenue. Sans casting, le réalisateur écrit une fiche texte (`castDescription`) recopiée à l’identique dans chaque prompt. Migration `0030_casting_and_end_keyframes.sql` (ajoutée à `setup.sql`).
- **Mouvement** : le storyboard porte le sens (`travelDirection`) et la vitesse (`travelSpeed`) de chaque plan, lus avec tolérance. Le réalisateur respecte la règle des 180° et privilégie les plans où le déplacement se lit par rapport au sol (passage devant caméra, approche, départ) ; un seul travelling latéral à vitesse égale au plus, car c’est la configuration du « tapis roulant ». Le prompt d’animation décrit positivement la physique des roues et des repères fixes du décor ; le juge vidéo (Premium) refuse une voiture qui reste sur place pendant que le décor défile.
- **Texte dans les décors** : les prompts demandent des enseignes, panneaux et vitrines vierges, et les juges refusent tout texte lisible, y compris recopié de la photo du lieu ; seuls les badges du véhicule visibles sur ses photos sont admis. Les photos de lieux ne sont pas retouchées.
- **Cadence du montage** : le montage lit la cadence de chaque clip (`ffmpeg -i`) et garde la cadence dominante (24, 25 ou 30 i/s) au lieu de forcer 24 i/s, ce qui supprimait une image sur cinq des clips en 30 i/s. Mesure locale, 1 cœur : 22 s en 1080p et 30 i/s encodées en 13 s, pour une limite de 45 s.
- **Image de fin (test A/B)** : avec `KEYFRAME_END_FRAME_ROLLING=true` dans Vercel, chaque plan roulant reçoit une image de fin (même plan, voiture plus loin dans son sens de marche), contrôlée par le juge puis envoyée au moteur en `end_image_url` (paramètre documenté par Wan 3.0, Kling O3 Pro et Seedance 2.5 image-to-video). Coût réservé avant l’appel : 0,08 USD d’image et 0,05 USD de contrôle par plan roulant, ajoutés au coût nominal. Un échec ne bloque jamais la vidéo : le plan est alors animé sans image de fin. Désactivé par défaut.
- **Montage en échec** : l’erreur est maintenant journalisée (`montage_failed`) et comptée dans `brief_json.montageAttempts`. Après 3 échecs, la version passe en `failed` avec un message clair. Les clips restent stockés : un admin peut relancer le montage sans coût fal en repassant la version en `postprocessing` et en remettant le compteur à zéro, sinon une seule tentative est accordée : `update public.video_versions set status = 'postprocessing', error_message = null, brief_json = brief_json - 'montageAttempts', updated_at = now() - interval '2 minutes' where id = '…';`
- Hors périmètre de ce patch : écran de validation du storyboard, 2 relances par plan, rythme (R3), concept (R1), réalisateur qui voit les photos (R4), musique dans le Studio, juge vidéo hors Premium.

## Corrections après le test vidéo de 10 secondes (2026-10-19)

- Le brief d’essai de 576 caractères était refusé par la limite API de 500 caractères et l’interface limitait la saisie à 240. Les deux utilisent maintenant une limite partagée de 1 000 caractères. Les erreurs de validation distinguent une description trop longue d’options invalides; les champs client inconnus sont ignorés pour rester tolérant aux versions d’interface en cache.
- Le premier essai avec un brief court a atteint fal, puis `openrouter/router` a répondu `Bad Request`. La route storyboard construisait son payload directement et omettait `reasoning: true`, alors que le modèle Claude Sonnet 5.5 configuré dans Vercel le requiert selon le réglage du projet. La route réutilise maintenant `buildFalLlmInput`, qui inclut ce paramètre et est couvert par un test. À confirmer par une génération réelle après déploiement.

## Remplacement sécurisé du compte Fal (2026-10-18)

- L’admin peut remplacer la clé Fal depuis Administration → Connexion Fal. La clé est chiffrée avec AES-256-GCM avant stockage dans `fal_provider_credentials`; seul le rôle `service_role` peut lire cette table. Les réponses API ne renvoient que l’état configuré, la source et la date de mise à jour.
- Avant l’enregistrement, configurer `FAL_CREDENTIALS_ENCRYPTION_KEY` (32 octets en Base64) dans les variables Vercel des environnements concernés puis redéployer. Une clé aléatoire peut être créée avec un gestionnaire de mots de passe prenant en charge les secrets aléatoires Base64. Conserver cette clé en lieu sûr : la perdre rend les clés Fal enregistrées indéchiffrables.
- Chaque nouvelle version enregistre l’identifiant de la clé active juste avant sa création. Les générations en cours réutilisent cette clé pour le polling et l’annulation. Les anciennes versions sans identifiant continuent d’utiliser `FAL_KEY`; conserver cette variable tant que ces générations ne sont pas terminées. Les anciennes clés enregistrées sont retirées lors de la clôture d’une génération, quand aucune autre génération active ne les référence.
- La même clé active sert aux appels vidéo, aux téléversements de références et aux appels LLM Fal. Enregistrer une clé ne fait aucun appel payant ni test d’authentification; Fal vérifiera la clé au prochain lancement. Higgsfield/XField n’est pas inclus.
- Migration `0023_fal_credentials.sql` ajoutée à `supabase/setup.sql`. Elle doit être appliquée par le responsable dans l’éditeur SQL Supabase avant d’enregistrer une nouvelle clé; aucune migration distante n’est lancée depuis le dépôt.

- Mise à jour du 16 octobre 2026 : le template Rimco-Studio_Template-Prompt.docx devient la référence créative commune des générations vidéo. Le Studio retire le choix d’intention et applique systématiquement sa direction publicitaire premium, la fidélité stricte aux photos validées, les lieux choisis, le format demandé et les garde-fous de réalisme; aucun storyboard de validation ni appel LLM préparatoire n’est ajouté. Standard route toujours vers Wan Reference-to-Video, Pro vers Kling O3 Reference-to-Video et Premium vers Seedance Reference-to-Video. Les plans et leurs références sont déterminés par les choix utilisateur, indépendamment du niveau. Les durées 5/10/15/20 désignent le métrage généré; le routage répartit les clips selon les limites et durées autorisées de chaque endpoint, l’estimation couvre la durée complète, puis le montage ajoute 2 s pour le logo animé (7/12/17/22 s finales). Les formats 16:9, 9:16 et 1:1 sont proposés quand ils sont autorisés par le modèle. La validation humaine de séquence et de frames clés proposée dans le document reste écartée du parcours direct.
- Mise à jour du 16 octobre 2026 : le Studio simple et le workflow multi-plans chargent maintenant la même galerie de lieux photographiques approuvés depuis la médiathèque. En mode simple, on peut choisir un lieu comme référence visuelle; en multi-plans, on peut en sélectionner plusieurs pour le storyboard IA. Quand le Studio simple utilise plusieurs vues d’un véhicule ou un lieu réel, il sélectionne le modèle Reference-to-Video correspondant au niveau et envoie ces références au fournisseur. Les fiches dossier et les photos validées non classées ayant exactement les mêmes marque, modèle, couleur et variante sont regroupées sous un seul véhicule. Le serveur vérifie à nouveau que ces dossiers partagent la même identité avant d’accepter leurs images. La création et la modification des dossiers restent réservées aux admins. Cela remplace le choix de scènes synthétiques comme unique sélecteur de lieu. Aucune migration Supabase distante n’est nécessaire pour cette interface.
- Mise à jour du 16 octobre 2026 : le template de prompt confirme les garde-fous visuels déjà intégrés. Le storyboard ajoute un champ de cadrage distinct du mouvement caméra et distingue plus concrètement la présentation fidèle de la publicité premium. Les prompts de clips demandent une continuité d’exposition et d’étalonnage entre les plans, tout en respectant la lumière réelle de chaque lieu, et empêchent l’apparition de plaques lisibles. Le template propose une validation humaine de frames clés; elle n’est pas ajoutée au parcours actuel pour préserver le storyboard IA simple et éviter un coût d’image supplémentaire avant le premier comparatif vidéo.
- Mise à jour du 16 octobre 2026 : le kit « Assets test et prompt template » fourni par le responsable est intégré au parcours interne. Cinq nouveaux lieux/décors sont ajoutés à la médiathèque de référence (La Pyramide au Plateau, rue urbaine d’Abidjan, boulevard lagunaire de jour, approche du pont HKB et showroom générique), optimisés en WebP. Le storyboard demande maintenant explicitement de respecter les angles et rôles des photos validées, d’exclure les vues intérieures si aucune photo intérieure n’existe, et d’éviter les artefacts de génération vidéo relevés dans le template (morphing, roues déformées, glissement, scintillement, reflets incohérents, textes et éléments ajoutés).
- Vérification de coûts du 16 octobre 2026 sur les fiches officielles fal.ai : Wan 2.7 Reference-to-Video est à 0,10 USD/s; Kling O3 Pro Reference-to-Video à 0,112 USD/s audio désactivé; Seedance 2.5 Reference-to-Video à environ 0,473 USD/s en 720p. Selon la règle courante (durée choisie = durée des clips, puis 2 s de logo), comparer Wan + Kling coûte environ 3,18 USD pour 15 s générées (final 17 s) ou 4,24 USD pour 20 s générées (final 22 s). Exécuter les deux paliers coûte environ 7,42 USD au total, sous le plafond de campagne de 10 USD. À titre indicatif, Seedance coûterait environ 7,095 USD pour 15 s générées ou 9,46 USD pour 20 s générées; les photos de référence n’ajoutent pas de coût de génération Seedance et aucune vidéo de référence n’est fournie. Estimations hors éventuelles nouvelles tentatives; le comparatif initial reste limité à Wan et Kling. Voir [Wan 2.7 Reference-to-Video](https://fal.ai/models/fal-ai/wan/v2.7/reference-to-video), [Kling O3 Pro Reference-to-Video](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video) et [Seedance 2.5 Reference-to-Video](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video).
- Un onglet « Kit d’essai » réservé aux admins permet d’importer de façon relançable les cinq dossiers du kit (GWM Jolion, Kia Tasman, Kia Pegas, Haval H6, GWM Tank 300) et leurs quinze photos extérieures vers la médiathèque Supabase de la marque courante. Aucune image intérieure n’étant fournie, le storyboard doit rester extérieur pour ces dossiers. Les fichiers sont fournis comme assets internes; l’import réel dans Supabase intervient après le déploiement lorsque l’admin déclenche explicitement l’action. La validation d’images clés avant génération reste une évolution séparée : elle ajouterait un modèle d’image et un coût de génération distincts.

- Mise à jour du 15 octobre 2026 : ajout d’un parcours multi-clips horizontal piloté par un storyboard IA consultable et régénérable. Le dossier véhicule rassemble les photos validées intérieur/extérieur/détail, et les lieux validés sont proposés comme références réelles. Standard route vers Wan 2.7 Reference-to-Video, Pro vers Kling O3 Pro Reference-to-Video, Premium vers Seedance 2.5 Reference-to-Video. Le parcours conserve ces endpoints séparés des anciennes routes image-to-video. Chaque vidéo finale dure 15 ou 20 s, dont 2 s réservées à un écran final blanc avec le logo RIMCO animé (fondu et légère mise à l’échelle), sans texte ni audio. Les clips occupent donc respectivement 13 ou 18 s. Les migrations `0018` à `0020` élargissent le suivi des plans et activent les trois modèles de référence; elles sont maintenant appliquées à Supabase.
- Garde-fous ajoutés après revue : une réservation SQL verrouille chaque campagne avant d’accepter son budget Wan/Kling, et chaque plan conserve son tarif unitaire, son estimation et son coût constaté. Les générations live multi-clips sont bloquées si le tarif du modèle n’a pas été vérifié depuis moins de 7 jours (`ai_models.pricing_verified_at`). L’admin compare le tarif dans fal.ai puis renseigne cet horodatage dans Supabase avant les essais. Les migrations `0018`–`0020` correspondantes sont maintenant appliquées au projet RIMCO.
- Application Supabase effectuée dans l’éditeur SQL du projet RIMCO Motors (`wibsndlbrzeuvavfeyjy`, branche `main` / production) le 15 octobre 2026 : migrations 0018–0020 exécutées, puis contrôle SQL positif des tables/colonnes/fonction. Tarifs fal.ai vérifiés le même jour et enregistrés avec `pricing_verified_at` : Wan 0,10 USD/s, Kling O3 Pro sans audio 0,112 USD/s, Seedance 2.5 720p 0,473 USD/s. Le résultat du contrôle affichait les trois lignes avec leurs horodatages.
- Tarifs vérifiés dans les pages officielles fal.ai le 15 octobre 2026 : Wan 2.7 Reference-to-Video 0,10 USD/s, Kling O3 Pro sans audio 0,112 USD/s, Seedance 2.5 Reference-to-Video en 720p environ 0,473 USD/s. La page Seedance indique que le coût de génération reste identique que l’audio soit activé ou non. Les clips envoyés sont des références image uniquement, sans vidéo de référence. Voir [Wan 2.7 Reference-to-Video](https://fal.ai/models/fal-ai/wan/v2.7/reference-to-video), [Kling O3 Pro Reference-to-Video](https://fal.ai/models/fal-ai/kling-video/o3/pro/reference-to-video) et [Seedance 2.5 Reference-to-Video](https://fal.ai/models/bytedance/seedance-2.5/reference-to-video).
- La création de lieux et de dossiers véhicule est réservée à l’admin côté serveur. Le storyboard sélectionne uniquement des photos de véhicule et lieux approuvés du dossier/de la marque. La vue de storyboard ne permet pas l’édition manuelle des plans; elle propose seulement la régénération avant lancement.

- Mise à jour du 13 octobre 2026 : l'écran administrateur affiche uniquement le montant total en FCFA, calculé sur les réservations LLM + Fal combinées avec une majoration de 30 %. Le téléchargement des vidéos est limité au statut approuvé. Les notifications sont internes, visibles dans l'en-tête et dédupliquées; le webhook Fal reste désactivé jusqu'à validation dédiée. La médiathèque applique les filtres de marque/catégorie et masque les contrôles de validation aux collaborateurs. `supabase/setup.sql` se termine par une normalisation idempotente de l'état final.

- Dépôt initial vide : initialisation directe d'une application Next.js App Router avec TypeScript et mode mock par défaut.
- Périmètre V1 confirmé par le responsable : générer une vidéo, la consulter et télécharger son MP4. L’approbation des vidéos et leur édition après génération sont exclues.
- Appels réels Playground fal : Kling 2.6 Pro a renvoyé un MP4 de 5 s (0,35 USD observé); OpenRouter avec Claude Sonnet 5.5 a généré le brief pour 0,002926 USD. Claude exige `reasoning: true`; l'adaptateur l'envoie désormais. Le parcours live de l'application n'est pas encore vérifié. Détails et compteur dans `docs/FAL_VALIDATION.md`. Révoquer la clé partagée dans le chat après validation.
- Le script `supabase/setup.sql` a été exécuté avec l'accord explicite du propriétaire sur le projet `Rimco studio` (`hqgxhdekbifyranijvbq`). Table Editor confirme les tables métier, RIMCO Motors, les tarifs 460/700 FCFA/s et les quatre modèles seedés. Le raccordement officiel Supabase–Vercel a aussi été installé et limité au projet Vercel `rimcostudio`; les variables Supabase sont synchronisées en Production.
- Le package.json cible Next.js 16.2, version stable documentée par Next.js au 8 octobre 2026. Le contrôle de session utilise la convention `proxy.ts` de Next.js 16; l’autorisation par rôle doit aussi être appliquée côté serveur dans chaque route et action.
- Le dépôt GitHub `oury-hash/rimcostudio` est relié à Vercel. Les PR #1, #3, #4 et #5 sont fusionnées sur `main`; le déploiement Production de la V1 est READY. Le déploiement Preview est configuré en mode live pour un essai contrôlé. Supabase contient le schéma et le seed; le compte `oury@odk-agency.com` est confirmé. L’URL Auth par défaut pointe directement sur `https://rimcostudio.vercel.app/connexion` pour éviter la redirection de la racine protégée. Une vérification du lien a eu lieu, mais l’application n’a pas obtenu de session; un nouvel envoi a été refusé par la limite d’e-mails Auth. Les médias doivent être chargés avant la génération réelle dans l’application.
- La migration SQL protège les rôles et le journal de coûts avec RLS : seules les fonctions de réservation et de clôture sont exécutables par `service_role`; les utilisateurs ne peuvent pas écrire le journal, les traitements ni leurs rôles. Le plafond de dépense est configuré dans fal.ai, sans plafond applicatif. `setup.sql` est la concaténation des migrations et du seed; l'exécution distante reste à faire par le responsable dans l'éditeur SQL du projet.
- Un trigger verrouillé transactionnellement empêche la suppression, la désactivation ou la rétrogradation du dernier administrateur actif, y compris via une suppression en cascade du profil depuis Auth.
- Les fiches fal vérifiées pour cette version sont [Kling 2.6 Pro](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api), [Veo 3.1 Fast](https://fal.ai/models/fal-ai/veo3.1/fast/image-to-video/api), [Hailuo 2.3 Pro](https://fal.ai/models/fal-ai/minimax/hailuo-2.3/pro/image-to-video/api) et [Wan 3.0](https://fal.ai/models/alibaba/wan-3.0/image-to-video/api). Kling est Standard, 5 s exactes. Veo Premium accepte 4/6/8 s; l’adaptateur demande une source de 6 s, réserve 0,60 USD à 0,10 USD/s (audio désactivé), puis le montage local livre un MP4 final de 5 s. Un appel réel a confirmé HTTP 200, un résultat MP4 et un coût de 0,59994 USD. Son prix commercial reste celui de 5 s Premium. Wan 3.0 Test prend exactement 5 s, les ratios 16:9, 9:16 et 1:1, coupe l’audio généré et coûte 0,10 USD/s en 720p (0,50 USD/clip); aucun appel n’a été effectué. Hailuo Pro ne documente pas une durée sélectionnable et coûte 0,49 USD par clip; il reste donc inactif sans prix seconde inventé. Le prix Kling de 0,07 USD/s est à revalider avant exploitation.
- Le registre LLM fal a été vérifié : [`openrouter/router`](https://fal.ai/models/openrouter/router/api) accepte `prompt`, `system_prompt`, `model`, `reasoning`, `temperature` et `max_tokens`, et retourne `output` et `usage.cost`. Le Playground confirme Claude Sonnet 5.5; le raisonnement doit être activé pour ce modèle. L’adaptateur `src/core/providers/fal-llm.ts` requiert `LLM_MODEL`, envoie `reasoning: true`, valide et retente une fois le JSON, et protège les identifiants du véhicule. Le coût est réservé avant l'appel, y compris la marge pour une nouvelle tentative; le coût fal est rapproché, ou la réserve maximale est facturée si le fournisseur ne le renvoie pas. L'intégration live de l'application reste à valider.
- Vercel contient `LLM_MODEL=anthropic/claude-sonnet-5.5` et `LLM_MAX_COST_USD=0.05` (tous environnements), avec `FAL_KEY` comme secret. Le modèle et le plafond doivent être revérifiés par une génération Preview avant tout passage en Production. La clé fournie dans le chat doit être révoquée après cette validation et remplacée par une nouvelle clé.
- En mode live, la fin de Kling copie le MP4 brut dans le bucket privé puis lance `ffmpeg-static` dans une route Node pour superposer le logo validé de la marque, en conservant son rapport d'aspect, et mixer une piste audio facultative. Le coût fournisseur de cette étape est nul; après réussite, `usage_ledger` reçoit une ligne `postprod` de 5 secondes à coût et prix nuls. L'approbation exige le MP4 final composé. Le traitement FFmpeg est local au serveur et n'appelle pas fal.
- Le projet pnpm autorise uniquement le script d'installation de la version verrouillée de `ffmpeg-static`; pnpm 10 bloque par défaut les scripts des dépendances, ce qui laisserait l'exécutable absent et casserait la post-production. Cette liste limitée permet le téléchargement du binaire pendant l'installation sans ouvrir les scripts de toutes les dépendances. `outputFileTracingIncludes` ajoute le binaire aux fonctions Next de rafraîchissement et de cron.
- Les routes de suivi, de comparaison et de réconciliation déclarent `maxDuration = 60`, dans la limite Hobby sans Fluid Compute. Le cron traite les dix versions les plus anciennes par passage afin d'éviter une rafale non bornée de traitements FFmpeg; les suivantes sont reprises au passage quotidien suivant.
- Le plafond technique de durée Hobby ne confirme pas l'admissibilité du pilote client : la documentation Vercel réserve Hobby à un usage personnel et non commercial. RIMCO Motors étant un pilote client, vérifier les conditions du plan avant tout déploiement de production et utiliser un plan autorisant cet usage si nécessaire. Aucun changement de facturation ni de plan n'a été effectué.
- `ffmpeg-static@5.3.0` est autorisé explicitement dans pnpm. Son binaire a été téléchargé, puis le filtre de composition a été exécuté sur le clip mock avec un logo de test, avec et sans piste audio; ffprobe confirme deux sorties MP4 H.264 de 5,000 s et une piste AAC dans la variante audio. Le traitement avec vrais fichiers de marque et Supabase, ainsi que la compilation Vercel, restent à vérifier. Le Studio propose une piste audio validée facultative.

## Catalogue vidéo (2026-10-08)

- Kling 2.6 Pro est retiré du catalogue actif. Kling O3 Pro (`fal-ai/kling-video/o3/pro/image-to-video`) le remplace en Standard, en image-to-video de 5 secondes, audio natif désactivé; coût Fal de référence: 0,112 USD/s, soit environ 0,56 USD par clip. L’adaptateur envoie `image_url` (et non `start_image_url`), le prompt, `duration: "5"` et `generate_audio: false`.
- Seedance 2.5 (`bytedance/seedance-2.5/image-to-video`) est disponible en Premium et sélectionnable dans le studio; Veo 3.1 Fast reste le modèle Premium par défaut. Seedance produit 5 secondes en 720p, ratio choisi explicitement et audio natif désactivé. Le coût de référence retenu est 0,473 USD/s pour 16:9/9:16/1:1, soit environ 2,37 USD pour 5 secondes; il dépend de la résolution et de l’aire générée.
- Les migrations `0005_seedance_kling_o3.sql` et `supabase/setup.sql` désactivent l’ancien enregistrement Kling 2.6 sans l’effacer, pour préserver les références d’historique. Les enregistrements Kling O3 Pro et Seedance 2.5 sont idempotents. Aucun appel payant ni déploiement n’a été lancé pour cette intégration.
- Endpoints, paramètres et prix vérifiés dans la documentation officielle fal: [Kling O3 Pro image-to-video](https://fal.ai/models/fal-ai/kling-video/o3/pro/image-to-video/api) et [Seedance 2.5 image-to-video](https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api). Les prix peuvent évoluer; le plafond de dépense est configuré directement dans fal.ai.
- Le routage est déterministe et partagé par l'interface, l'API et le traitement live : Standard utilise Wan 3.0 à 5 s puis Kling O3 Pro à 10/15 s; Premium utilise Veo 3.1 Fast à 5 s puis Seedance 2.5 à 10/15/20/30 s. La migration `0012_generation_model_routing.sql` et la fin de `supabase/setup.sql` réappliquent ces règles sans supprimer les références historiques.

## Sélecteur de scènes (2026-10-08)

- Le Studio suggère une catégorie à partir de la marque et du modèle du véhicule, avec une sélection manuelle pour corriger la détection. Chaque catégorie sert à mettre en avant des préréglages adaptés (berline, SUV, pick-up, camion, bus, engin, autre), mais tous les préréglages restent sélectionnables avec tous les véhicules. Les scènes hors catégorie sont formulées sans imposer un type de carrosserie. Lieu, décor, lumière, personnage, mouvement caméra et action du véhicule restent personnalisables.
- Ces choix structurés et la précision libre sont enregistrés avec le brief. Le LLM compose une direction créative en une phrase, sans remplacer les options choisies ni l’identité issue de la photo; le prompt envoyé est consultable en lecture seule après le lancement.
- La V1 reste sur un plan continu de 5 secondes. Les préréglages sont actuellement le catalogue RIMCO du prototype; si la plateforme ouvre à d’autres marques, les scènes devront devenir des réglages par marque en base.

## Facturation et identité (2026-10-08)

- L’ancienne grille facturait un montant fixe par seconde : Standard 460 FCFA/s (2 300 FCFA pour 5 s) et Premium 700 FCFA/s (3 500 FCFA pour 5 s). Pour les générations live, elle est remplacée par le tarif Fal configuré pour le modèle, converti en FCFA puis majoré de 30 %, arrondi au FCFA supérieur. Les montants historiques restent inchangés.
- Le tarif client est affiché en FCFA uniquement. La page Coûts, son CSV et les réponses API de coûts ne révèlent ni conversion en euros, ni coût fournisseur, ni marge. Le journal conserve les coûts fournisseur pour le pilotage, sans bloquer les générations selon un plafond applicatif.
- La clôture de facturation applique le tarif Fal enregistré dans le catalogue de modèles; l’API de file d’attente Fal utilisée ne fournit pas le détail de facture par requête. Si Fal change ses prix, mettre à jour les tarifs unitaires du catalogue avant les nouvelles générations.
- Le logo RIMCO Motors fourni est affiché dans la navigation sans altération de ses couleurs ni de ses proportions.

## Durées longues et estimation Studio (2026-10-08)

- Le Studio prend en charge 5, 10, 15, 20 et 30 secondes. Kling O3 Pro propose 5/10/15 s; Seedance 2.5 propose 5/10/15/20/30 s; Veo conserve un rendu final de 5 s à partir de sa source de 6 s. La migration `0007_long_video_durations.sql` met à jour le catalogue et la contrainte SQL sur la durée des versions.
- L’estimation avant génération utilise le tarif de référence du modèle, la durée source facturée par Fal, les taux de conversion et la majoration de 30 %. Elle est indicative, affichée uniquement en FCFA, et recalculée selon le modèle et la durée. Les ajustements de tarif du fournisseur peuvent faire varier la facture réelle.
- Le prompt reçoit la durée et un niveau de complexité (simple, équilibré, riche). Il développe une progression visuelle adaptée dans un plan continu, sans modifier l’identité du véhicule.
- Références Fal vérifiées le 8 octobre 2026 : [Kling O3 Pro accepte 3 à 15 secondes](https://fal.ai/models/fal-ai/kling-video/o3/pro/image-to-video/api); [Seedance 2.5 accepte 4 à 30 secondes et facture selon la surface de sortie et la durée](https://fal.ai/models/bytedance/seedance-2.5/image-to-video/api). Les clips au-delà de 15 secondes passent par Seedance.

## Prototype de montage multi-plans (2026-10-12)

- Pour l’essai interne avant la présentation client, le Studio propose deux plans Kling O3 Pro de 3 secondes générés séparément puis assemblés en un MP4 d’environ 6 secondes. La photo véhicule commune sert de référence aux deux plans; l’utilisateur précise scène, lieu, action et mouvement caméra pour chacun.
- Estimation fournisseur actuelle : 6 × 0,112 USD = 0,672 USD par montage complet, sans appel LLM. Le plafond des dépenses fournisseur est configuré directement dans fal.ai. L’application conserve le suivi des coûts sans plafond applicatif. Le tarif Fal est susceptible de changer; revalider avant les essais.
- Cette itération ne comprend ni validation/approbation ni édition après génération. Le Studio propose l'incrustation du logo RIMCO activée par défaut, désactivable vidéo par vidéo; FFmpeg le compose en haut à gauche après l'assemblage, sans appel Fal additionnel ni coût IA. La piste audio est ajoutée au même traitement. La migration `0010_video_shots.sql` crée le suivi des deux rendus; pour Supabase, exécuter le contenu actualisé de `supabase/setup.sql` depuis l’éditeur SQL avant le premier essai live.
- La simulation locale n’appelle pas Fal et ne produit pas le vrai montage. Le prototype a été déployé en production; avant un essai live, vérifier que `PROVIDERS_MODE=live` et appliquer la migration `0010_video_shots.sql` à Supabase. Aucun nouvel appel payant n’a été lancé par Codex.
- Mise à jour du 16 octobre 2026 : les niveaux du Studio classique sont maintenant Standard (Wan, 5 s), Pro (Kling O3, 5/10/15 s) et Premium (Seedance). Le niveau de la version et son modèle sont visibles dans la file « À valider ». Le mode multi-plans conserve ses modes séparés (Wan/Kling/Seedance) et ses choix de durée désignent le temps généré; le logo animé ajoute ensuite 2 s au fichier final.
- Mise à jour du 16 octobre 2026 : l’étape de storyboard IA précède aussi le workflow à un seul plan. Les clips respectent les durées choisies et les contraintes propres au modèle; un écran final animé de 2 s avec le logo RIMCO est ajouté après eux. Par exemple, 5/10/15/20 s de clips donnent des vidéos finales de 7/12/17/22 s. Le Pro/Kling multi-plans assemble le storyboard en plusieurs clips si un plan unique ne respecte pas ses limites. Le coût suit la durée réellement demandée au fournisseur. Aucun test de génération payante n’est lancé.
- Six références libres de droits pour des lieux de Côte d’Ivoire sont incluses comme entrées approuvées de la médiathèque (Pont HKB, route rouge végétalisée, vues du Plateau/front lagunaire de jour et de nuit). Elles sont stockées dans `public/places/`, exposées via `/api/assets?kind=place` et disponibles dans le sélecteur du storyboard. Le fichier `image-1.png` reçu était une capture de l’interface Lieu/Décor et n’a pas été importé comme lieu. Les admins peuvent toujours ajouter d’autres lieux depuis la médiathèque.
- La sélection de décor en doublon a été retirée du Studio classique : le choix « Lieu » pilote aussi le décor descriptif transmis au brief. Les références photographiques de lieu sont utilisées dans le workflow multi-plans; les endpoints image-to-video classiques ne reçoivent toujours qu’une photo du véhicule.
- Migration `0021_generation_pro_tier.sql` créée et ajoutée à `supabase/setup.sql`; le contrôle du catalogue de production confirme que les modèles Pro sont disponibles.
- Correction de durée du 16 octobre 2026 : les choix 5/10/15/20 s représentent le temps de clips générés; la carte du logo RIMCO ajoute 2 s au fichier final (7/12/17/22 s). Pour le multi-plans, les choix 15/20 s produisent donc 17/22 s au total. Le storyboard, la réservation et la facturation suivent le temps envoyé aux modèles; l’assemblage FFmpeg ajoute la carte de fin. Seedance 2.5 remplace Veo comme modèle Premium; Veo reste conservé pour l’historique, mais est désactivé dans le catalogue.
- Application Supabase effectuée dans l’éditeur SQL du projet RIMCO Motors (`wibsndlbrzeuvavfeyjy`, branche `main` / production) le 16 octobre 2026 : migration `0022_seedance_premium_and_logo_duration.sql` exécutée et contrôlée. Seedance image-to-video est actif et par défaut, Seedance reference-to-video est actif, Veo 3.1 Fast est désactivé; la contrainte de durée accepte les rendus de clips et les fichiers finaux avec écran logo.
- Mise à jour du 18 octobre 2026 : ajout du mode Studio « Fidélité photo ». Il compose les références locales avec FFmpeg, sans appel Wan/Kling/Seedance, garde les photos intérieures en plein cadre et exige un PNG avec vrais pixels transparents pour superposer un véhicule extérieur au lieu choisi. Les clips de 5 s restent à un plan; 10/15/20 s peuvent assembler jusqu’à six plans; la carte logo de 2 s est ajoutée après les clips. Limite explicite : le seuil SSIM 0,98 est enregistré comme objectif mais n’est pas calculé automatiquement; l’interface le signale comme non mesuré, donc ce mode ne garantit pas encore le seuil numérique. Aucun schéma Supabase supplémentaire n’est requis.
- Mise à jour du 18 octobre 2026 : le choix « Fidélité photo » a été retiré du parcours principal. Il lançait un montage FFmpeg sans génération vidéo IA et ne garantissait pas une fidélité mesurée; le Studio utilise désormais toujours la génération vidéo IA, avec les photos validées du véhicule comme références et une seule action « Générer la vidéo ».
- Mise à jour du 18 octobre 2026 : la file de génération expose désormais les étapes d’attente Fal, génération, transfert, clôture des coûts et post-production. Les horodatages sont enregistrés dans `brief_json`, y compris par plan pour les storyboards multi-clips; l’interface interroge le statut toutes les 5 secondes sans lancer de requêtes qui se chevauchent. Un dépassement de 10 minutes est présenté comme un blocage à vérifier, sans libérer automatiquement la réservation ni déclarer l’échec : Fal peut encore facturer un job distant dont l’état est inconnu. La finalisation FFmpeg conserve les téléchargements et écritures indépendants en parallèle.
- Mise à jour du 18 octobre 2026 : la file `/file-generation` affiche maintenant les durées par étape et distingue les étapes à venir. La durée de clôture des coûts commence à son propre horodatage pour ne pas être confondue avec le transfert. Les échecs de lecture du statut Fal sont journalisés en JSON expurgé avec l’étape, le modèle, l’identifiant de requête, le code HTTP et le détail nettoyé; les clés, URL, références et prompts ne sont pas journalisés. Aucun changement de schéma Supabase n’est requis.
- Mise à jour du 18 octobre 2026 : le clic sur « Générer » lance désormais le réalisateur IA en interne, puis transmet automatiquement son storyboard validé au pipeline vidéo, sans écran de validation intermédiaire. Le brief libre, le mode, la durée, le format, le personnage, la lumière, les photos approuvées du véhicule et les lieux choisis alimentent la direction créative. À 5 s, le réalisateur prépare un plan unique; à partir de 10 s, il peut composer plusieurs plans compatibles avec les limites du modèle. Le prompt Premium privilégie une progression publicitaire, des cadrages variés et des mouvements réalistes; poussière et autres effets naturels ne sont autorisés que si la demande et les références s’y prêtent. Le coût LLM de préparation est rattaché à la version et ajouté à l’estimation finale; une réponse invalide arrête la chaîne avant toute génération vidéo. Cette évolution remplace la décision antérieure de ne pas ajouter d’appel LLM préparatoire au parcours direct.
- Mise à jour du 18 octobre 2026 : Standard, Pro et Premium suivent maintenant la chaîne commune image-clé validée → animation IA. Wan 3.0 Image-to-Video anime la première frame acceptée en Standard; chaque segment Standard dure exactement 5 s, et les choix de 10/15/20 s sont assemblés à partir de 2/3/4 segments. Pro utilise Kling O3 Pro Image-to-Video et Premium Seedance 2.5 Image-to-Video. La migration additive `0025_standard_keyframe_animation.sql` active et horodate le modèle Wan 3.0 à 0,10 USD/s en 720p, avec les formats documentés 16:9, 9:16 et 1:1. Les images-clés et contrôles restent suivis comme coûts réels `keyframe`, sans changer le prix client. Le contrôle automatique ne garantit pas une identité parfaite du véhicule; les premières générations doivent être examinées manuellement.
- Application Supabase effectuée dans l’éditeur SQL du projet RIMCO Motors (`wibsndlbrzeuvavfeyjy`, branche `main` / production) le 18 octobre 2026 : migration `0025_standard_keyframe_animation.sql` exécutée. Contrôle après exécution : Wan 3.0 actif en Standard, Image-to-Video, 0,10 USD/s, durée 5 s, formats 16:9/9:16/1:1, horodatage de vérification tarifaire présent. Les colonnes de suivi des images-clés de la migration `0024` étaient déjà présentes. Aucun appel réel payant n’a été lancé.
- Correctif du 19 octobre 2026 : le champ de direction créative accepte jusqu’à 1 000 caractères; l’API versions doit partager exactement cette limite, sinon la validation échoue après la préparation du storyboard. Les images-clés (JPEG/PNG/WebP) restent dans le bucket privé `videos` avec les MP4; la migration additive `0026_allow_keyframe_images_in_video_storage.sql` autorise ces MIME types et le pipeline marque l’image-clé en échec si son enregistrement échoue.
- Correctif du 19 octobre 2026 : le contrôle visuel des images-clés via `openrouter/router/vision` doit envoyer `reasoning: true`, comme le storyboard, car fal rejette les requêtes sans raisonnement; un test vérifie ce paramètre avant tout appel fournisseur.
- Correctif du 19 octobre 2026 : le contrôle visuel accepte maintenant un objet JSON valide même si le modèle l’entoure de texte ou de balises; la validation stricte du schéma reste appliquée à l’objet extrait. Les statuts d’échec fal demandent aussi leurs journaux afin de diagnostiquer les erreurs fournisseur côté serveur. Si une réponse de contrôle est terminée mais invalide, son coût réel rapporté est clôturé au lieu de libérer à tort la réservation. Aucun changement de schéma Supabase n’est requis.
- Correction du 19 octobre 2026 : Premium est maintenant limité à 20 s, réalisés en quatre clips distincts de 5 s puis 2 s de logo (22 s au total). L’API refuse les autres durées Premium et les workflows Premium qui contourneraient le storyboard multi-plans. Le tarif client suit la grille configurée par marque et est figé lors de la réservation; le coût fournisseur réel, y compris une reprise, reste comptabilisé séparément.
- Correction du 19 octobre 2026 : chaque plan persiste un état de soumission et une date de prise de verrou. Un refus fournisseur déterministe devient terminal et n’est pas resoumis; une soumission dont l’acceptation est incertaine passe en réconciliation. La migration additive `0029_premium_twenty_and_atomic_submission.sql` ajoute ces colonnes et est également incluse à la fin de `supabase/setup.sql`; elle n’a pas été appliquée à une base distante.
- Correction du 19 octobre 2026 : le Studio actualise le suivi selon le délai renvoyé par le serveur, s’arrête sur les états terminaux ou en réconciliation, et signale qu’aucune relance automatique ne sera envoyée tant que le statut du fournisseur reste incertain.

- Correctif du 19 octobre 2026 : une réponse du réalisateur parfois coupée ou entourée de texte faisait échouer la préparation du storyboard. Le parseur extrait maintenant un objet JSON complet sans ignorer la validation Zod; l’unique reprise demande un JSON plus compact, conserve les références sélectionnées et ne relâche aucune contrainte de durée ou d’identité véhicule.
- Correctif du 19 octobre 2026 : le premier test de production a confirmé que fal terminait bien les requêtes vision, mais le Studio ne reconnaissait pas la réponse. L’extraction accepte désormais la réponse documentée `data.output` et les enveloppes texte/chat compatibles; elle conserve la validation des trois champs obligatoires, tolère les métadonnées facultatives, et journalise un extrait borné quand la sortie reste invalide. Le prompt de contrôle demande un unique objet JSON et le plafond passe à 500 tokens. Les appels vidéo restent bloqués tant que toutes les images-clés ne sont pas acceptées. Aucun changement Supabase n’est requis.
- Correctif du 19 octobre 2026 : la documentation actuelle de `openrouter/router/vision` décrit `reasoning` comme facultatif et précise qu’il contrôle l’inclusion du raisonnement dans la réponse finale; le paramètre est donc omis pour éviter de forcer un mode incompatible avec le modèle configuré. Les tâches persistées mémorisent leur endpoint fal. Les erreurs transitoires de suivi suivent un backoff borné (15, 60 et 180 secondes), les erreurs de requête arrêtent le polling, et les coûts d’une tâche acceptée mais incertaine restent réservés jusqu’à réconciliation. Une reprise manuelle ne resoumet jamais de génération.
- Diagnostic et correctif du 19 octobre 2026 à partir des logs Vercel : les contrôles d’images-clés échouent en HTTP 400 car le modèle vision configuré répond `Reasoning is mandatory for this endpoint and cannot be disabled.` Le corps envoyé n’incluait pas `reasoning`; l’adaptateur le transmet désormais à `true`. La documentation fal décrit ce champ comme facultatif et indique qu’il contrôle la présence du raisonnement dans la sortie, mais la configuration réellement utilisée par ce projet le rend obligatoire. L’extraction du résultat préfère toujours le JSON final et ne prend le raisonnement qu’en secours si celui-ci contient une décision complète. Les erreurs 422 observées concernent d’anciennes requêtes Kling reference-to-video; la réponse fal complète n’était pas conservée, donc `safeProviderError` expose désormais `body.detail` après masquage pour rendre leur cause vérifiable au prochain suivi. Aucune de ces anciennes tâches n’est resoumise automatiquement et aucun coût supplémentaire n’est engagé.
- Amélioration des images-clés (19 octobre 2026) : chaque plan mémorise dans `brief_json` l’ordre de ses références approuvées — photo de base, vues complémentaires du même dossier, lieu en dernier. La sélection privilégie les angles distincts et reste limitée à 14 références. Le contrôle vision reçoit cette même séquence et compare l’identité du véhicule, les détails visibles, le lieu et le texte ajouté; la reprise unique réutilise exactement les mêmes références. La limite du brief libre passe à 1 000 caractères. La réserve du réalisateur est calculée avec `LLM_MAX_COST_USD` pour les deux tentatives possibles; le journal est réglé sur le coût rapporté, ou sur le plafond par tentative si le fournisseur ne renvoie pas son usage. Aucun changement Supabase n’est requis.

- Optimisation Supabase (21 octobre 2026) : le tableau Usage consulté indique 88,28 Go d’egress non mis en cache pour 5 Go inclus (83,28 Go au-delà), 3,36 Go d’egress cache pour 5 Go inclus, et 0,16 Go de Storage moyen pour 1 Go inclus. Supabase signale une période de grâce jusqu’au 23 octobre 2026 avant restriction potentielle HTTP 402. Supprimer des objets ne réduit pas l’egress déjà consommé; il faut d’abord limiter les lectures et téléchargements futurs, surtout les MP4. Le polling de bibliothèque et les URL signées répétées sont réduits dans l’application. Après rendu final `ready`, supprimer les MP4 bruts de génération et les anciens clips d’une reprise qualité; conserver les MP4 finaux et les images-clés utiles au diagnostic. L’Administration fournit une analyse de lots avec estimation de taille avant suppression. La suppression d’une vidéo utilisateur enlève aussi ses clips de plans, reprises et images-clés. Aucun changement de plan ni migration SQL n’est requis.

- Cache de liens Storage (21 octobre 2026) : réutiliser dans une instance serveur la même URL signée pendant au plus 50 minutes (avec 5 minutes de marge avant expiration) pour les prévisualisations et téléchargements d’un même objet; garder les URLs inline et attachment distinctes. La clé inclut le bucket, le chemin et le mode de disposition. Les routes conservent leurs vérifications d’accès avant de renvoyer un lien. Cette mémoire est opportuniste et propre à l’instance Vercel; elle réduit les signatures répétées et peut améliorer les hits CDN avec le même token, sans garantie de réduire à elle seule l’egress Free.

- Vérification de passation (21 octobre 2026) : le tableau Supabase indique la période du 12 octobre au 12 novembre, 91,85 Go d’egress non caché sur 5 Go, 3,65 Go d’egress caché sur 5 Go, 0,16 Go de stockage moyen sur 1 Go et 1,05 Go d’ingestion de logs sur 1 Go. La période de grâce liée au dépassement antérieur finit le 23 octobre; l’avertissement dit que le projet peut alors être restreint avec HTTP 402 si l’organisation reste au-dessus du quota. Les logs des dernières 24 h montrent notamment 1 042 lectures `video_versions`, 694 lectures `video_shots`, 693 mises à jour `video_versions` et des signatures MP4 jusqu’à 364 fois pour un même objet; ce sont des nombres de requêtes, pas des mesures de bande passante, donc ils ne suffisent pas à attribuer l’egress à un fichier ou une route. Dans le Studio de production, la session admin charge les cinq véhicules, trois vues du Tank 300 et les lieux; le logo et le kit véhicule existent également dans `public/`. Aucune image ou vidéo finale ne doit être supprimée pour réduire l’egress déjà consommé : une purge n’annule pas le trafic historique. La purge des intermédiaires ne devient disponible qu’après publication du commit contenant l’outil Admin « Stockage »; elle doit être précédée d’un aperçu des fichiers concernés.
- Réduction des réponses bibliothèque (21 octobre 2026) : chaque lecture de `/api/versions` ne charge plus que la version la plus récente par vidéo (tri décroissant + limite imbriquée PostgREST), et n’envoie plus `generated_prompt`, inutilisé par la bibliothèque et la file de validation. Les vérifications locales passent (lint, typecheck, 197 tests, build). À suivre après publication : comparer les lignes `GET /rest/v1/video_versions` et les octets d’egress du tableau de bord; aucune économie en production n’est mesurable avant déploiement.

- Qualité vidéo et réalisateur IA, patch qualité v2 (21 octobre 2026, proposition KÔMIAN). (1) Le réalisateur IA type chaque plan (`shotType` : establishing, rolling, detail, hero). La lecture est tolérante (casse, synonymes ; une valeur inconnue est ignorée et traitée comme un plan roulant) pour qu’un type mal écrit ne fasse jamais échouer le storyboard. Il rédige les champs visuels en anglais (titres en français) et impose au moins la moitié de plans roulants en publicité, arc Premium compris. (2) Séparation des couches : les règles verrouillées et les références approuvées passent dans le prompt système de l’appel LLM ; le brief libre est le seul contenu du message utilisateur, encadré dans `<user_brief>` et nettoyé des chevrons et accolades. Le réalisateur reçoit aussi l’ambiance de la scène choisie et le moment de la journée de chaque lieu. (3) Lumière par plan : quand la photo du lieu est de nuit (ou de jour, ou en intérieur), la lumière envoyée aux modèles suit le lieu plutôt que la puce de lumière ; elle est figée par plan dans `brief_json.shotLighting` (les versions plus anciennes reprennent `lighting`). (4) Les prompts image-clé n’imposent plus le cadrage de la photo studio et décrivent un véhicule en mouvement ; les prompts d’animation demandent un déplacement continu au lieu du « plus petit mouvement possible ». (5) Le retour du juge qualité est réinjecté dans les reprises comme une donnée courte (300 caractères, sans balises). La reprise d’une image-clé conserve la consigne « véhicule inoccupé ». (6) Le prompt affiché sous « Voir le prompt généré » et enregistré est désormais celui réellement envoyé (prompt image-clé, puis prompt d’animation par plan). (7) Les références image-clé sont limitées à 5 (vue principale, 3 angles distincts, lieu). (8) Le montage storyboard sort en 1080p (lanczos), à 24 i/s du premier plan au logo, en CRF 20, avec un étalonnage commun léger ; le logo de fin vise ~32 % de la largeur mais n’est jamais agrandi au-delà de 1,5 fois sa taille native (le fichier actuel fait 204 px : fournir un logo HD d’au moins 600 px de large pour atteindre la taille cible). Mesure locale sur 1 processeur pour 22 s : environ 17 s d’encodage au lieu de 9 s en 720p, pour une limite de fonction de 60 s ; fichiers environ 1,5 à 2 fois plus lourds, donc plus d’egress Supabase par lecture. (9) Le moteur de montage sait mixer une musique validée avec fondus, mais l’API refuse encore l’audio pour les storyboards : l’activation dans le Studio reste à faire. (10) Un garde-fou refuse, avant tout appel payant, une vidéo dont le coût nominal dépasse `VIDEO_COST_CAP_USD` (15 $ par défaut, hypothèse à calibrer). Cela modifie la règle d’AGENTS.md « ne jamais bloquer sur un plafond applicatif », au profit de la règle d’architecture du plafond dur ; mettre une valeur très élevée dans Vercel revient à le désactiver. Aucun changement de schéma Supabase.
- Compléments au patch qualité v2 (22 octobre 2026). (1) Le plafond de coût par vidéo devient facultatif : `VIDEO_COST_CAP_USD` vide ou absent = aucun blocage, conformément à AGENTS.md ; renseigner une valeur (ex. 15) active la règle d'architecture « 15 $ pour 30 s ». Le plafond global reste réglé dans fal.ai. (2) La charte RIMCO (~90 % bleu, ~10 % rouge) est ajoutée aux prompts image-clé, animation et plan, comme étalonnage de l'environnement et de la lumière uniquement : la couleur de carrosserie de la photo n'est jamais modifiée. (3) La description du véhicule envoyée aux modèles se limite à marque, modèle et couleur : la variante du dossier (ex. « Kit d'essai visuel ») est un libellé interne que les modèles lisaient comme le nom du véhicule. (4) Les champs visuels du storyboard ne sont plus coupés au-delà de 240 caractères (la consigne du réalisateur reste 120 à 180) et une coupe éventuelle ne se termine plus sur un mot de liaison orphelin (« la largeur du. »).
- Ergonomie de l’accueil et du Studio (23 octobre 2026). (1) L’accueil et le Studio de création faisaient doublon : le formulaire rapide de l’accueil renvoyait vers le Studio et la description saisie était perdue en route. Le Studio complet est désormais affiché directement sur l’accueil ; l’entrée « Studio de création » quitte le menu et `/studio` redirige vers l’accueil pour ne casser aucun lien existant. (2) Le bouton « Envoyer la description » est supprimé : il ne faisait que défiler vers les options, et le bouton « Générer la vidéo » suffit. (3) Une note sous la description rappelle que les choix des options (véhicule, lieu, casting, lumière, format, niveau) sont généralement prioritaires sur le texte saisi. (4) La bibliothèque affiche, dans un bloc dépliable « Voir les paramètres de création », la description saisie et les sélections (véhicule, lieux, casting, lumière, ambiance, musique, format, niveau), relues depuis `video_versions.brief_json` (`src/core/versions/generation-inputs.ts`). Les titres des lieux et musiques importés sont récupérés en une seule requête pour toute la liste. Aucun changement Supabase n’est requis ; les vidéos anciennes affichent ce qui a été enregistré à l’époque.
