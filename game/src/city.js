// Palm Vice's city: a seeded grid of pastel blocks between a turquoise bay and the downtown
// core. This module lays out the tiles (roads, sidewalks, buildings, park, beach, marina),
// names the places the story uses, and answers the questions every other system asks:
// what is under this point, is it solid, where are the road lanes, where can things spawn.
import { TILE } from './config.js';
import { rngHelpers } from './random.js';

export const T_ROAD = 0;
export const T_SIDEWALK = 1;
export const T_BUILDING = 2;
export const T_GRASS = 3;
export const T_SAND = 4;
export const T_WATER = 5;
export const T_DECK = 6;
export const T_LOT = 7;
export const T_PLAZA = 8;

/** Blocks are 5 tiles, roads 2; the bay adds promenade, beach and water to the east. */
const BLOCK = 5;
const ROAD = 2;
const COLS = 8;
const ROWS = 6;
const GRID_W = COLS * BLOCK + (COLS + 1) * ROAD; // 58 tiles of city
const GRID_H = ROWS * BLOCK + (ROWS + 1) * ROAD; // 44 tiles
const PROM_W = 2;
const BEACH_W = 4;
const WATER_W = 6;
export const CITY_W = (GRID_W + PROM_W + BEACH_W + WATER_W) * TILE; // 3360 px
export const CITY_H = GRID_H * TILE; // 2112 px

const ROOF_COLORS = ['#f6e3c8', '#f2b8c6', '#bfe3dd', '#f9d976', '#c9d7f2', '#f4a988', '#e8e0f0', '#bfe8b0'];
const WALL_COLORS = ['#fdf3e0', '#ffe3ec', '#dff5ef', '#fff3c4', '#e3ecfd', '#ffe0d1', '#f3eafd', '#e6f7dc'];

/** The named places the story and the map use, in block coordinates (filled in below). */
function poi(name, kind, bx, by, label) {
  return { name, kind, bx, by, label, x: 0, y: 0 };
}

