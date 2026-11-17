# Gestion Scolaire — Electron

Application française de gestion d’établissement scolaire : élèves, frais, paiements,
reçus, caisse et rapports. Ce dépôt est une version neutre destinée au partage.

Il ne contient :

- ni nom, ni logo, ni coordonnées d’une école réelle ;
- ni données PostgreSQL, sauvegardes ou exports ;
- ni mécanisme de synchronisation ou de déploiement distant ;
- ni installateur précompilé.

## Contenu

- `Public/` : interface web en français ;
- `server/` : API Node.js, Express et PostgreSQL ;
- `electron/` : application de bureau Electron ;
- `tests/` et `server/test/` : tests automatisés ;
- `docs/` : documentation fonctionnelle.

## Prérequis

- Node.js 20 ou version ultérieure ;
- PostgreSQL accessible depuis le poste ;
- les variables de connexion PostgreSQL décrites dans `server/postgres/README.md`.

## Installation

À la racine du dépôt :

```bash
npm install
```

Pour démarrer l’application Electron :

```bash
npm start
```

Electron démarre le serveur local si le port configuré n’est pas déjà utilisé, puis ouvre
`http://127.0.0.1:3000`. La base PostgreSQL reste externe à l’application.

Pour démarrer uniquement le serveur web :

```bash
npm run serveur
```

## Configuration locale

Exemple :

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGDATABASE=gestion_scolaire
export PGUSER=gestion_scolaire
export PGPASSWORD=changez-moi
export PGSSL=false
npm start
```

## Tests

```bash
npm test
```

Les tests d’intégration du serveur nécessitent une base de test dédiée correctement
configurée. N’utilisez jamais une base de production pour les tests.

## Construire l’application de bureau

```bash
npm run construire:windows
```

Le résultat est créé dans `dist-electron/`. Aucun binaire n’est versionné dans Git.

## Personnalisation

Au premier démarrage, les valeurs sont neutres : **Établissement scolaire** et aucun logo.
Un administrateur peut ensuite renseigner l’identité de son établissement dans les
paramètres. Cette personnalisation reste propre à sa base de données.
