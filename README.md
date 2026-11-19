# 🧱 Brique à Brique

**Un mur de briques collaboratif en temps réel.** Tous les visiteurs construisent le même mur, au même moment, avec un objectif commun : reproduire le modèle de la **notice de montage**.

## Le jeu

- Cliquez sur le mur pour poser une brique de la couleur choisie. Tout le monde la voit apparaître instantanément.
- **Gravité** : une brique doit reposer sur le sol ou sur une autre brique, comme une vraie construction.
- **Réserve** : 10 briques, +1 par seconde. Chaque brique compte.
- **Notice de montage** : un modèle de 20 × 16 briques s'affiche en transparence. Chaque brique conforme rapporte **+1 point** et devient **verrouillée 🔒**, donc personne ne peut saboter le travail des autres.
- **Zone libre** : autour de la notice, chacun construit ce qu'il veut.
- **Modèle terminé à 100 %** : confettis 🎉, podium des meilleurs bâtisseurs, archivage dans la **galerie**, puis une nouvelle plaque démarre avec la notice suivante (Fusée → Nuage → Robot → Planète → Cœur).

Astuces : touches `1`–`9` pour changer de couleur, **clic droit** (ou appui long sur mobile) = pipette sur la couleur de la notice, `N` pour masquer ou afficher la notice.

## Stack

| Brique | Techno |
|---|---|
| Serveur | Node.js 20+ (HTTP natif), WebSocket (`ws`) |
| Persistance | Redis (add-on Clever Cloud) via `ioredis`, sauvegarde à chaque changement (debounce 1 s) |
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

Test de bout en bout : des bots construisent une notice complète et vérifient gravité, verrous, points, galerie et plaque suivante.

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
server.js            Serveur HTTP + WebSocket, fichiers statiques, endpoints
src/game.js          Règles : mur, gravité, verrous, réserve, points, galerie
src/blueprints.js    Palette et notices de montage (pixel art en ASCII)
src/store.js         Persistance Redis (ou mémoire)
public/              Front : index.html, style.css, app.js
test/smoke.js        Test de bout en bout avec bots WebSocket
```

Ajouter une notice : une entrée de plus dans `src/blueprints.js`, soit 16 lignes de 20 lettres, une lettre par couleur de la palette.
