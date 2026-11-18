// Missions and story: Marisol Vega's six jobs for Jett Marlowe, from a first stolen coupe
// to the Palmetto Bank score and the last ferry out — plus the taxi fares and courier runs
// that keep a wheelman fed between jobs. A mission is a list of steps (go somewhere, steal
// this, hold here, beat the clock, lose the heat); this module advances them, pays them,
// fails them, and always knows the current objective for the HUD and the minimap.
import { dist } from './random.js';
import { createCar } from './vehicles.js';

/**
 * The story. Steps carry a `poi` (a city place) or raw x/y, resolved when the mission
 * starts. Kinds: goto, pickup (on foot), steal (the marked car), enterCar, race
 * (checkpoints against the clock), hold (stay in the ring), escape (heat to zero).
 * A step's `effect` runs when it completes: 'heat1' | 'heat3' | 'score' (the bank).
 */
export const STORY = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 350,
    intro: [
      { who: 'Marisol Vega', text: "Jett Marlowe. Heard you can drive. Corso's boys left a Vireo coupe sitting at the Seabreeze — bring it to my garage, no scratches." },
      { who: 'Jett', text: 'And if they notice?' },
      { who: 'Marisol Vega', text: 'Then drive faster, baby. That is the whole job.' },
    ],
    steps: [
      { kind: 'goto', poi: 'hotel', r: 60, label: 'Go to the Seabreeze Hotel', setup: { spawnCar: 'hotel' } },
      { kind: 'steal', r: 40, label: 'Steal the Vireo Coupe' },
      { kind: 'goto', poi: 'garage', r: 55, label: "Deliver the coupe to Marisol's Garage", inCar: true },
    ],
    outro: { who: 'Marisol Vega', text: 'Clean work. Take this — a girl worries. There is more money where that came from.' },
  },
  {
    id: 'dinner-rush',
    title: 'Dinner Rush',
    reward: 500,
    intro: [
      { who: 'Marisol Vega', text: 'A package waits at the marina, Jett. The Seabreeze is expecting it. One thing — Corso has friends on the PVPD radio tonight.' },
    ],
    steps: [
      { kind: 'pickup', poi: 'marina', r: 34, label: 'Pick up the package at Palm Marina', onFoot: true, effect: 'heat1' },
      { kind: 'goto', poi: 'hotel', r: 55, label: 'Deliver the package to the Seabreeze Hotel', timer: 150 },
    ],
    outro: { who: 'Marisol Vega', text: 'The hotel pays on time, so now I pay on time. You are becoming reliable, wheelman.' },
  },
  {
    id: 'coast-run',
    title: 'Coast Run',
    reward: 450,
    intro: [
      { who: 'Marisol Vega', text: "My nephew Tito swears nobody can run the coast road faster than him. Prove the boy wrong and the bet money is yours." },
    ],
    steps: [
      { kind: 'enterCar', label: 'Get a car — any car' },
      { kind: 'race', par: 105, label: 'Run the coast checkpoints' },
    ],
    outro: { who: 'Marisol Vega', text: 'Tito is crying into his cafecito. Palm Vice is starting to know your name, Jett.' },
  },
  {
    id: 'heat-sink',
    title: 'Heat Sink',
    reward: 600,
    intro: [
      { who: 'Marisol Vega', text: 'A job went loud across town and the PVPD is jumping at shadows — including yours. Shake them, then come see me. Quietly.' },
    ],
    steps: [{ kind: 'escape', label: 'Lose the heat — break sight and lie low', setup: { heat: 3.2 } }],
    outro: { who: 'Marisol Vega', text: 'Ghost. That is a useful thing to be in this town.' },
  },
  {
    id: 'palmetto-score',
    title: 'The Palmetto Score',
    reward: 1500,
    intro: [
      { who: 'Marisol Vega', text: 'The big one, Jett. Palmetto Bank, midday, vault door on a timer I happen to own. Walk in calm, walk out rich. The whole town will hear about it.' },
    ],
    steps: [
      { kind: 'goto', poi: 'bank', r: 55, label: 'Go to the Palmetto Bank' },
      { kind: 'hold', poi: 'bank', r: 40, seconds: 5, label: 'Crack the vault — hold your nerve', onFoot: true, effect: 'score' },
      { kind: 'goto', poi: 'home', r: 60, label: "Get back to Jett's Place" },
    ],
    outro: { who: 'Marisol Vega', text: 'Half of that is already on a boat. You did the impossible part, wheelman.' },
  },
  {
    id: 'last-ferry',
    title: 'Last Ferry',
    reward: 2500,
    intro: [
      { who: 'Marisol Vega', text: 'Corso knows about the bank, Jett. His crews and half the PVPD are coming. Get me to the last ferry at the marina — drive like the town is ending. It is.' },
    ],
    steps: [
      { kind: 'goto', poi: 'mission', r: 60, label: 'Pick up Marisol at the Coral Diner', inCar: true, effect: 'heat3' },
      { kind: 'goto', poi: 'marina', r: 46, label: 'Get Marisol to the ferry — GO!', timer: 170, inCar: true },
    ],
    outro: { who: 'Marisol Vega', text: 'Palm Vice will sing about tonight. Wherever you land next, wheelman — land soft.' },
  },
];

