// The world: Palm Vice's whole simulation in one state object and one fixed-step update.
// City, traffic, pedestrians, police, combat and missions each own their rules in their
// own module; this one owns the player and the order things happen in, and turns what
// happened into events the shell (sound, banners, saves) reacts to.
import { HEAT, STEP, WALK } from './config.js';
import { clamp, createRandom, dist, rngHelpers } from './random.js';
import { createCity } from './city.js';
import { createCar, doorPoint, driveCar, placeOnRoad, spawnParkedCars, updateTrafficCar } from './vehicles.js';
import { createPed, downPed, spawnPed, updatePed } from './pedestrians.js';
import { bustPressure, reportCrime, updateCopCar, updateFootCop, updateWanted } from './police.js';
import { addScare, burst, playerAttack, updateBullets, updateCopShooting, updateParticles } from './combat.js';
import { canStartMission, getObjective, maintainActivityOffer, offerPoint, startMission, STORY, updateMissions } from './missions.js';
import { sfx } from './audio.js';

export function createState(seed) {
  const rng = rngHelpers(createRandom((seed ^ 0x9e3779b9) >>> 0));
  const city = createCity(rng.next);
  const home = city.poiByKind.home;
  const state = {
    seed,
    rng,
    city,
    time: 0,
    clockMin: 10 * 60 + 24, // the day starts mid-morning
    player: {
      x: home.x,
      y: home.y + 26,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: WALK.maxHealth,
      money: 120,
      inCar: false,
      car: null,
      hasPistol: false,
      attackT: 0,
      swingT: 0,
      lastHurtT: -99,
      bustT: 0,
      dead: null, // 'busted' | 'wasted'
    },
    cars: [],
    peds: [],
    cops: [],
    footCops: [],
    bullets: [],
    particles: [],
    scares: [],
    pickups: [],
    events: [],
    sayQueue: [],
    heat: 0,
    stars: 0,
    lastCrimeT: -99,
    copSpawnT: 0,
    spawnT: 0,
    mission: null,
    storyIndex: 0,
    storyDone: false,
    activity: null,
    stats: { missionsPassed: 0, bestRace: 0 },
    shake: 0,
  };
  state.cars.push(...spawnParkedCars(city, rng.next));
  // Opening traffic and walkers, so the city is alive from the first frame.
  for (let i = 0; i < 15; i += 1) {
    const car = createCar(rng, rng.pick(['sedan', 'sedan', 'coupe', 'wagon', 'van', 'taxi']), 0, 0, 0, 'traffic');
    if (placeOnRoad(city, rng, car, state.player.x, state.player.y, 200, 1500)) state.cars.push(car);
  }
  for (let i = 0; i < 16; i += 1) state.peds.push(spawnPed(state, 120, 700));
  return state;
}

/** Start a brand-new story: back to the hideout, pockets nearly empty, name unknown. */
export function newGame(state) {
  const home = state.city.poiByKind.home;
  const p = state.player;
  p.x = home.x;
  p.y = home.y + 26;
  p.vx = 0;
  p.vy = 0;
  p.hp = WALK.maxHealth;
  p.money = 120;
  p.inCar = false;
  p.car = null;
  p.hasPistol = false;
  p.dead = null;
  p.bustT = 0;
  state.heat = 0;
  state.stars = 0;
  state.mission = null;
  state.storyIndex = 0;
  state.storyDone = false;
  state.activity = null;
  clearPolice(state);
}

/** Put a loaded save back into the world (see save.js for the record's shape). */
export function applySave(state, data) {
  newGame(state);
  const p = state.player;
  p.money = data.money;
  p.hp = clamp(data.hp, 20, WALK.maxHealth);
  p.x = data.x;
  p.y = data.y;
  p.hasPistol = !!data.hasPistol;
  state.storyIndex = clamp(data.storyIndex, 0, STORY.length);
  state.storyDone = !!data.storyDone || state.storyIndex >= STORY.length;
  state.stats.missionsPassed = data.missionsPassed || 0;
  state.stats.bestRace = data.bestRace || 0;
  if (Number.isFinite(data.clockMin)) state.clockMin = ((data.clockMin % 1440) + 1440) % 1440;
  const fixed = state.city.collideCircle(p.x, p.y, WALK.radius, false);
  p.x = fixed.x;
  p.y = fixed.y;
}

