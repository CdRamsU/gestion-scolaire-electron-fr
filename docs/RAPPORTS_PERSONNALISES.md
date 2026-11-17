# Rapports personnalisés

Ouvrez **Rapports → Rapport personnalisé** pour choisir le périmètre des élèves et
définir de une à six conditions portant sur les frais et les mois. Le mode **ET** exige
toutes les conditions ; le mode **OU** en exige au moins une.

L’atelier propose trois étapes :

1. **Critères** : élèves actifs ou inactifs, niveau, classe et conditions financières.
2. **Présentation** : tableau, fiches ou synthèse, avec regroupement et tri.
3. **Impression** : titre, orientation, densité, critères et totaux facultatifs.

Les définitions nommées sont conservées dans le stockage local du navigateur, par
utilisateur. Elles contiennent les critères, jamais les dossiers des élèves. Un changement
de critère invalide les résultats précédents jusqu’au prochain calcul.

Les montants de devises différentes ne sont jamais additionnés. L’export CSV neutralise
les valeurs qui pourraient être interprétées comme des formules par un tableur.

Points d’API utilisés :

- `GET /api/reports/custom/options`
- `GET /api/reports/custom?definition=<json encode>`

Vérification :

```bash
node --test tests/custom-report-presentation.test.cjs \
  server/test/custom-report.unit.test.js \
  server/test/custom-report.routes.test.js
```
