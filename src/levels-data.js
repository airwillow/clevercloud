// Modèles des niveaux. « . » = case vide. Lettres = couleurs de la palette (src/blueprints.js).
// La gravité impose qu'au moins un tenon de chaque brique repose sur le sol ou sur une brique :
// les surplombs (ponts, chapeaux, bras) obligent donc à bien choisir où couper.
export const LEVELS = [
  {
    id: 'mur', name: 'Premier mur', difficulty: 'easy',
    tip: 'Choisissez une brique dans le stock, puis cliquez sur le plan. Tout le stock doit être utilisé.',
    rows: ['RRRRRR', 'YYYYYY', 'BBBBBB'],
  },
  {
    id: 'maison', name: 'La maison', difficulty: 'easy',
    tip: 'Le bord du toit dépasse des murs : une brique posée dans le vide doit avoir au moins un tenon sur un appui.',
    rows: ['...R...', '..RRR..', '.RRRRR.', 'RRRRRRR', '.WWAWW.', '.WWDWW.'],
  },
  {
    id: 'pont', name: 'Le pont', difficulty: 'medium',
    tip: 'Au-dessus de l\'arche, chaque brique doit toucher un pilier.',
    rows: ['RRRRRRRRR', 'DDDDDDDDD', 'DD.....DD', 'DD.....DD', 'DD.....DD'],
  },
  {
    id: 'champignon', name: 'Le champignon', difficulty: 'medium', blocks: 0.35,
    tip: 'Nouvelle pièce : la brique haute 2×2. Le chapeau ne repose que sur un pied étroit.',
    rows: ['..RRRR..', '.RRWRRR.', 'RWRRRRWR', 'RRRRRRRR', '...TT...', '...TT...'],
  },
  {
    id: 'coeur', name: 'Le cœur', difficulty: 'medium',
    tip: 'Tout en rouge : seules les longueurs comptent. Et le cœur se termine en pointe…',
    rows: ['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'],
  },
  {
    id: 'fusee', name: 'La fusée', difficulty: 'medium',
    rows: ['...RR...', '..RRRR..', '..WWWW..', '..WAAW..', '..WWWW..', '.RWWWWR.', 'RRWWWWRR', 'R.DDDD.R'],
  },
  {
    id: 'robot', name: 'Le robot', difficulty: 'hard', blocks: 0.3,
    rows: ['..LLLLL..', '..LALAL..', '..LRRRL..', 'Y.LLLLL.Y', 'B..DDD..B', 'BBBBBBBBB', '..BYYYB..', '..BBBBB..', '..BB.BB..'],
  },
  {
    id: 'chateau', name: 'Le château', difficulty: 'hard',
    rows: ['LL.LL.LL.LL', 'LLLLLLLLLLL', 'LLALLLLLALL', 'LLLLLLLLLLL', 'LLLL...LLLL', 'LLL.....LLL', 'LLL.....LLL'],
  },
  {
    id: 'arbre', name: 'L\'arbre', difficulty: 'hard', blocks: 0.25,
    rows: ['...GGG...', '..GGMGG..', '.GGGGGGG.', 'GGGMGGGGG', '.GGGGGGG.', '...TTT...', '...TTT...', '..TTTTT..'],
  },
  {
    id: 'soucoupe', name: 'La soucoupe', difficulty: 'hard',
    rows: ['....AAA....', '...AAAAA...', '.LYLLYLLYL.', 'LLLLLLLLLLL', '..DDDDDDD..', '...D...D...', '..DD...DD..'],
  },
];