export function createCity(seed) {
  const rng = rngHelpers(seed);
  const tilesW = CITY_W / TILE;
  const tilesH = CITY_H / TILE;
  const tiles = new Uint8Array(tilesW * tilesH).fill(T_WATER);
  const buildings = [];
  const palms = [];
  const lamps = [];

  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= tilesW || ty >= tilesH ? T_WATER : tiles[ty * tilesW + tx]);
  const setTile = (tx, ty, t) => {
    tiles[ty * tilesW + tx] = t;
  };

  // Land mass: everything west of the water is ground; blocks decide what kind.
  for (let ty = 0; ty < tilesH; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) setTile(tx, ty, T_SIDEWALK);
    for (let tx = GRID_W; tx < GRID_W + PROM_W; tx += 1) setTile(tx, ty, T_SIDEWALK);
    for (let tx = GRID_W + PROM_W; tx < GRID_W + PROM_W + BEACH_W; tx += 1) setTile(tx, ty, T_SAND);
  }

  // Road bands: vertical roads at x tiles [k*7, k*7+1], horizontal the same in y.
  const vRoads = [];
  const hRoads = [];
  for (let k = 0; k <= COLS; k += 1) {
    const x0 = k * (BLOCK + ROAD);
    for (let ty = 0; ty < tilesH; ty += 1) {
      setTile(x0, ty, T_ROAD);
      setTile(x0 + 1, ty, T_ROAD);
    }
    vRoads.push({ x0: x0 * TILE, cx: (x0 + 1) * TILE });
  }
  for (let k = 0; k <= ROWS; k += 1) {
    const y0 = k * (BLOCK + ROAD);
    for (let tx = 0; tx < GRID_W + PROM_W; tx += 1) {
      setTile(tx, y0, T_ROAD);
      setTile(tx, y0 + 1, T_ROAD);
    }
    hRoads.push({ y0: y0 * TILE, cy: (y0 + 1) * TILE });
  }

  // The places the story needs, pinned to blocks so the map is the same every game.
  const pois = [
    poi('hideout', 'home', 0, 5, "Jett's Place"),
    poi('diner', 'mission', 1, 1, 'Coral Diner'),
    poi('garage', 'garage', 2, 4, "Marisol's Garage"),
    poi('bank', 'bank', 3, 3, 'Palmetto Bank'),
    poi('armory', 'shop', 4, 1, 'Vice Armory'),
    poi('station', 'police', 6, 0, 'PVPD Station'),
    poi('hotel', 'hotel', 7, 2, 'Seabreeze Hotel'),
    poi('hospital', 'hospital', 5, 5, 'St. Coral Hospital'),
    poi('marina', 'marina', 7, 5, 'Palm Marina'),
  ];
  const poiByKind = {};
  for (const p of pois) poiByKind[p.kind] = p;
  const specialBlock = new Map(pois.map((p) => [`${p.bx},${p.by}`, p]));

  // Blocks: perimeter sidewalk, then an interior that is a tower, two slabs, a park, a lot
  // or a plaza, decided by the seeded rng — except the story blocks, which are fixed.
  for (let by = 0; by < ROWS; by += 1) {
    for (let bx = 0; bx < COLS; bx += 1) {
      const tx0 = bx * (BLOCK + ROAD) + ROAD;
      const ty0 = by * (BLOCK + ROAD) + ROAD;
      const special = specialBlock.get(`${bx},${by}`);
      const buildingsBefore = buildings.length;
      let kind = 'tower';
      if (special) kind = special.kind === 'marina' ? 'lot' : 'tower';
      else {
        const roll = rng.next();
        kind = roll < 0.52 ? 'tower' : roll < 0.68 ? 'split' : roll < 0.8 ? 'park' : roll < 0.9 ? 'lot' : 'plaza';
      }
      const ix = tx0 + 1;
      const iy = ty0 + 1; // interior is 3x3 tiles
      if (kind === 'tower' || special) {
        addBuilding(buildings, rng, ix, iy, 3, 3, special ? special.label : null);
        if (special) {
          special.x = (ix + 1.5) * TILE;
          special.y = (iy + 3) * TILE + 14;
        }
      } else if (kind === 'split') {
        addBuilding(buildings, rng, ix, iy, 3, 1, null);
        addBuilding(buildings, rng, ix, iy + 2, 3, 1, null);
        for (let t = 0; t < 3; t += 1) setTile(ix + t, iy + 1, T_SIDEWALK);
      } else if (kind === 'park') {
        for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setTile(ix + x, iy + y, T_GRASS);
      } else if (kind === 'lot') {
        for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setTile(ix + x, iy + y, T_LOT);
      } else {
        for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) setTile(ix + x, iy + y, T_PLAZA);
      }
      // Every building placed on this block makes its footprint solid.
      for (let i = buildingsBefore; i < buildings.length; i += 1) {
        const b = buildings[i];
        for (let ty = Math.floor(b.y / TILE); ty < Math.floor((b.y + b.h) / TILE); ty += 1) {
          for (let tx = Math.floor(b.x / TILE); tx < Math.floor((b.x + b.w) / TILE); tx += 1) setTile(tx, ty, T_BUILDING);
        }
      }
      // Palms on the block's sunny corners, lamps along its road edges.
      for (const [px, py] of [[tx0, ty0], [tx0 + BLOCK - 1, ty0], [tx0, ty0 + BLOCK - 1], [tx0 + BLOCK - 1, ty0 + BLOCK - 1]]) {
        if (rng.chance(0.55)) palms.push({ x: (px + 0.5) * TILE + rng.range(-8, 8), y: (py + 0.5) * TILE + rng.range(-8, 8), s: rng.range(0.8, 1.25) });
      }
      if (kind === 'park') {
        for (let i = 0; i < 5; i += 1) palms.push({ x: (ix + rng.next() * 3) * TILE, y: (iy + rng.next() * 3) * TILE, s: rng.range(0.9, 1.4) });
      }
      lamps.push({ x: tx0 * TILE - 6, y: ty0 * TILE - 6 });
      lamps.push({ x: (tx0 + BLOCK) * TILE + 6, y: (ty0 + BLOCK) * TILE + 6 });
    }
  }

  // The marina: a wooden pier reaching into the bay near the south-east corner.
  const pierY = Math.floor((hRoads[ROWS].cy + 3 * TILE) / TILE);
  for (let tx = GRID_W + 1; tx < tilesW - 1; tx += 1) {
    setTile(tx, pierY, T_DECK);
    setTile(tx, pierY + 1, T_DECK);
  }
  const marina = poiByKind.marina;
  marina.x = (GRID_W + PROM_W + BEACH_W + 2) * TILE;
  marina.y = (pierY + 1) * TILE;

  // Beach palms in a loose line along the sand.
  for (let ty = 2; ty < tilesH - 2; ty += 2) {
    if (rng.chance(0.7)) palms.push({ x: (GRID_W + PROM_W + 1 + rng.next() * 2) * TILE, y: ty * TILE + rng.range(0, 30), s: rng.range(0.9, 1.5) });
  }

  // Building tiles are solid; everything else can be walked. Cars may not enter water or
  // buildings; the deck and the lot are drivable, the park and plaza are not (for cars).
  function tileAtPoint(x, y) {
    return tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  }
  function solidForFoot(x, y) {
    const t = tileAtPoint(x, y);
    return t === T_BUILDING || t === T_WATER;
  }
  function solidForCar(x, y) {
    const t = tileAtPoint(x, y);
    return t === T_BUILDING || t === T_WATER || t === T_GRASS || t === T_PLAZA || t === T_SAND;
  }

  /** Slide a circle out of solid tiles: returns the corrected position. */
  function collideCircle(x, y, r, forCar) {
    const solid = forCar ? solidForCar : solidForFoot;
    for (let pass = 0; pass < 2; pass += 1) {
      const minTx = Math.floor((x - r) / TILE);
      const maxTx = Math.floor((x + r) / TILE);
      const minTy = Math.floor((y - r) / TILE);
      const maxTy = Math.floor((y + r) / TILE);
      for (let ty = minTy; ty <= maxTy; ty += 1) {
        for (let tx = minTx; tx <= maxTx; tx += 1) {
          if (!solid(tx * TILE + TILE / 2, ty * TILE + TILE / 2)) continue;
          const nx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE));
          const ny = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
          const dx = x - nx;
          const dy = y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            x = nx + (dx / d) * r;
            y = ny + (dy / d) * r;
          } else {
            // Centre inside the tile: push out along the smallest penetration.
            const left = x - tx * TILE;
            const right = tx * TILE + TILE - x;
            const top = y - ty * TILE;
            const bottom = ty * TILE + TILE - y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) x = tx * TILE - r;
            else if (m === right) x = tx * TILE + TILE + r;
            else if (m === top) y = ty * TILE - r;
            else y = ty * TILE + TILE + r;
          }
        }
      }
    }
    return { x, y };
  }

  /** A random point on a road lane, `near` a centre and within [minD, maxD] of it. */
  function randomRoadPoint(rng2, cx, cy, minD, maxD) {
    for (let tries = 0; tries < 24; tries += 1) {
      const v = vRoads[rng2.int(0, vRoads.length - 1)];
      const h = hRoads[rng2.int(0, hRoads.length - 1)];
      const onVertical = rng2.chance(0.5);
      const x = onVertical ? v.cx + rng2.pick([-13, 13]) : rng2.range(TILE, CITY_W - TILE * 8);
      const y = onVertical ? rng2.range(TILE, CITY_H - TILE) : h.cy + rng2.pick([-13, 13]);
      const d = Math.hypot(x - cx, y - cy);
      if (d >= minD && d <= maxD) return { x, y };
    }
    return { x: vRoads[2].cx + 13, y: hRoads[2].cy };
  }

  /** A random sidewalk point near a centre, for pedestrians to appear at. */
  function randomSidewalkPoint(rng2, cx, cy, minD, maxD) {
    for (let tries = 0; tries < 30; tries += 1) {
      const x = cx + rng2.range(-maxD, maxD);
      const y = cy + rng2.range(-maxD, maxD);
      const t = tileAtPoint(x, y);
      const d = Math.hypot(x - cx, y - cy);
      if ((t === T_SIDEWALK || t === T_PLAZA || t === T_SAND || t === T_DECK) && d >= minD) return { x, y };
    }
    return { x: poiByKind.home.x, y: poiByKind.home.y };
  }

  return {
    tilesW,
    tilesH,
    tileAt,
    tileAtPoint,
    buildings,
    palms,
    lamps,
    vRoads,
    hRoads,
    pois,
    poiByKind,
    solidForFoot,
    solidForCar,
    collideCircle,
    randomRoadPoint,
    randomSidewalkPoint,
    width: CITY_W,
    height: CITY_H,
  };
}

function addBuilding(list, rng, tx, ty, wTiles, hTiles, label) {
  const wall = rng.pick(WALL_COLORS);
  const roof = rng.pick(ROOF_COLORS);
  list.push({
    x: tx * TILE,
    y: ty * TILE,
    w: wTiles * TILE,
    h: hTiles * TILE,
    height: rng.int(14, 52),
    wall,
    roof,
    label,
    acUnits: rng.int(0, 3),
    seed: rng.int(0, 9999),
  });
  return list[list.length - 1];
}

/** Intersections of the road grid, for traffic decisions and the minimap. */
export function intersections(city) {
  const points = [];
  for (const v of city.vRoads) for (const h of city.hRoads) points.push({ x: v.cx, y: h.cy });
  return points;
}