/** Where missions are offered: the Coral Diner's door. */
export function offerPoint(state) {
  const diner = state.city.poiByKind.mission;
  return { x: diner.x, y: diner.y };
}

export function canStartMission(state) {
  if (state.mission || state.storyIndex >= STORY.length) return false;
  const p = offerPoint(state);
  return !state.player.inCar && dist(state.player.x, state.player.y, p.x, p.y) < 46;
}

export function startMission(state) {
  const def = STORY[state.storyIndex];
  const mission = { def, stepIndex: 0, stepT: null, holdT: 0, raceIndex: 0, car: null, failed: false };
  state.mission = mission;
  for (const line of def.intro) state.sayQueue.push(line);
  state.events.push({ kind: 'mission-started', mission: def });
  beginStep(state, mission);
  return mission;
}

function resolvePoint(state, step) {
  if (step.poi) {
    const poi = state.city.poiByKind[step.poi];
    return { x: poi.x, y: poi.y };
  }
  return { x: step.x, y: step.y };
}

function beginStep(state, mission) {
  const step = mission.def.steps[mission.stepIndex];
  const at = resolvePoint(state, step);
  step.x = at.x;
  step.y = at.y;
  mission.stepT = step.timer || step.par || null;
  mission.holdT = 0;
  if (step.kind === 'race') {
    mission.raceIndex = 0;
    step.points = racePoints(state);
  }
  const setup = step.setup || {};
  if (setup.heat) state.heat = Math.max(state.heat, setup.heat);
  if (setup.spawnCar) {
    const poi = state.city.poiByKind[setup.spawnCar];
    const car = createCar(state.rng, 'coupe', poi.x + 30, poi.y + 66, Math.PI / 2, 'mission');
    car.isMissionCar = true;
    state.cars.push(car);
    mission.car = car;
  }
}

/** The coast-run checkpoints: down the shore road, then out to the marina pier. */
function racePoints(state) {
  const city = state.city;
  const coast = city.vRoads[city.vRoads.length - 1].cx;
  const points = [];
  for (const h of [0, 2, 4, 6]) points.push({ x: coast, y: city.hRoads[h].cy });
  const marina = city.poiByKind.marina;
  points.push({ x: marina.x, y: marina.y });
  return points;
}

function failMission(state, reason) {
  state.events.push({ kind: 'mission-failed', mission: state.mission.def, reason });
  if (state.mission.car) state.mission.car.isMissionCar = false;
  state.mission = null;
}

