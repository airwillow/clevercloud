// Palette commune (index 0 = case vide). Couleurs façon briques de construction.
export const PALETTE = [
  null,
  { key: 'W', name: 'Blanc', hex: '#F4F4F4' },
  { key: 'K', name: 'Noir', hex: '#1E1E1E' },
  { key: 'R', name: 'Rouge', hex: '#C91A09' },
  { key: 'B', name: 'Bleu', hex: '#0055BF' },
  { key: 'Y', name: 'Jaune', hex: '#F2CD37' },
  { key: 'G', name: 'Vert', hex: '#237841' },
  { key: 'O', name: 'Orange', hex: '#FE8A18' },
  { key: 'L', name: 'Gris clair', hex: '#A0A5A9' },
  { key: 'D', name: 'Gris foncé', hex: '#5B5D58' },
  { key: 'T', name: 'Beige', hex: '#E4CD9E' },
  { key: 'A', name: 'Azur', hex: '#36AEBF' },
  { key: 'N', name: 'Bleu nuit', hex: '#0A3463' },
  { key: 'P', name: 'Violet', hex: '#8E55C9' },
  { key: 'S', name: 'Rose', hex: '#FC97AC' },
  { key: 'M', name: 'Vert pomme', hex: '#9BCB2C' },
];

const KEY_TO_INDEX = Object.fromEntries(
  PALETTE.map((p, i) => (p ? [p.key, i] : null)).filter(Boolean),
);

// Chaque notice : 20 × 16 briques, entièrement remplie (mosaïque),
// posée en bas au centre du mur. La gravité est donc toujours respectable.
const RAW = [
  {
    name: 'La Fusée',
    rows: [
      'NNNNNNNNNNNNNNNNNWNN',
      'NNWNNNNNNRRNNNNNNNNN',
      'NNNNNNNNRRRRNNNNNNNN',
      'NNNNNNNNWWWWNNNNYNNN',
      'NNNNNNNNWAAWNNNNNNNN',
      'NNNNYNNNWAAWNNNNNNNN',
      'NNNNNNNNWWWWNNNNNNNN',
      'NNNNNNNNWWWWNNNNNNWN',
      'NNNNNNNNWRRWNNNNNNNN',
      'NWNNNNNRWWWWRNNNNNNN',
      'NNNNNNRRWWWWRRNNNNNN',
      'NNNNNNRRDDDDRRNNNYNN',
      'NNNNNNNNOYYONNNNNNNN',
      'NNNYNNNNNOONNNNNNNNN',
      'LLLLLLLLLOOLLLLLLLLL',
      'DDDDDDDDDDDDDDDDDDDD',
    ],
  },
  {
    name: 'Le Nuage',
    rows: [
      'AAAAAAAAAAAAAAAAAAAA',
      'AAAAAAAAAAAAAAAYYAAA',
      'AAAAAAAAAAAAAAYYYYAA',
      'AAAAAAAAAAAAAYYYYYYA',
      'AAAAAAAWWWAAAYYYYYYA',
      'AAAAAAWWWWWAAAYYYYAA',
      'AAAAAWWWWWWWWAAYYAAA',
      'AAAWWWWWWWWWWWAAAAAA',
      'AAWWWWWWWWWWWWWWAAAA',
      'AWWWWWWWWWWWWWWWWAAA',
      'AWWWWWWWWWWWWWWWWAAA',
      'AALLLLLLLLLLLLLLAAAA',
      'AAAAAAAAAAAAAAAAAAAA',
      'AAMAAAAAAAAAAAAAMAAA',
      'GGGGGGGGGGGGGGGGGGGG',
      'GGGGGGGGGGGGGGGGGGGG',
    ],
  },
  {
    name: 'Le Robot',
    rows: [
      'TTTTTTTTTRRTTTTTTTTT',
      'TTTTTTTTTDDTTTTTTTTT',
      'TTTTTLLLLLLLLLLTTTTT',
      'TTTTTLLLLLLLLLLTTTTT',
      'TTTTTLLAALLAALLTTTTT',
      'TTTTTLLAALLAALLTTTTT',
      'TTTTTLLLLLLLLLLTTTTT',
      'TTTTTLLLRRRRLLLTTTTT',
      'TTTTTLLLLLLLLLLTTTTT',
      'TTTTTTTTDDDDTTTTTTTT',
      'TTTTTBBBBBBBBBBTTTTT',
      'TTTDDBBBYYYYBBBDDTTT',
      'TTTDDBBBYYYYBBBDDTTT',
      'TTTLLBBBBBBBBBBLLTTT',
      'TTTTTTDDDTTDDDTTTTTT',
      'TTTTTDDDDTTDDDDTTTTT',
    ],
  },
  {
    name: 'La Planète',
    rows: [
      'NNNNNNNNNNNNNNNNNNNN',
      'NNWNNNNNNNNNNNNNWNNN',
      'NNNNNNNPPPPPPNNNNNNN',
      'NNNNNPPPPPPPPPPNNNNN',
      'NNNNPPSSPPPPPPPPNNNN',
      'NNNNPSSPPPPPPPPPNOON',
      'NNNNPPPPPPPPPPPOOONN',
      'NNNOOOOOOOOOOOOOONNN',
      'NOOOPPPPPPPPPPPPNNNN',
      'OONNPPPPPPPPPPPPNNNN',
      'NNNNNPPPPPPPPPPNNNNN',
      'NNNNNNNPPPPPPNNNNYNN',
      'NNYNNNNNNNNNNNNNNNNN',
      'NNNNNNNNNNNWNNNNNNNN',
      'NNNNNNNNNNNNNNNNNNNN',
      'NWNNNNNNNNNNNNNNNNWN',
    ],
  },
  {
    name: 'Le Cœur',
    rows: [
      'SSSSSSSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSSSSSSS',
      'SSSSRRRRSSSSRRRRSSSS',
      'SSSRRWRRRSSRRRRRRSSS',
      'SSRRWRRRRRRRRRRRRRSS',
      'SSRRRRRRRRRRRRRRRRSS',
      'SSRRRRRRRRRRRRRRRRSS',
      'SSSRRRRRRRRRRRRRRSSS',
      'SSSSRRRRRRRRRRRRSSSS',
      'SSSSSRRRRRRRRRRSSSSS',
      'SSSSSSRRRRRRRRSSSSSS',
      'SSSSSSSRRRRRRSSSSSSS',
      'SSSSSSSSRRRRSSSSSSSS',
      'SSSSSSSSSRRSSSSSSSSS',
      'SSSSSSSSSSSSSSSSSSSS',
      'SSSSSSSSSSSSSSSSSSSS',
    ],
  },
];

export const BLUEPRINTS = RAW.map(({ name, rows }) => {
  const h = rows.length;
  const w = rows[0].length;
  const data = [];
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`Notice "${name}" : ligne ${y} de longueur ${row.length} (attendu ${w})`);
    for (const ch of row) {
      const idx = KEY_TO_INDEX[ch];
      if (!idx) throw new Error(`Notice "${name}" : couleur inconnue "${ch}"`);
      data.push(idx);
    }
  });
  return { name, w, h, data };
});