function clearPolice(state) {
  for (const cop of state.cops) state.cars = state.cars.filter((c) => c !== cop);
  state.cops = [];
  state.footCops = [];
}

/** After a bust or a wasting: the fine, the respawn, the clean slate. */
export function respawnPlayer(state, kind) {
  const p = state.player;
  const at = kind === 'busted' ? state.city.poiByKind.police : state.city.poiByKind.hospital;
  const fine = Math.min(p.money, Math.max(40, Math.round(p.money * 0.12)));
  p.money -= fine;
  if (p.inCar && p.car) {
    p.car.driver = p.car.isMissionCar ? 'mission' : 'parked';
    p.inCar = false;
    p.car = null;
  }
  p.x = at.x;
  p.y = at.y + 10;
  p.vx = 0;
  p.vy = 0;
  p.hp = kind === 'busted' ? 65 : 75;
  p.dead = null;
  p.bustT = 0;
  state.heat = 0;
  state.stars = 0;
  if (state.mission) state.events.push({ kind: 'mission-failed', mission: state.mission.def, reason: kind === 'busted' ? 'Busted.' : 'Wasted.' });
  state.mission = null;
  clearPolice(state);
  state.events.push({ kind: 'respawn', fine });
}

/** What pressing F would do right now, for the HUD's prompt line; null when nothing. */
export function getInteractPrompt(state) {
  const p = state.player;
  if (p.inCar) return 'F — Get out';
  if (canStartMission(state)) return `F — Talk to Marisol: "${STORY[state.storyIndex].title}"`;
  const car = nearestEnterableCar(state);
  if (car) return car.driver === 'cop' ? 'F — Steal the patrol car (bad idea)' : `F — Drive the ${car.label}`;
  for (const kind of ['mission', 'hospital']) {
    const poi = state.city.poiByKind[kind];
    if (dist(p.x, p.y, poi.x, poi.y) < 44 && p.hp < WALK.maxHealth && p.money >= 15) return 'F — Eat and patch up ($15)';
  }
  return null;
}

function nearestEnterableCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 52;
  for (const car of state.cars) {
    if (car.hp <= 0 || car.driver === 'player') continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** The F key: talk, steal, eat, or climb out — in that order of importance. */
export function doInteract(state) {
  const p = state.player;
  if (p.inCar) {
    exitCar(state);
    return;
  }
  if (canStartMission(state)) {
    startMission(state);
    return;
  }
  const car = nearestEnterableCar(state);
  if (car) {
    enterCar(state, car);
    return;
  }
  for (const kind of ['mission', 'hospital']) {
    const poi = state.city.poiByKind[kind];
    if (dist(p.x, p.y, poi.x, poi.y) < 44 && p.hp < WALK.maxHealth && p.money >= 15) {
      p.money -= 15;
      p.hp = WALK.maxHealth;
      state.events.push({ kind: 'healed' });
      return;
    }
  }
}

function enterCar(state, car) {
  const p = state.player;
  const wasDriver = car.driver;
  if (wasDriver === 'traffic') {
    // The driver bails out and runs, and now there is a witness with a story.
    const ped = createPed(state.rng, car.x + 18, car.y + 8);
    ped.state = 'flee';
    ped.fleeFrom = p;
    state.peds.push(ped);
    reportCrime(state, HEAT.stealCar, car.x, car.y);
  } else if (wasDriver === 'parked') {
    reportCrime(state, HEAT.stealCar * 0.8, car.x, car.y);
  } else if (wasDriver === 'cop') {
    reportCrime(state, 1.6, car.x, car.y);
  }
  car.driver = 'player';
  p.inCar = true;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  state.events.push({ kind: 'enter-car', car });
  sfx.door();
}

function exitCar(state) {
  const p = state.player;
  const car = p.car;
  const door = doorPoint(car);
  const fixed = state.city.collideCircle(door.x, door.y, WALK.radius, false);
  p.x = fixed.x;
  p.y = fixed.y;
  p.vx = 0;
  p.vy = 0;
  p.inCar = false;
  p.car = null;
  car.driver = car.isMissionCar ? 'mission' : 'parked';
  state.events.push({ kind: 'exit-car', car });
  sfx.door();
}

/**
 * One fixed step of the whole city. `controls` is what main.js distilled from the input:
 * {axes, drive, sprint, attack, aimAngle, interact}.
 */
export function stepWorld(state, controls, dt = STEP) {
  const p = state.player;
  state.time += dt;
  state.clockMin = (state.clockMin + dt) % (24 * 60); // one game minute a second
  p.attackT = Math.max(0, p.attackT - dt);
  p.swingT = Math.max(0, p.swingT - dt);
  state.shake = Math.max(0, state.shake - dt * 2.2);

  if (p.dead) return;

  if (controls.interact) doInteract(state);

  if (p.inCar) stepDriving(state, controls, dt);
  else stepOnFoot(state, controls, dt);

  stepTraffic(state, dt);
  stepPeds(state, dt);
  stepPolice(state, dt);
  updateBullets(state, dt);
  updateCopShooting(state, dt);
  updateParticles(state, dt);
  updateMissions(state, dt);
  maintainActivityOffer(state);
  stepPickups(state, dt);
  maintainPopulation(state, dt);

  // Slow recovery once the shooting stops.
  if (state.time - p.lastHurtT > 6 && p.hp > 0) p.hp = Math.min(WALK.maxHealth, p.hp + 2.6 * dt);
  if (p.hp <= 0 && !p.dead) {
    p.dead = 'wasted';
    state.events.push({ kind: 'wasted' });
  }
}

function stepOnFoot(state, controls, dt) {
  const p = state.player;
  const speed = controls.sprint ? WALK.sprintSpeed : WALK.walkSpeed;
  const ax = controls.axes.x;
  const ay = controls.axes.y;
  const len = Math.hypot(ax, ay) || 1;
  p.vx += clamp((ax / len) * speed * (ax ? 1 : 0) - p.vx, -WALK.accel * dt, WALK.accel * dt);
  p.vy += clamp((ay / len) * speed * (ay ? 1 : 0) - p.vy, -WALK.accel * dt, WALK.accel * dt);
  if (!ax) p.vx *= 1 - Math.min(1, 10 * dt);
  if (!ay) p.vy *= 1 - Math.min(1, 10 * dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  const fixed = state.city.collideCircle(p.x, p.y, WALK.radius, false);
  p.x = fixed.x;
  p.y = fixed.y;
  if (controls.attack) {
    p.angle = controls.aimAngle;
    playerAttack(state, controls.aimAngle);
  } else if (Math.hypot(p.vx, p.vy) > 14) {
    p.angle = Math.atan2(p.vy, p.vx);
  }
}

function stepDriving(state, controls, dt) {
  const p = state.player;
  const car = p.car;
  const before = Math.abs(car.speed);
  const result = driveCar(state, car, dt, controls.drive);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (result.crashed) {
    state.events.push({ kind: 'crash', strength: result.crashSpeed, car });
    state.shake = Math.min(1, result.crashSpeed / 260);
    if (result.hitCar) {
      if (result.hitCar.driver === 'cop') reportCrime(state, HEAT.hitCopCar, car.x, car.y);
      else if (result.crashSpeed > 85) reportCrime(state, HEAT.hitCivilCar, car.x, car.y);
    }
  }
  // Running someone down is the loudest crime there is.
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 23 && Math.abs(car.speed) > 40) {
      if (Math.abs(car.speed) > 115) {
        downPed(state, ped, 'car');
        reportCrime(state, HEAT.killPed, ped.x, ped.y);
        burst(state, ped.x, ped.y, 8, '#e5534b', 140, 0.4, 2.6);
        car.speed *= 0.82;
      } else {
        ped.state = 'flee';
        ped.fleeFrom = car;
        ped.vx += (ped.x - car.x) * 6;
        ped.vy += (ped.y - car.y) * 6;
      }
    }
  }
  if (car.hp <= 0) {
    state.events.push({ kind: 'car-wrecked', car });
    exitCar(state);
    burst(state, car.x, car.y, 18, '#ffb52e', 160, 0.6, 3);
  }
  void before;
}

