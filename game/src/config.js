// Palm Vice — every tuning number and colour in one place.
// The world is a tile city rendered on a canvas that always fills the window; the simulation
// runs in fixed 1/60 s steps, so no rule below depends on the display's rate or size.

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;

/** Logical viewport the HUD layout is designed around; the renderer scales to the real window. */
export const VIEW = { width: 1280, height: 720 };

/** One city tile, in world pixels. Roads are two tiles wide, blocks five. */
export const TILE = 48;

/** Player on foot. */
export const WALK = {
  radius: 11,
  walkSpeed: 185,
  sprintSpeed: 305,
  accel: 1500,
  punchRange: 30,
  punchDamage: 34,
  maxHealth: 100,
};

/** Cars: shared physics; per-type numbers live in vehicles.js. */
export const DRIVE = {
  accel: 300,
  brake: 520,
  reverseMax: 95,
  grip: 8.5,
  turnRate: 2.6,
  width: 23,
  length: 42,
};

/** Wanted levels run 0..5 stars; heat is a float that stars are read from. */
export const HEAT = {
  maxStars: 5,
  /** Heat added by each crime. */
  stealCar: 1.0,
  hitPed: 1.6,
  killPed: 2.2,
  shotFired: 0.7,
  hitCopCar: 1.4,
  hitCivilCar: 0.35,
  bankJob: 3.0,
  /** Heat lost per second while no police unit can see the player. */
  decayPerSecond: 0.055,
  /** Distance at which a crime is witnessed and reported. */
  witnessRange: 300,
};

/** The PVPD response: how fast patrols run and how far out they join the chase. */
export const POLICE = {
  /** Patrol target speed before the per-star bonus; a stock coupe nearly matches it. */
  pursuitBase: 305,
  pursuitPerStar: 12,
  /** Patrol cars join the world this far from the player (world px), never in plain sight. */
  spawnMin: 560,
  spawnMax: 860,
};

/** The bright coastal palette: pastel blocks, turquoise water, hot sun. */
export const PALETTE = {
  water: '#2fb3c9',
  waterDeep: '#1f96ad',
  sand: '#f2ddab',
  promenade: '#e8e3d5',
  grass: '#79c25f',
  grassDark: '#63ad4c',
  sidewalk: '#d9d4c5',
  sidewalkEdge: '#b9b2a0',
  road: '#4a4a52',
  roadEdge: '#3a3a42',
  laneMark: '#f5eeda',
  crosswalk: '#e8e4da',
  lot: '#5d5d66',
  deck: '#b08954',
  plaza: '#e3d7bd',
  roofShadow: 'rgba(46, 32, 24, 0.28)',
  palmTrunk: '#8a6844',
  palmLeaf: '#3f9e4d',
  palmLeafDark: '#2f7d3c',
  text: '#ffffff',
  ink: '#20303a',
  accent: '#ff5d8f',
  accentAlt: '#ffb52e',
  cash: '#7dd069',
  danger: '#ff4747',
  copBlue: '#2e6ff2',
  panel: 'rgba(16, 26, 34, 0.72)',
  panelEdge: 'rgba(255, 255, 255, 0.16)',
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** localStorage keys for the save game and the settings the title screen keeps. */
export const SAVE_KEY = 'palm-vice.save.v1';
export const BEST_KEY = 'palm-vice.best.v1';
