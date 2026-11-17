# Configuration PostgreSQL

L'application utilise PostgreSQL pour les élèves, paiements, reçus et paramètres.

## Préparer la base

Créez une base et un utilisateur, puis appliquez le schéma :

```bash
psql -h <hote> -U <utilisateur> -d <base> -f postgres/schema.sql
```

Variables prises en charge :

- `PGHOST` : adresse du serveur PostgreSQL ;
- `PGPORT` : port, généralement `5432` ;
- `PGDATABASE` : nom de la base ;
- `PGUSER` : utilisateur PostgreSQL ;
- `PGPASSWORD` : mot de passe ;
- `PGSSL` : `true` ou `false` ;
- `PORT` : port HTTP de l'application, par défaut `3000`.

## Démarrer le serveur

Depuis le dossier `server/` :

```bash
npm install
npm start
```

Le point de contrôle `GET /api/health` permet de vérifier que le serveur répond.
