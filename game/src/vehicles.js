// Cars: the types Palm Vice drives, the traffic that follows the road grid lane by lane,
// and the arcade driving physics the player, the traffic and the police all share.
import { DRIVE } from './config.js';
import { angleDelta, clamp, dist, rngHelpers, turnToward } from './random.js';
import { T_LOT } from './city.js';

/** dir indices: 0 north, 1 east, 2 south, 3 west. Heading and right-hand vectors per dir. */
export const DIRS = [
  { x: 0, y: -1, rx: 1, ry: 0 },
  { x: 1, y: 0, rx: 0, ry: 1 },
  { x: 0, y: 1, rx: -1, ry: 0 },
  { x: -1, y: 0, rx: 0, ry: -1 },
];
const LANE = 13;
export const PITCH = 7 * 48;

export const CAR_TYPES = {
  sedan: { label: 'Marlin Sedan', maxSpeed: 265, accel: 1.0, colors: ['#e8e8ec', '#c23b4e', '#3e6fb0', '#57a773', '#e0a32e', '#7a4f9d'] },
  coupe: { label: 'Vireo Coupe', maxSpeed: 330, accel: 1.25, colors: ['#ff5d8f', '#ffb52e', '#29c7d8', '#e33e2b', '#f2f2f2'] },
  wagon: { label: 'Hauler Wagon', maxSpeed: 235, accel: 0.9, colors: ['#9db4c0', '#6b7f59', '#b08954', '#546e7a'] },
  van: { label: 'Cargo Van', maxSpeed: 215, accel: 0.85, colors: ['#f0ead8', '#d8d8d8', '#88a0b8', '#c96f2e'] },
  taxi: { label: 'Vice Cab', maxSpeed: 275, accel: 1.05, colors: ['#ffc61a'] },
  patrol: { label: 'PVPD Patrol', maxSpeed: 320, accel: 1.2, colors: ['#20303e'] },
};

let nextCarId = 1;

export function createCar(rng, type, x, y, angle, driver) {
  const def = CAR_TYPES[type];
  const helpers = rngHelpers(rng.next ? rng.next : rng);
  return {
    id: nextCarId++,
    type,
    label: def.label,
    color: type === 'patrol' ? def.colors[0] : helpers.pick(def.colors),
    x,
    y,
    angle,
    speed: 0,
    driver, // 'traffic' | 'parked' | 'player' | 'cop' | 'mission'
    hp: 100,
    dir: 0,
    vi: 0,
    hi: 0,
    wp: null,
    cruise: def.maxSpeed * helpers.range(0.42, 0.6),
    honkT: 0,
    stuckT: 0,
    smokeT: 0,
  };
}

/** Parked cars fill the parking lots; a few are the story's stealable rides. */
export function spawnParkedCars(city, rng) {
  const helpers = rngHelpers(rng);
  const cars = [];
  for (let ty = 0; ty < city.tilesH; ty += 1) {
    for (let tx = 0; tx < city.tilesW; tx += 1) {
      if (city.tileAt(tx, ty) !== T_LOT) continue;
      if (!helpers.chance(0.16)) continue;
      const x = tx * 48 + 24 + helpers.range(-6, 6);
      const y = ty * 48 + 24 + helpers.range(-6, 6);
      if (cars.some((c) => dist(c.x, c.y, x, y) < 52)) continue;
      const type = helpers.pick(['sedan', 'sedan', 'coupe', 'wagon', 'van']);
      cars.push(createCar(rng, type, x, y, helpers.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'parked'));
    }
  }
  return cars;
}

/** Put a traffic car on the road grid, aimed at its first intersection. */
export function placeOnRoad(city, rng, car, cx, cy, minD, maxD) {
  const helpers = rngHelpers(rng);
  for (let tries = 0; tries < 30; tries += 1) {
    const vi = helpers.int(0, city.vRoads.length - 1);
    const hi = helpers.int(0, city.hRoads.length - 1);
    const dir = helpers.int(0, 3);
    const vx = city.vRoads[vi].cx;
    const hy = city.hRoads[hi].cy;
    // Start mid-block on the correct lane for the heading.
    const along = helpers.range(90, PITCH - 90);
    const d = DIRS[dir];
    let x;
    let y;
    if (dir === 0 || dir === 2) {
      x = vx + d.rx * LANE;
      y = hy - d.y * along;
    } else {
      x = vx - d.x * along;
      y = hy + d.ry * LANE;
    }
    if (Math.hypot(x - cx, y - cy) < minD || Math.hypot(x - cx, y - cy) > maxD) continue;
    car.x = x;
    car.y = y;
    car.angle = Math.atan2(d.y, d.x);
    car.dir = dir;
    // The intersection it is heading for:
    car.vi = dir === 1 ? vi + 1 : dir === 3 ? vi - 1 : vi;
    car.hi = dir === 2 ? hi + 1 : dir === 0 ? hi - 1 : hi;
    car.vi = clamp(car.vi, 0, city.vRoads.length - 1);
    car.hi = clamp(car.hi, 0, city.hRoads.length - 1);
    car.wp = laneTarget(city, car);
    return true;
  }
  return false;
}