function completeMission(state) {
  const def = state.mission.def;
  state.player.money += def.reward;
  state.storyIndex += 1;
  if (def.id === 'first-wheels') {
    state.player.hasPistol = true;
    state.events.push({ kind: 'unlock-pistol' });
  }
  if (def.outro) state.sayQueue.push(def.outro);
  state.events.push({ kind: 'mission-passed', mission: def, reward: def.reward });
  if (state.mission.car) state.mission.car.isMissionCar = false;
  state.mission = null;
  if (state.storyIndex >= STORY.length) state.storyDone = true;
  state.events.push({ kind: 'save' });
}

function advanceStep(state, mission) {
  const step = mission.def.steps[mission.stepIndex];
  if (step.effect === 'heat1') state.heat = Math.max(state.heat, 1.2);
  if (step.effect === 'heat3') state.heat = Math.max(state.heat, 3.1);
  if (step.effect === 'score') {
    state.heat = Math.max(state.heat, 3.1);
    state.events.push({ kind: 'bank-scored' });
  }
  mission.stepIndex += 1;
  if (mission.stepIndex >= mission.def.steps.length) completeMission(state);
  else {
    state.events.push({ kind: 'mission-step', mission: mission.def, step: mission.def.steps[mission.stepIndex] });
    beginStep(state, mission);
  }
}

/** Advance the active story mission and any side activity by one step. */
export function updateMissions(state, dt) {
  const p = state.player;
  const mission = state.mission;
  if (mission) {
    const step = mission.def.steps[mission.stepIndex];
    if (mission.car && mission.car.hp <= 0 && (step.kind === 'steal' || step.inCar)) {
      failMission(state, 'The car was wrecked.');
      return;
    }
    if (mission.stepT !== null && step.kind !== 'race') {
      mission.stepT -= dt;
      if (mission.stepT <= 0) {
        failMission(state, 'Out of time.');
        return;
      }
    }
    switch (step.kind) {
      case 'goto':
      case 'pickup': {
        const modeOk = step.inCar ? p.inCar : step.onFoot ? !p.inCar : true;
        if (modeOk && dist(p.x, p.y, step.x, step.y) < step.r) advanceStep(state, mission);
        break;
      }
      case 'steal':
        if (p.inCar && p.car === mission.car) advanceStep(state, mission);
        break;
      case 'enterCar':
        if (p.inCar) advanceStep(state, mission);
        break;
      case 'hold': {
        if (!p.inCar && dist(p.x, p.y, step.x, step.y) < step.r) {
          mission.holdT += dt;
          if (mission.holdT >= step.seconds) advanceStep(state, mission);
        } else mission.holdT = Math.max(0, mission.holdT - dt * 2);
        break;
      }
      case 'escape':
        if (state.stars === 0) advanceStep(state, mission);
        break;
      case 'race': {
        mission.stepT -= dt;
        if (mission.stepT <= 0) {
          failMission(state, 'The clock beat you.');
          return;
        }
        const point = step.points[mission.raceIndex];
        if (p.inCar && dist(p.x, p.y, point.x, point.y) < 78) {
          mission.raceIndex += 1;
          state.events.push({ kind: 'checkpoint', index: mission.raceIndex, total: step.points.length });
          if (mission.raceIndex >= step.points.length) advanceStep(state, mission);
        }
        break;
      }
      default:
        break;
    }
  }
  updateActivity(state, dt);
}

/* --- Side work: taxi fares and courier runs, offered between story jobs. --- */

export function maintainActivityOffer(state) {
  if (state.activity || state.mission) return;
  if (!state.rng.chance(0.002)) return;
  const p = state.player;
  if (state.rng.chance(0.55)) {
    const at = state.city.randomSidewalkPoint(state.rng, p.x, p.y, 260, 640);
    state.activity = { kind: 'taxi', phase: 'pickup', x: at.x, y: at.y, destX: 0, destY: 0, fare: 0 };
  } else {
    const pois = ['hotel', 'bank', 'armory', 'hospital', 'marina', 'garage'];
    const from = state.city.poiByKind[state.rng.pick(pois)];
    state.activity = { kind: 'courier', phase: 'pickup', x: from.x, y: from.y, destX: 0, destY: 0, fare: 0, timer: 0 };
  }
}

