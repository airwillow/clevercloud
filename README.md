# 🧱 Brique à Brique

Deux jeux de construction en briques, hébergés sur Clever Cloud.

## 🧩 Plan de montage (page d'accueil)

**Le casse-tête de construction.** Il faut reproduire un modèle avec un **stock de briques imposé**, en respectant la **gravité**.

- **Le modèle** : chaque case colorée de la notice doit recevoir une brique de la même couleur. Les cases vides restent vides.
- **Le stock** : il contient des briques 1×1, 1×2, 1×3, 1×4 et des briques hautes 2×2. **Toutes** doivent être utilisées, ni plus ni moins.
- **La gravité** : une brique tient si **au moins un de ses tenons** repose sur le sol ou sur une autre brique. Les surplombs (tablier d'un pont, chapeau de champignon, bras levés) obligent donc à bien choisir où couper et quelle longueur poser.
- **Reprendre une brique** : c'est permis, sauf si elle en soutient d'autres. On peut aussi annuler (Ctrl+Z) et recommencer.
- **L'indice 💡** : il dit si la construction actuelle peut encore aboutir avec les briques restantes (« Impasse ! ») et propose une brique.
- **Les étoiles** : ★★★ sans indice ni retouche, ★★ sans indice, ★ terminé.
- **10 niveaux en campagne**, de Facile à Difficile.
- **Défi du jour** : le même puzzle pour tout le monde, renouvelé chaque jour, avec son classement.
- **Classements anti-triche** : le serveur **rejoue la partie** envoyée (chaque pose, chaque retrait) avant d'accepter un score.

### Comment les niveaux sont fabriqués
`src/puzzle.js` contient les règles, un **solveur** (couverture exacte avec contrainte de gravité) et un **générateur**. Pour chaque modèle (`src/levels-data.js`), le générateur essaie des centaines de découpages en briques. Il garde ceux qui ont peu de solutions et peu de 1×1, puis simule un joueur qui pose au hasard pour mesurer la proportion de « pièges ». Le stock retenu est celui qui correspond à la difficulté visée. Pour régénérer : `npm run build:levels`.

## 🧱 Le Mur (`/mur.html`)

Un mur de briques collaboratif en temps réel, en WebSocket : tous les visiteurs reproduisent ensemble une grande mosaïque. Un tutoriel est disponible sur `/tuto.html`.

- Cliquez sur le mur pour poser une brique de la couleur choisie. Tout le monde la voit apparaître instantanément.
- **Gravité** : une brique doit reposer sur le sol ou sur une autre brique.
- **Réserve** : 10 briques, +1 par seconde.
- **Notice de montage** : chaque brique conforme rapporte **+1 point** et devient **verrouillée 🔒**.
- **Modèle terminé à 100 %** : il rejoint la galerie, puis une nouvelle plaque démarre.

## Stack

| Brique | Techno |
|---|---|
| Serveur | Node.js 20+ (HTTP natif), WebSocket (`ws`) |
| Persistance | Redis (add-on Clever Cloud) via `ioredis` : état du Mur et classements du Plan de montage |
| Front | HTML/CSS/JS sans framework ni build, rendu Canvas 2D, sons WebAudio générés (aucun fichier) |
| Hébergement | Clever Cloud (application Node.js + add-on Redis) |

L'état du mur est tenu en mémoire par le serveur, qui fait autorité : gravité, verrous, réserve et points sont vérifiés côté serveur. Il est sauvegardé dans Redis, donc le mur survit aux redéploiements et aux redémarrages.

## Lancer en local

```bash
npm install
npm start            # http://localhost:8080 (état en mémoire)
# ou, avec Redis :
REDIS_URL=redis://localhost:6379 npm start
```

Tests de bout en bout. Plan de montage : chaque niveau est soluble, les parties valides sont acceptées et les parties truquées refusées. Mur : des bots construisent une notice complète.

```bash
npm test
```

## Déployer sur Clever Cloud

Avec la [CLI Clever Cloud](https://www.clever.cloud/developers/doc/cli/) :

```bash
npm i -g clever-tools
clever login

# 1. L'application Node.js
clever create --type node brique-a-brique --region par

# 2. L'add-on Redis, puis le lier (il injecte REDIS_URL)
clever addon providers show redis-addon          # pour voir les plans disponibles
clever addon create redis-addon brique-redis --plan <plan> --region par
clever service link-addon brique-redis

# 3. Configuration
clever env set ADMIN_KEY "un-secret-a-vous"      # optionnel : outils de démo
clever scale --min-instances 1 --max-instances 1 # l'état vit dans une seule instance

# 4. Déploiement (pousse le commit courant)
clever deploy
clever open
```

Clever Cloud lance `npm install` puis `npm start`. Le serveur écoute sur `PORT` (8080 par défaut). Les WebSockets sont servis sur `/ws`, et un healthcheck est disponible sur `/health`.

### Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | Port HTTP (fourni par Clever Cloud) |
| `REDIS_URL` | – | Fourni par l'add-on Redis. Sans lui, état en mémoire seulement |
| `ADMIN_KEY` | – | Active les endpoints de démo ci-dessous |
| `BRICK_MAX` | `10` | Taille de la réserve de briques |
| `BRICK_REGEN_MS` | `1000` | Recharge d'une brique (ms) |
| `NEXT_PLATE_DELAY_MS` | `10000` | Pause de célébration avant la plaque suivante |

### Outils de démo (avec `ADMIN_KEY`)

Pour montrer la fin d'un modèle au jury sans poser 320 briques :

- `GET /api/admin/almost?key=…&left=5` : remplit la notice sauf 5 briques (en haut). Il ne reste plus qu'à les poser.
- `GET /api/admin/next?key=…` : passe directement à la plaque suivante.

## Structure

```
server.js              Serveur HTTP + WebSocket, API, fichiers statiques
src/puzzle.js          Plan de montage : règles, solveur, générateur (servi aussi au navigateur)
src/levels-data.js     Modèles des 10 niveaux (pixel art en ASCII)
src/levels.json        Stocks de briques générés et vérifiés
src/plan.js            Niveaux, défi du jour, vérification des parties, classements
src/game.js            Le Mur : gravité, verrous, réserve, points, galerie
src/blueprints.js      Palette et notices du Mur
src/store.js           Persistance Redis (ou mémoire)
public/index.html      Plan de montage (plan.js, plan.css)
public/mur.html        Le Mur (app.js, style.css) et son tutoriel tuto.html
scripts/build-levels.js  Génération des niveaux
test/                  Tests de bout en bout
```