/** The point a car with its heading aims at on the intersection it approaches. */
function laneTarget(city, car) {
  const vx = city.vRoads[car.vi].cx;
  const hy = city.hRoads[car.hi].cy;
  const d = DIRS[car.dir];
  return { x: vx + d.rx * LANE, y: hy + d.ry * LANE };
}

/** Choose what a traffic car does at the intersection it just reached. */
function chooseAtIntersection(city, rng, car) {
  const helpers = rngHelpers(rng);
  const options = [];
  const d = DIRS[car.dir];
  // Straight on: the next intersection in the heading.
  const svi = car.vi + d.x;
  const shi = car.hi + d.y;
  if (svi >= 0 && svi < city.vRoads.length && shi >= 0 && shi < city.hRoads.length) options.push({ kind: 'straight', w: 5 });
  const leftDir = (car.dir + 3) % 4;
  const rightDir = (car.dir + 1) % 4;
  options.push({ kind: 'right', dir: rightDir, w: 3 });
  options.push({ kind: 'left', dir: leftDir, w: 2 });
  let total = 0;
  for (const o of options) total += o.w;
  let roll = rng.next() * total;
  let chosen = options[0];
  for (const o of options) {
    roll -= o.w;
    if (roll <= 0) {
      chosen = o;
      break;
    }
  }
  const vx = city.vRoads[car.vi].cx;
  const hy = city.hRoads[car.hi].cy;
  if (chosen.kind === 'straight') {
    car.vi = svi;
    car.hi = shi;
    car.wp = laneTarget(city, car);
    car.turnWp = null;
  } else {
    const nd = DIRS[chosen.dir];
    // The corner point of the turn: the car's own lane offset, plus one lane across the
    // intersection toward the side it turns to. From there the new lane target takes over.
    car.turnWp = {
      x: vx + (d.rx + (chosen.kind === 'right' ? -d.y : d.y)) * LANE,
      y: hy + (d.ry + (chosen.kind === 'right' ? d.x : -d.x)) * LANE,
    };
    car.pendingDir = chosen.dir;
    car.pendingVi = car.vi + nd.x;
    car.pendingHi = car.hi + nd.y;
    car.wp = car.turnWp;
  }
  return helpers;
}

/**
 * Advance one traffic car: follow waypoints, keep the lane, brake for anything ahead.
 * Returns events via state.events (crashes are resolved in world.js).
 */
export function updateTrafficCar(state, car, dt) {
  const city = state.city;
  if (!car.wp) {
    placeOnRoad(city, state.rng, car, state.player.x, state.player.y, 0, 4000);
    return;
  }
  const toWp = Math.hypot(car.wp.x - car.x, car.wp.y - car.y);
  if (toWp < 30) {
    if (car.turnWp && car.wp === car.turnWp) {
      car.dir = car.pendingDir;
      car.vi = clamp(car.pendingVi, 0, city.vRoads.length - 1);
      car.hi = clamp(car.pendingHi, 0, city.hRoads.length - 1);
      car.turnWp = null;
      car.wp = laneTarget(city, car);
    } else {
      chooseAtIntersection(city, state.rng, car);
    }
  }
  const want = Math.atan2(car.wp.y - car.y, car.wp.x - car.x);
  const ahead = obstacleAhead(state, car, 58);
  let throttle = 1;
  if (ahead) throttle = ahead.dist < 30 ? -0.6 : 0;
  // Held up in traffic? Palm Vice drivers lean on the horn.
  car.honkT -= dt;
  if (ahead && car.speed > 40 && car.honkT <= 0 && state.rng.chance(0.45)) {
    state.events.push({ kind: 'honk', x: car.x, y: car.y });
    car.honkT = state.rng.range(2.5, 6);
  }
  const targetSpeed = car.cruise * throttle;
  steerAndMove(state, car, dt, want, targetSpeed, 1.6);
}

/** Is there a car, the player on foot, or a pedestrian just ahead of this car? */
export function obstacleAhead(state, car, range) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let best = null;
  const consider = (x, y, r) => {
    const dx = x - car.x;
    const dy = y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 4 || along > range) return;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side > 15 + r) return;
    if (!best || along < best.dist) best = { dist: along };
  };
  for (const other of state.cars) {
    if (other === car || other.hp <= 0) continue;
    consider(other.x, other.y, 14);
  }
  if (!state.player.inCar) consider(state.player.x, state.player.y, 8);
  for (const ped of state.peds) {
    if (ped.state !== 'down') consider(ped.x, ped.y, 6);
  }
  return best;
}

