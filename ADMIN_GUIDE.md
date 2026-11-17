# Guide d’administration

Ce guide résume les opérations courantes de Gestion Scolaire.

## Connexion et rôles

- Connectez-vous avec un compte `admin` pour gérer les paramètres et les utilisateurs.
- Les comptes `caissier` et `comptable` disposent de droits limités selon leur rôle.
- Changez les mots de passe initiaux avant une utilisation réelle.

## Année scolaire

Dans **Paramètres**, choisissez l’année scolaire active puis enregistrez. Les élèves,
paiements et reçus restent associés à leur année. Vérifiez toujours l’année affichée
avant une inscription ou un encaissement.

## Élèves et paiements

1. Ajoutez ou recherchez l’élève dans **Élèves**.
2. Vérifiez son niveau, sa classe et ses coordonnées.
3. Ouvrez **Nouveau paiement**, choisissez le frais et la période.
4. Vérifiez le montant, enregistrez puis imprimez le reçu si nécessaire.

## Identité de l’établissement

Le dépôt ne contient aucun nom ni logo d’école. Un administrateur peut renseigner le
nom, le nom court, l’adresse et éventuellement un logo depuis le centre de configuration.
Ces valeurs sont stockées dans la base PostgreSQL de l’installation.

## Sauvegardes

Les données réelles se trouvent dans PostgreSQL et ne sont pas incluses dans ce dépôt.
Mettez en place une sauvegarde locale indépendante et testez régulièrement une restauration.

Exemple de sauvegarde manuelle :

```bash
pg_dump -Fc -h <hote> -U <utilisateur> -d <base> -f sauvegarde.dump
```

## En cas de problème

- Vérifiez que PostgreSQL est démarré et accessible.
- Vérifiez les variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` et `PGPASSWORD`.
- Redémarrez le serveur ou l’application Electron.
- Consultez les journaux du terminal pour identifier l’erreur.
