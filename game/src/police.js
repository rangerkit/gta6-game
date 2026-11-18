// The Palm Vice Police Department: a wanted level that rises when crimes are witnessed and
// fades when the player breaks line of sight, patrol cars that hunt, ram and box the player
// in, and foot officers who pile out when their car gets close to a runner on foot.
import { HEAT, POLICE } from './config.js';
import { clamp, dist, rngHelpers } from './random.js';
import { createCar, placeOnRoad, steerAndMove } from './vehicles.js';

/** Stars shown for a heat value: any heat at all is one star, five is the ceiling. */
export function starsOf(heat) {
  if (heat <= 0.01) return 0;
  return Math.min(HEAT.maxStars, Math.ceil(heat - 0.001));
}

/**
 * Record a crime. It only raises heat when someone saw it: a pedestrian or officer within
 * witness range with a clear view. Unwitnessed crimes are free — that is the stealth game.
 */
export function reportCrime(state, amount, x, y) {
  let witnessed = state.stars >= 1 && nearestCopDistance(state, x, y) < HEAT.witnessRange;
  if (!witnessed) {
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < HEAT.witnessRange) {
        witnessed = true;
        break;
      }
    }
  }
  if (witnessed) {
    state.heat = clamp(state.heat + amount, 0, HEAT.maxStars + 0.9);
    state.lastCrimeT = state.time;
  }
  return witnessed;
}

export function nearestCopDistance(state, x, y) {
  let best = Infinity;
  for (const cop of state.cops) best = Math.min(best, dist(x, y, cop.x, cop.y));
  for (const cop of state.footCops) best = Math.min(best, dist(x, y, cop.x, cop.y));
  return best;
}

/** Can any officer currently see the player? Drives both heat decay and the bust rules. */
export function policeSeePlayer(state) {
  const p = state.player;
  for (const cop of state.cops) {
    if (dist(cop.x, cop.y, p.x, p.y) < 430 && lineClear(state, cop.x, cop.y, p.x, p.y)) return true;
  }
  for (const cop of state.footCops) {
    if (dist(cop.x, cop.y, p.x, p.y) < 300 && lineClear(state, cop.x, cop.y, p.x, p.y)) return true;
  }
  return false;
}