/**
 * The shared arcade drive: steer the car's angle toward `wantAngle`, manage speed toward
 * the throttle's wish, move with axis-separated building collision, and report crashes
 * through the returned flags. `control` is {throttle: -1..1, steer: -1..1} for a driver,
 * or null when steering by target angle (traffic and police use steerAndMove).
 */
export function driveCar(state, car, dt, control) {
  const def = CAR_TYPES[car.type];
  const maxF = def.maxSpeed;
  if (control.throttle > 0) car.speed += DRIVE.accel * def.accel * control.throttle * dt;
  else if (control.throttle < 0) {
    if (car.speed > 8) car.speed -= DRIVE.brake * dt;
    else car.speed = Math.max(car.speed + DRIVE.accel * 0.7 * control.throttle * dt, -DRIVE.reverseMax);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 120 * dt);
  }
  car.speed -= car.speed * 0.35 * dt;
  car.speed = clamp(car.speed, -DRIVE.reverseMax, maxF);
  const steerAuthority = clamp(Math.abs(car.speed) / 90, 0, 1) * Math.sign(car.speed || 1);
  car.angle += control.steer * DRIVE.turnRate * steerAuthority * dt;
  return moveCar(state, car, dt);
}

/** Steer toward a target angle at a limited rate and ease speed toward a target. */
export function steerAndMove(state, car, dt, wantAngle, targetSpeed, turnRate) {
  car.angle = turnToward(car.angle, wantAngle, turnRate * dt * clamp(Math.abs(car.speed) / 60 + 0.35, 0.35, 1.15));
  const def = CAR_TYPES[car.type];
  if (car.speed < targetSpeed) car.speed = Math.min(car.speed + DRIVE.accel * def.accel * dt, targetSpeed);
  else car.speed = Math.max(car.speed - DRIVE.brake * dt, targetSpeed);
  car.speed -= car.speed * 0.2 * dt;
  return moveCar(state, car, dt);
}

/** Move a car and collide with the city and the other cars. Returns {crashed, crashSpeed}. */
export function moveCar(state, car, dt) {
  const city = state.city;
  const result = { crashed: false, crashSpeed: 0, hitCar: null };
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  // Axis-separated: try x, then y, testing the car's four corners each time.
  if (!carHitsCity(city, car, car.x + dx, car.y)) {
    car.x += dx;
  } else if (Math.abs(car.speed) > 30) {
    result.crashed = true;
    result.crashSpeed = Math.abs(car.speed);
    car.speed *= -0.18;
  } else car.speed = 0;
  if (!carHitsCity(city, car, car.x, car.y + dy)) {
    car.y += dy;
  } else if (Math.abs(car.speed) > 30) {
    result.crashed = true;
    result.crashSpeed = Math.abs(car.speed);
    car.speed *= -0.18;
  } else car.speed = 0;
  // Car against car: push apart and share the pain.
  for (const other of state.cars) {
    if (other === car) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d > 0.01 && d < 34) {
      const push = (34 - d) / 2;
      const nx = (car.x - other.x) / d;
      const ny = (car.y - other.y) / d;
      car.x += nx * push;
      car.y += ny * push;
      const rel = Math.abs(car.speed - other.speed);
      if (rel > 55) {
        result.crashed = true;
        result.crashSpeed = rel;
        result.hitCar = other;
        other.hp -= rel * 0.12;
        car.hp -= rel * 0.08;
      }
      other.speed = Math.max(other.speed * 0.6, car.speed * 0.4);
      car.speed *= 0.55;
    }
  }
  car.x = clamp(car.x, 20, city.width - 20);
  car.y = clamp(car.y, 20, city.height - 20);
  return result;
}

/** Do the car's corners touch a tile that is solid for cars? */
export function carHitsCity(city, car, x, y) {
  const c = Math.cos(car.angle);
  const s = Math.sin(car.angle);
  const hl = DRIVE.length / 2;
  const hw = DRIVE.width / 2;
  for (const [lx, ly] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0]]) {
    const wx = x + lx * c - ly * s;
    const wy = y + lx * s + ly * c;
    if (city.solidForCar(wx, wy)) return true;
  }
  return false;
}

/** The world-space point of a car's driver door, for enter/exit prompts. */
export function doorPoint(car) {
  const s = Math.sin(car.angle);
  const c = Math.cos(car.angle);
  return { x: car.x - s * 16, y: car.y + c * 16 };
}