function updateActivity(state, dt) {
  const a = state.activity;
  if (!a) return;
  const p = state.player;
  if (a.kind === 'taxi') {
    if (a.phase === 'pickup') {
      if (p.inCar && Math.abs(p.car.speed) < 24 && dist(p.x, p.y, a.x, a.y) < 52) {
        const dest = state.city.randomSidewalkPoint(state.rng, a.x, a.y, 500, 1300);
        a.destX = dest.x;
        a.destY = dest.y;
        a.phase = 'dropoff';
        a.fare = Math.round(30 + dist(a.x, a.y, dest.x, dest.y) / 22);
        state.events.push({ kind: 'activity-step', text: 'Fare aboard — take them to the gold marker.' });
      }
    } else if (dist(p.x, p.y, a.destX, a.destY) < 56 && Math.abs(p.car ? p.car.speed : 0) < 30) {
      p.money += a.fare;
      state.events.push({ kind: 'activity-done', label: 'Taxi fare', reward: a.fare });
      state.activity = null;
    }
  } else if (a.kind === 'courier') {
    if (a.phase === 'pickup') {
      if (!p.inCar && dist(p.x, p.y, a.x, a.y) < 36) {
        const dest = state.city.randomSidewalkPoint(state.rng, a.x, a.y, 600, 1500);
        a.destX = dest.x;
        a.destY = dest.y;
        a.phase = 'deliver';
        a.timer = Math.round(dist(a.x, a.y, dest.x, dest.y) / 9) + 25;
        a.fare = Math.round(40 + dist(a.x, a.y, dest.x, dest.y) / 20);
        state.events.push({ kind: 'activity-step', text: 'Package in hand — deliver it before the clock dies.' });
      }
    } else {
      a.timer -= dt;
      if (a.timer <= 0) {
        state.events.push({ kind: 'activity-failed', label: 'Courier run' });
        state.activity = null;
        return;
      }
      if (dist(p.x, p.y, a.destX, a.destY) < 48) {
        p.money += a.fare;
        state.events.push({ kind: 'activity-done', label: 'Courier run', reward: a.fare });
        state.activity = null;
      }
    }
  }
}

/** The current objective for the HUD and minimap: {title, text, x, y, timer} or null. */
export function getObjective(state) {
  const mission = state.mission;
  if (mission) {
    const step = mission.def.steps[mission.stepIndex];
    let x = step.x;
    let y = step.y;
    let text = step.label;
    if (step.kind === 'steal' && mission.car) {
      x = mission.car.x;
      y = mission.car.y;
    }
    if (step.kind === 'race') {
      const point = step.points[mission.raceIndex];
      x = point.x;
      y = point.y;
      text = `${step.label} — gate ${mission.raceIndex + 1}/${step.points.length}`;
    }
    if (step.kind === 'escape') return { title: mission.def.title, text, x: null, y: null, timer: null };
    return { title: mission.def.title, text, x, y, timer: mission.stepT };
  }
  const a = state.activity;
  if (a) {
    if (a.kind === 'taxi') {
      return a.phase === 'pickup'
        ? { title: 'Taxi', text: 'Pick up the fare', x: a.x, y: a.y, timer: null }
        : { title: 'Taxi', text: `Drop the fare off — $${a.fare}`, x: a.destX, y: a.destY, timer: null };
    }
    return a.phase === 'pickup'
      ? { title: 'Courier', text: 'Pick up the package', x: a.x, y: a.y, timer: null }
      : { title: 'Courier', text: `Deliver the package — $${a.fare}`, x: a.destX, y: a.destY, timer: a.timer };
  }
  if (state.storyIndex < STORY.length) {
    const at = offerPoint(state);
    return { title: 'Palm Vice', text: `Meet Marisol at the Coral Diner — "${STORY[state.storyIndex].title}"`, x: at.x, y: at.y, timer: null };
  }
  return { title: 'Palm Vice', text: 'The city is yours. Fares and courier runs still pay.', x: null, y: null, timer: null };
}
