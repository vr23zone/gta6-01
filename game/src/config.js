// Solara Heat — every shared number in one place: the city grid, the physics, the economy.
// Solara Bay is a square grid city: streets run along every GRID line, blocks sit between them,
// a beach and the sea close the south edge, and the docks fill the south-east corner.

/** Fixed simulation step, seconds. The loop never advances the world by any other amount. */
export const STEP = 1 / 60;

/** Street spacing: streets run along x and z equal to a multiple of this, from -EXTENT to EXTENT. */
export const GRID = 48;
/** The grid's half-extent: streets at -192, -144, ..., 0, ..., 144, 192. */
export const EXTENT = 192;
/** Half the street's width; the drivable asphalt runs this far either side of a grid line. */
export const ROAD_HALF = 8;
/** Sidewalk width beyond the asphalt; pedestrians walk its outer edge. */
export const WALK_HALF = 12.5;
/** South of this z the city ends: sand, then sea. */
export const BEACH_Z = 216;
/** The sea's near edge; the water plane runs from here to the horizon. */
export const SEA_Z = 246;

/** Player physics, on foot. */
export const PLAYER = {
  radius: 0.55,
  walkSpeed: 5.2,
  sprintSpeed: 8.6,
  accel: 40,
  maxHealth: 100,
  maxArmor: 100,
};

/** Arcade car physics, shared by the player's car, traffic and the police. */
export const CAR = {
  radius: 1.55,
  accel: 15.5,
  brake: 26,
  reverseMax: 9,
  drag: 0.55,
  gripTurn: 1.85,
  policeAccel: 17.5,
  policeTopBonus: 1.12,
};

/** Wanted tuning: how fast stars are earned, how the police answer, how they fade. */
export const WANTED = {
  max: 5,
  /** Seconds with no police eyes on the player before a star starts cooling down. */
  unseenGrace: 7,
  /** Seconds of staying unseen per star lost. */
  decayPerStar: 9,
  /** A police car this close to an on-foot player works on busting them. */
  bustRadius: 5.2,
  /** Seconds inside the bust radius, on foot, before the cuffs come out. */
  bustTime: 2.4,
};

/** The pistol the dock job hands over: magazine, damage, cadence. */
export const PISTOL = { mag: 12, damage: 34, cooldown: 0.24, range: 70, reloadTime: 1.1 };

/** Story money: the debt hanging over Nico, and what the hospital and the precinct take. */
export const ECONOMY = { debt: 10000, wastedFine: 0.1, bustedFine: 0.15 };

/** localStorage keys, versioned so a later build never reads an older save by accident. */
export const SAVE_KEY = 'solara-heat-save-v1';
