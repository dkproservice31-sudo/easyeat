# EasyEat — Règles projet

## Règles de travail avec Supabase MCP (critique — à respecter toujours)

Le projet EasyEat utilise une base Supabase de production contenant des
données réelles (utilisateurs, recettes, ingrédients). Le MCP Supabase
est configuré en mode read_only par défaut. Pour toute intervention sur
la base, les règles suivantes sont OBLIGATOIRES :

### Règle 1 — Pas d'ALTER/DELETE/DROP/TRUNCATE sans validation explicite
Avant toute opération destructive ou modificatrice de schéma (ALTER TABLE,
DROP TABLE, DELETE, TRUNCATE, apply_migration, etc.) :
- Afficher la requête SQL COMPLÈTE au user
- Afficher un résumé en français clair de ce qu'elle fait
- Estimer l'impact (nombre de lignes affectées via un SELECT COUNT(*)
  préalable si DELETE, ou décrire les changements de schéma)
- Demander EXPLICITEMENT "Veux-tu que j'exécute cette requête ? (oui/non)"
- Attendre la confirmation "oui" explicite avant d'exécuter
- Ne jamais enchaîner plusieurs opérations destructives sans valider
  chacune

### Règle 2 — Pas d'hallucination de schéma
Avant d'écrire une requête qui référence des colonnes ou tables :
- Vérifier leur existence via list_tables ou une requête sur
  information_schema
- Ne jamais deviner le nom d'une colonne
- Si une structure n'est pas sûre, demander au user avant

### Règle 3 — Traçabilité : tout changement de schéma = fichier de migration
Pour chaque ALTER TABLE, CREATE TABLE, DROP TABLE, ou toute modif de
schéma exécutée :
- Créer un fichier dans supabase/migrations/ avec un nom horodaté
  (ex: migration_YYYY-MM-DD_description.sql)
- Y mettre le SQL exact qui a été exécuté + un commentaire en français
  expliquant pourquoi
- Cela garantit la traçabilité et permet de reproduire l'état de la base
  sur un autre environnement

### Règle 4 — Mode read-only par défaut, write temporaire si nécessaire
Le .mcp.json est configuré avec read_only=true. Pour une opération
write, le user doit manuellement modifier .mcp.json (retirer read_only),
redémarrer Claude Code, faire l'opération, puis remettre read_only=true.
Ne pas tenter de contourner cette règle en proposant d'autres méthodes
(comme la connexion directe PostgreSQL).

### Règle 5 — Secrets protégés
Ne jamais afficher dans la conversation :
- La clé service_role complète
- Les URLs de connexion Postgres contenant un mot de passe
- Les tokens OAuth Supabase

Si un secret apparaît dans les logs ou les réponses, avertir immédiatement
le user et lui suggérer de régénérer le secret compromis.

### Règle 6 — Ne pas supposer un environnement de dev
Cette base est la base active de l'app. Traiter chaque opération comme
si elle était en production : prudence, confirmation, backup mental.
