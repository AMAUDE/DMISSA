# Plateforme DMISSA – Bingerville

Lancer : double-cliquer `demarrer.bat` (ou `node server.js`), puis ouvrir http://localhost:3000.
Les collègues du même réseau y accèdent via http://<IP-de-ce-poste>:3000 (commentaires partagés, base `collab.db`).

Fenêtres : Vue d'ensemble (recherche, type, n° d'arrêté) · Direction (DU / DTC / non renseigné) · Chevauchement (zones, lots en conflit au zoom).
Aucune superficie n'est exposée.

Données (`data/`) exportées depuis QGIS : `lots.geojson` (couche Bingerville_plans_liste_excel), `zones.geojson`
(Chevauchements_zones_simplifiees), `plans.json` (un enregistrement par plan + emprise utilisée pour le zoom ;
la couche d'emprises est aussi dans `OUT/Emprises_plans.gpkg`, sans être affichée).
Pour actualiser les données : ré-exporter ces trois fichiers depuis QGIS.

## Mise en ligne (GitHub Pages)
`node build-pages.js` génère le dossier `docs/` (site statique). Dans GitHub : Settings → Pages → Source « Deploy from a branch » → branche `main`, dossier `/docs`.
Adresse du site : https://amaude.github.io/DMISSA/
Sans serveur, les commentaires sont enregistrés localement dans le navigateur ; pour des commentaires partagés, lancer `node server.js`.
