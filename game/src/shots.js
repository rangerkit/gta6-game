// The screenshot scenes behind ?shot=start|foot|drive|chase&seed=N. Each one builds a
// fresh world from the seed, stages the moment the shot is about — the title over a living
// street, a walk to the first job, a drive down the coast road, a three-star chase — and
// plays the real rules forward with a simple autopilot, so the frame is honest gameplay
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { clamp, dist } from './random.js';
import { createState, stepWorld } from './world.js';
import { createCar, obstacleAhead } from './vehicles.js';
import { spawnCopCar } from './police.js';
import { startMission } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './hud.js';

const NEUTRAL = { axes: { x: 0, y: 0 }, drive: { throttle: 0, steer: 0 }, sprint: false, attack: false, aimAngle: 0, interact: false };

function runSteps(state, seconds, pilot) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (state.player.dead) break;
    stepWorld(state, pilot ? pilot(state) : NEUTRAL, STEP);
    state.events.length = 0;
    state.sayQueue.length = Math.min(state.sayQueue.length, 2);
  }
}

/** Walk toward a point; returns the controls for this step. */
function walkPilot(tx, ty) {
  return (state) => {
    const p = state.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 26) return NEUTRAL;
    return {
      ...NEUTRAL,
      axes: { x: Math.abs(dx) > 8 ? Math.sign(dx) : 0, y: Math.abs(dy) > 8 ? Math.sign(dy) : 0 },
      sprint: d > 200,
      aimAngle: Math.atan2(dy, dx),
    };
  };
}

/** Drive toward a point with ordinary car controls: steer at it, ease off when close. */
function drivePilot(getTarget) {
  return (state) => {
    const car = state.player.car;
    if (!car) return NEUTRAL;
    const target = getTarget(state);
    const want = Math.atan2(target.y - car.y, target.x - car.x);
    let delta = want - car.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return {
      ...NEUTRAL,
      drive: { throttle: Math.abs(delta) > 2.2 ? -0.4 : 1, steer: Math.max(-1, Math.min(1, delta * 2.4)) },
    };
  };
}

/** A fleeing driver who stays on the roads: aim at the next intersection ahead, and at
 *  each junction take the exit that leads furthest from the nearest officer. */
function fleePilot() {
  let target = null;
  let swerve = 0;
  let stuckT = 0;
  let reverseT = 0;
  return (state) => {
    const car = state.player.car;
    if (!car) return NEUTRAL;
    const city = state.city;
    if (!target) {
      let best = null;
      let bestD = Infinity;
      for (let vi = 0; vi < city.vRoads.length; vi += 1) {
        for (let hi = 0; hi < city.hRoads.length; hi += 1) {
          const ix = city.vRoads[vi].cx;
          const iy = city.hRoads[hi].cy;
          const dx = ix - car.x;
          const dy = iy - car.y;
          const d = Math.hypot(dx, dy);
          const dot = d > 1 ? (dx * Math.cos(car.angle) + dy * Math.sin(car.angle)) / d : 0;
          if (dot > 0.5 && d < bestD) {
            bestD = d;
            best = { x: ix, y: iy, vi, hi };
          }
        }
      }
      target = best;
    }
    if (target && dist(car.x, car.y, target.x, target.y) < 72) {
      let bestNext = null;
      let bestScore = -Infinity;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const vi = target.vi + dx;
        const hi = target.hi + dy;
        if (vi < 0 || hi < 0 || vi >= city.vRoads.length || hi >= city.hRoads.length) continue;
        const nx = city.vRoads[vi].cx;
        const ny = city.hRoads[hi].cy;
        let copD = Infinity;
        for (const c of state.cops) copD = Math.min(copD, dist(nx, ny, c.x, c.y));
        if (copD > bestScore) {
          bestScore = copD;
          bestNext = { x: nx, y: ny, vi, hi };
        }
      }
      target = bestNext;
    }
    if (!target) {
      // At the map's edge with no junction ahead: fall back to a central intersection.
      const midV = city.vRoads[Math.floor(city.vRoads.length / 2)];
      const midH = city.hRoads[Math.floor(city.hRoads.length / 2)];
      target = { x: midV.cx, y: midH.cy, vi: Math.floor(city.vRoads.length / 2), hi: Math.floor(city.hRoads.length / 2) };
    }
    // Swerve around whatever blocks the lane instead of stopping for it — a fleeing
    // driver who brakes is a busted driver — and back out when truly wedged.
    const ahead = obstacleAhead(state, car, 60 + Math.abs(car.speed) * 0.45);
    if (ahead && ahead.dist < 64) swerve = swerve || (state.rng.chance(0.5) ? 34 : -34);
    else if (!ahead) swerve = 0;
    const aimX = target.x + -Math.sin(car.angle) * swerve;
    const aimY = target.y + Math.cos(car.angle) * swerve;
    const want = Math.atan2(aimY - car.y, aimX - car.x);
    let delta = want - car.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    let throttle = car.speed > 300 ? 0 : 1;
    if (ahead && ahead.dist < 26) throttle = 0.2;
    stuckT = Math.abs(car.speed) < 16 && throttle > 0 ? stuckT + STEP : 0;
    if (stuckT > 0.7) reverseT = 0.42;
    if (reverseT > 0) {
      reverseT -= STEP;
      return { ...NEUTRAL, drive: { throttle: -1, steer: delta > 0 ? -1 : 1 } };
    }
    return { ...NEUTRAL, drive: { throttle, steer: clamp(delta * 2.2, -1, 1) } };
  };
}