function stepTraffic(state, dt) {
  for (const car of state.cars) {
    if (car.driver === 'traffic') {
      if (car.hp <= 0) {
        car.driver = 'wreck';
        continue;
      }
      updateTrafficCar(state, car, dt);
    }
  }
  // Traffic runs people down too — rarely, and never the player's fault.
  for (const car of state.cars) {
    if (car.driver !== 'traffic' || Math.abs(car.speed) < 150) continue;
    for (const ped of state.peds) {
      if (ped.state !== 'down' && dist(ped.x, ped.y, car.x, car.y) < 22) downPed(state, ped, 'traffic');
    }
  }
}

function stepPeds(state, dt) {
  for (const ped of state.peds) updatePed(state, ped, dt);
  // The downed drop their cash once, fade, and are gone.
  for (const ped of state.peds) {
    if (ped.state === 'down' && !ped.cashDropped) {
      ped.cashDropped = true;
      if (state.rng.chance(0.65)) {
        state.pickups.push({ x: ped.x, y: ped.y, amount: state.rng.int(4, 26), t: 0 });
      }
    }
  }
  state.peds = state.peds.filter((ped) => ped.state !== 'down' || ped.downT < 7);
}

function stepPolice(state, dt) {
  updateWanted(state, dt);
  for (const cop of state.cops) {
    if (cop.driver === 'cop') updateCopCar(state, cop, dt);
  }
  state.cops = state.cops.filter((cop) => cop.driver === 'cop');
  for (const cop of state.footCops) updateFootCop(state, cop, dt);
  state.footCops = state.footCops.filter((cop) => cop.state !== 'returned');
  // The bust: pressure while the law is on top of a slow or foot-bound player.
  const p = state.player;
  if (state.stars > 0 && !p.dead) {
    const pressure = bustPressure(state);
    if (pressure > 0) {
      p.bustT += dt * (0.4 + pressure);
      if (p.bustT >= 1) {
        p.dead = 'busted';
        state.events.push({ kind: 'busted' });
      }
    } else p.bustT = Math.max(0, p.bustT - dt * 1.4);
  }
}

function stepPickups(state, dt) {
  const p = state.player;
  for (const pickup of state.pickups) {
    pickup.t += dt;
    if (dist(p.x, p.y, pickup.x, pickup.y) < (p.inCar ? 28 : 20)) {
      pickup.taken = true;
      p.money += pickup.amount;
      state.events.push({ kind: 'cash', amount: pickup.amount });
      burst(state, pickup.x, pickup.y, 6, '#7dd069', 90, 0.35, 2.2);
    }
  }
  state.pickups = state.pickups.filter((pk) => !pk.taken && pk.t < 40);
}

/** Keep the streets alive near the player; retire what is far behind. */
function maintainPopulation(state, dt) {
  state.spawnT -= dt;
  const p = state.player;
  if (state.spawnT <= 0) {
    state.spawnT = 0.7;
    const trafficNear = state.cars.filter((c) => c.driver === 'traffic' && dist(c.x, c.y, p.x, p.y) < 1000).length;
    if (trafficNear < 15) {
      const car = createCar(state.rng, state.rng.pick(['sedan', 'sedan', 'coupe', 'wagon', 'van', 'taxi']), 0, 0, 0, 'traffic');
      if (placeOnRoad(state.city, state.rng, car, p.x, p.y, 540, 920)) state.cars.push(car);
    }
    const pedsNear = state.peds.filter((pd) => dist(pd.x, pd.y, p.x, p.y) < 850).length;
    if (pedsNear < 18) state.peds.push(spawnPed(state, 260, 780));
  }
  state.cars = state.cars.filter((car) => !(car.driver === 'traffic' && dist(car.x, car.y, p.x, p.y) > 1250));
  state.peds = state.peds.filter((ped) => dist(ped.x, ped.y, p.x, p.y) < 1100 || ped.state === 'down');
}

export { getObjective, offerPoint, STEP };
