// Pedestrians: Palm Vice's walkers. They stroll the sidewalks and the beach, chat in pairs,
// run from danger, drop their cash when they go down, and — importantly for a crime game —
// they see crimes and phone them in, which is how most wanted stars begin.
import { WALK } from './config.js';
import { clamp, dist, rngHelpers } from './random.js';

const SHIRTS = ['#ff8fab', '#ffd166', '#8ecae6', '#95d5b2', '#f4f1de', '#e07a5f', '#81b29a', '#cdb4db', '#ffc8dd', '#a2d2ff'];
const SKINS = ['#f2c9a0', '#c68863', '#8d5a3b', '#6e442a', '#ffd9b3'];

let nextPedId = 1;

export function createPed(rng, x, y) {
  const helpers = rngHelpers(rng);
  return {
    id: nextPedId++,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: helpers.range(0, Math.PI * 2),
    speed: helpers.range(52, 88),
    state: 'walk', // 'walk' | 'flee' | 'down' | 'phone'
    target: null,
    hp: 40,
    shirt: helpers.pick(SHIRTS),
    skin: helpers.pick(SKINS),
    walkPhase: helpers.range(0, 6),
    stateT: 0,
    downT: 0,
    reported: false,
  };
}

/** A fresh walker at a sidewalk point near the player. */
export function spawnPed(state, minD, maxD) {
  const p = state.city.randomSidewalkPoint(state.rng, state.player.x, state.player.y, minD, maxD);
  const ped = createPed(state.rng, p.x, p.y);
  ped.target = state.city.randomSidewalkPoint(state.rng, p.x, p.y, 60, 420);
  return ped;
}

/**
 * Advance one pedestrian. Danger is anything loud or fast nearby: a gunshot the world
 * recorded, a punch thrown, a car bearing down. Downed peds lie still, then fade.
 */
export function updatePed(state, ped, dt) {
  const city = state.city;
  ped.stateT += dt;
  if (ped.state === 'down') {
    ped.downT += dt;
    return;
  }
  // React: a scare sends them running; after a few calm seconds they slow back down.
  const threat = nearestThreat(state, ped);
  if (threat && ped.state !== 'flee') {
    ped.state = 'flee';
    ped.stateT = 0;
    ped.fleeFrom = threat;
  }
  let tx;
  let ty;
  let speed = ped.speed;
  if (ped.state === 'phone') {
    // Stopped to check a phone: stand still a few seconds, then stroll on.
    tx = ped.x;
    ty = ped.y;
    speed = 0;
    if (ped.stateT > 3) {
      ped.state = 'walk';
      ped.target = null;
    }
  } else if (ped.state === 'flee') {
    const from = ped.fleeFrom || state.player;
    const away = Math.atan2(ped.y - from.y, ped.x - from.x);
    tx = ped.x + Math.cos(away) * 120;
    ty = ped.y + Math.sin(away) * 120;
    speed = 235;
    if (ped.stateT > 3.2) {
      ped.state = 'walk';
      ped.target = null;
    }
  } else {
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
      if (ped.state === 'walk' && state.rng.chance(0.16)) {
        ped.state = 'phone';
        ped.stateT = 0;
      }
      ped.target = city.randomSidewalkPoint(state.rng, ped.x, ped.y, 80, 480);
    }
    tx = ped.target.x;
    ty = ped.target.y;
  }
  const want = Math.atan2(ty - ped.y, tx - ped.x);
  const dx = Math.cos(want) * speed;
  const dy = Math.sin(want) * speed;
  ped.vx += clamp(dx - ped.vx, -900 * dt, 900 * dt);
  ped.vy += clamp(dy - ped.vy, -900 * dt, 900 * dt);
  ped.x += ped.vx * dt;
  ped.y += ped.vy * dt;
  const fixed = city.collideCircle(ped.x, ped.y, 9, false);
  ped.x = fixed.x;
  ped.y = fixed.y;
  const moving = Math.hypot(ped.vx, ped.vy);
  if (moving > 12) {
    ped.angle = Math.atan2(ped.vy, ped.vx);
    ped.walkPhase += dt * moving * 0.055;
  }
}

/** The scariest nearby thing, or null: gunfire, a swung fist, a fast car, a police chase. */
function nearestThreat(state, ped) {
  for (const scare of state.scares) {
    if (dist(ped.x, ped.y, scare.x, scare.y) < scare.radius) return scare;
  }
  for (const car of state.cars) {
    if (Math.abs(car.speed) > 190 && dist(ped.x, ped.y, car.x, car.y) < 74) return car;
  }
  if (state.player.swingT > 0 && dist(ped.x, ped.y, state.player.x, state.player.y) < 60) return state.player;
  return null;
}

/** Knock a pedestrian down (car impact or a heavy hit). Returns true if newly downed. */
export function downPed(state, ped, source) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downT = 0;
  ped.hp = 0;
  state.events.push({ kind: 'ped-down', ped, source });
  return true;
}

/** Can this pedestrian see a point? Close, and no building in the way. */
export function canSee(state, ped, x, y, range) {
  if (dist(ped.x, ped.y, x, y) > range) return false;
  const steps = 6;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (state.city.solidForFoot(ped.x + (x - ped.x) * t, ped.y + (y - ped.y) * t)) return false;
  }
  return true;
}

export { WALK };