function lineClear(state, ax, ay, bx, by) {
  const steps = 8;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (state.city.solidForFoot(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/**
 * The wanted system itself: keep the patrol strength matched to the stars, decay heat
 * while unseen, and clear the slate entirely once the heat is gone.
 */
export function updateWanted(state, dt) {
  const stars = starsOf(state.heat);
  state.stars = stars;
  if (stars === 0) {
    state.heat = 0;
    despawnDistantPolice(state);
    return;
  }
  if (!policeSeePlayer(state)) {
    state.heat = Math.max(0, state.heat - HEAT.decayPerSecond * dt * (state.player.inCar ? 1 : 1.5));
    if (state.heat <= 0.01) {
      state.heat = 0;
      state.events.push({ kind: 'heat-cleared' });
    }
  }
  const wantedCars = Math.min(2 + stars, 7);
  const copCars = state.cops.filter((c) => dist(c.x, c.y, state.player.x, state.player.y) < 1100).length;
  state.copSpawnT -= dt;
  if (copCars < wantedCars && state.copSpawnT <= 0) {
    spawnCopCar(state);
    state.copSpawnT = 1.4;
  }
  despawnDistantPolice(state);
}

function despawnDistantPolice(state) {
  const p = state.player;
  state.cops = state.cops.filter((cop) => {
    const keep = dist(cop.x, cop.y, p.x, p.y) < 1400;
    if (!keep) state.cars = state.cars.filter((c) => c !== cop);
    return keep;
  });
  state.footCops = state.footCops.filter((cop) => dist(cop.x, cop.y, p.x, p.y) < 900);
}

export function spawnCopCar(state) {
  const cop = createCar(state.rng, 'patrol', 0, 0, 0, 'cop');
  if (placeOnRoad(state.city, state.rng, cop, state.player.x, state.player.y, POLICE.spawnMin, POLICE.spawnMax)) {
    cop.cruise = 300;
    state.cars.push(cop);
    state.cops.push(cop);
    state.events.push({ kind: 'cop-spawn', cop });
  }
}

/**
 * Drive one patrol car at the player: aim where the player is heading, ram rather than
 * brake, and back up when a wall or a wreck wedges it. At three stars and up, a stopped
 * patrol near a player on foot sends its officer out on foot.
 */
export function updateCopCar(state, car, dt) {
  const p = state.player;
  const lead = clamp(dist(car.x, car.y, p.x, p.y) / 300, 0, 0.8);
  const tx = p.x + (p.inCar ? Math.cos(p.car.angle) * p.car.speed * lead : p.vx * lead);
  const ty = p.y + (p.inCar ? Math.sin(p.car.angle) * p.car.speed * lead : p.vy * lead);
  let want = Math.atan2(ty - car.y, tx - car.x);
  let targetSpeed = POLICE.pursuitBase + state.stars * POLICE.pursuitPerStar;
  car.stuckT = Math.abs(car.speed) < 14 && dist(car.x, car.y, p.x, p.y) > 90 ? car.stuckT + dt : 0;
  if (car.stuckT > 0.7) car.reverseT = 0.55;
  if (car.reverseT > 0) {
    car.reverseT -= dt;
    want = Math.atan2(car.y - ty, car.x - tx);
    targetSpeed = -120;
  }
  const result = steerAndMove(state, car, dt, want, targetSpeed, 2.4);
  if (result.crashed && result.hitCar === p.car) state.events.push({ kind: 'cop-ram', car });
  // Officer out: player on foot, patrol close and slow, and none out already from this car.
  if (!p.inCar && state.stars >= 1 && dist(car.x, car.y, p.x, p.y) < 95 && Math.abs(car.speed) < 40 && !car.officerOut && state.footCops.length < 4) {
    car.officerOut = true;
    state.footCops.push(createFootCop(car.x + 14, car.y + 10, car));
    state.events.push({ kind: 'officer-out', car });
  }
  if (car.hp <= 0 && car.driver !== 'wreck') {
    car.driver = 'wreck';
    state.events.push({ kind: 'cop-wrecked', car });
  }
}

export function createFootCop(x, y, car) {
  return { x, y, vx: 0, vy: 0, angle: 0, walkPhase: 0, car, shootT: 1.2, state: 'chase' };
}

/** Foot officers run the player down; in a car the player is chased back to the patrol. */
export function updateFootCop(state, cop, dt) {
  const p = state.player;
  let tx = p.x;
  let ty = p.y;
  let speed = 252;
  if (p.inCar) {
    tx = cop.car ? cop.car.x : p.x;
    ty = cop.car ? cop.car.y : p.y;
    speed = 235;
    if (cop.car && dist(cop.x, cop.y, cop.car.x, cop.car.y) < 22) {
      cop.state = 'returned';
      if (cop.car) cop.car.officerOut = false;
      return;
    }
  }
  const want = Math.atan2(ty - cop.y, tx - cop.x);
  cop.vx += clamp(Math.cos(want) * speed - cop.vx, -1100 * dt, 1100 * dt);
  cop.vy += clamp(Math.sin(want) * speed - cop.vy, -1100 * dt, 1100 * dt);
  cop.x += cop.vx * dt;
  cop.y += cop.vy * dt;
  const fixed = state.city.collideCircle(cop.x, cop.y, 9, false);
  cop.x = fixed.x;
  cop.y = fixed.y;
  const moving = Math.hypot(cop.vx, cop.vy);
  if (moving > 12) {
    cop.angle = Math.atan2(cop.vy, cop.vx);
    cop.walkPhase += dt * moving * 0.055;
  }
  cop.shootT -= dt;
}

/** Bust pressure: 0..1, how close the law is to ending the chase right now. */
export function bustPressure(state) {
  const p = state.player;
  let pressure = 0;
  if (p.inCar && Math.abs(p.car.speed) > 26) return 0;
  for (const cop of state.footCops) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < 30) pressure = Math.max(pressure, 1 - d / 30);
  }
  if (!p.inCar) {
    for (const cop of state.cops) {
      const d = dist(cop.x, cop.y, p.x, p.y);
      if (d < 44 && Math.abs(cop.speed) < 30) pressure = Math.max(pressure, 0.8 * (1 - d / 44));
    }
  }
  return pressure;
}

export { rngHelpers };
