// config.js — every constant that shapes Solara Bay lives here: the street grid, the
// district layout, the colour palette of a city at golden hour, the money economy of
// Nico Vega's debt, and the names of the people and places in the story. One file to
// tune, and the outline of the whole game in a single read.

// --- The grid -------------------------------------------------------------------
// Streets run on a pitch of PITCH metres; BLOCK is the buildable square between the
// roads and ROAD the asphalt width. Indices 0..GRID give GRID+1 streets each way, so
// the built city spans WORLD metres square, centred on the origin.
export const GRID = 8;
export const PITCH = 60;
export const BLOCK = 44;
export const ROAD = 16;
export const WORLD = GRID * PITCH; // 480
export const HALF = WORLD / 2; // 240
export const LANE = 3.4; // lane offset from a street centre line
export const SIDEWALK = 2.6;

// Street centre lines: streetX(i) is the x of the i-th north-south street.
export const streetX = (i) => -HALF + i * PITCH;
export const streetZ = (j) => -HALF + j * PITCH;
// Block (i, j) centre: the square between streets i, i+1 and j, j+1.
export const blockX = (i) => streetX(i) + PITCH / 2;
export const blockZ = (j) => streetZ(j) + PITCH / 2;

// The sea begins east of the promenade; the beach is the sand between them.
export const BEACH_X = HALF + 26;
export const SEA_X = HALF + 52;

// --- Zones (block indices with a job) --------------------------------------------
// docks: the Muelle 9 container yard, north-east. marina: the Marina Crew's basin,
// south-east. park: Plaza Verde. bank: Banco Solara, dead centre. hideout: Nico's
// garage, south-west corner. cafe: where Sol Marín holds court, by the marina.
export const ZONES = {
  docks: { i: [6, 7], j: [0, 1] },
  marina: { i: [6, 7], j: [7, 7] },
  park: { i: [2], j: [4] },
  bank: { i: [4], j: [4] },
  hideout: { i: [0], j: [7] },
  cafe: { i: [5], j: [6] },
};
export const zoneAt = (i, j) => {
  for (const [name, z] of Object.entries(ZONES)) {
    if (z.i.includes(i) && z.j.includes(j)) return name;
  }
  return null;
};

// --- Palette ---------------------------------------------------------------------
export const COLORS = {
  sky: 0xffb37a,
  fog: 0xf7a56b,
  sun: 0xffd9a0,
  asphalt: 0x3c3f46,
  sidewalk: 0xb8a88f,
  sand: 0xeed9a4,
  sea: 0x2e7f9e,
  grass: 0x69a84f,
  plaza: 0xd9c49a,
  palmTrunk: 0x8a6844,
  palmLeaf: 0x3f9e4d,
  copBody: 0xf2f4f6,
  copTrim: 0x1d4e89,
  taxi: 0xffc933,
};

// Car paint the traffic system and the parked cars share.
export const CAR_PAINTS = [
  0xd94f3d, 0x3d7bd9, 0xf2e3c9, 0x59b06a, 0xe8e8ec, 0x2b2f36, 0xff8c42, 0x9b59b6,
  0x17a398, 0xc0c6ce, 0x74563c, 0xff5d8f,
];

// Shopfront names painted onto facades by the texture painter. All Solara's own.
export const SHOP_NAMES = [
  'CAFÉ SOL', 'HOTEL BRISA', 'FARO LICORES', 'PANADERÍA LUZ', 'TALLER NICO',
  'MARINA CLUB', 'FARMACIA VIDA', 'HELADOS OLA', 'BANCO SOLARA', 'GIMNASIO ARENA',
  'LIBROS MAREA', 'SUSHI FARO', 'FLORISTERÍA', 'ÓPTICA CLARA', 'DISCOS VINILO',
  'PIZZA MUELLE', 'BANCO SOLARA', 'JOYERÍA PERLA', 'CINE FARO', 'MERCADO CENTRAL',
];

// --- The story -------------------------------------------------------------------
export const STORY = {
  hero: 'Nico Vega',
  fixer: 'Sol Marín',
  crew: 'the Marina Crew',
  debt: 10000,
  // Mission rewards, in order; they sum past the debt so the last job clears it.
  rewards: [600, 1200, 1800, 2400, 4500],
  bustFine: 350,
  wastedFine: 250,
};

// Save slot key in localStorage.
export const SAVE_KEY = 'solara-heat-save-v1';