function putPlayerInCar(state, type, x, y, angle) {
  const car = createCar(state.rng, type, x, y, angle, 'player');
  state.cars.push(car);
  state.player.inCar = true;
  state.player.car = car;
  state.player.x = x;
  state.player.y = y;
  return car;
}

export function stageShot(name, seed) {
  const state = createState(seed);
  const city = state.city;
  const ui = { menuIndex: 0, hasSave: false, showHelp: false, prompt: null };
  if (name === 'foot') {
    // On foot downtown, first job on the books, the city moving around Jett: he walks
    // east along the avenue south of the Coral Diner, traffic and walkers all around.
    const diner = city.poiByKind.mission;
    state.player.x = diner.x - 120;
    state.player.y = diner.y + 90;
    state.player.money = 120;
    startMission(state);
    state.sayQueue.length = 0;
    // Two cars staged on the avenue itself, set up the way the traffic system drives
    // them (lane waypoint, heading, the junction ahead), so the frame always has
    // traffic in it: a cab rolling east, a sedan coming the other way.
    const avenueY = city.hRoads[2].cy;
    const east = createCar(state.rng, 'taxi', diner.x + 300, avenueY + 13, 0, 'traffic');
    east.dir = 1;
    east.vi = 4;
    east.hi = 2;
    east.wp = { x: city.vRoads[4].cx, y: avenueY + 13 };
    east.speed = east.cruise * 0.8;
    state.cars.push(east);
    const west = createCar(state.rng, 'sedan', diner.x + 1050, avenueY - 13, Math.PI, 'traffic');
    west.dir = 3;
    west.vi = 3;
    west.hi = 2;
    west.wp = { x: city.vRoads[3].cx, y: avenueY - 13 };
    west.speed = west.cruise * 0.8;
    state.cars.push(west);
    runSteps(state, 6.5, walkPilot(diner.x + 640, diner.y + 90));
    return { state, screen: SCREEN_PLAY, ui };
  }
  if (name === 'drive') {
    // Down the coast road in a coupe, in the southbound lane, the bay on the left.
    const coastX = city.vRoads[city.vRoads.length - 1].cx;
    const startY = city.hRoads[0].cy;
    state.cars = state.cars.filter((c) => c.driver !== 'traffic' || c.x < 2450);
    const car = putPlayerInCar(state, 'coupe', coastX - 13, startY + 210, Math.PI / 2);
    car.speed = 150;
    state.player.money = 890;
    const cruise = drivePilot(() => ({ x: coastX - 13, y: state.player.y + 500 }));
    runSteps(state, 6, (s) => {
      const controls = cruise(s);
      const myCar = s.player.car;
      if (myCar && myCar.speed > 215) controls.drive.throttle = 0;
      if (myCar && obstacleAhead(s, myCar, 84)) controls.drive.throttle = -0.4;
      return controls;
    });
    state.activity = null; // the frame tells the driving story, not a side offer
    return { state, screen: SCREEN_PLAY, ui };
  }
  if (name === 'chase') {
    // Three stars over downtown: patrols on the tail, stars lit, nowhere to hide.
    const vx = city.vRoads[4].cx;
    const hy = city.hRoads[2].cy;
    // Clear the civvies out of the chase corridor: this scene is Jett versus the PVPD.
    state.cars = state.cars.filter((c) => c.driver !== 'traffic' || dist(c.x, c.y, vx, hy) > 760);
    const car = putPlayerInCar(state, 'coupe', vx - 13, hy + 40, Math.PI / 2);
    car.speed = 175;
    state.player.money = 1640;
    state.player.hasPistol = true;
    state.heat = 2.7;
    for (let i = 0; i < 3; i += 1) {
      spawnCopCar(state);
      const cop = state.cops[state.cops.length - 1];
      if (cop) {
        cop.x = vx - 13;
        cop.y = hy - 150 - i * 95;
        cop.angle = Math.PI / 2;
        cop.speed = 170;
      }
    }
    runSteps(state, 6.5, fleePilot());
    state.activity = null; // the frame is the chase: stars, patrols, minimap blips
    return { state, screen: SCREEN_PLAY, ui };
  }
  // 'start' and anything else: the title over a living street corner.
  const diner = city.poiByKind.mission;
  state.player.x = diner.x - 60;
  state.player.y = diner.y + 130;
  runSteps(state, 4, null);
  return { state, screen: SCREEN_TITLE, ui };
}
