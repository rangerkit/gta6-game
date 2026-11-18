// Palm Vice — boot and the one loop. The world advances in fixed 1/60 s steps; this shell
// owns the screens (title, play, pause, busted, wasted, story complete), turns input into
// the controls the world polls, drains the world's events into sound, banners and saves,
// and paints: renderer first, HUD over it.
//
// ?seed=N fixes the world seed. ?shot=start|foot|drive|chase (with &seed=N) stages that
// screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady when it is on screen.
import { STEP } from './config.js';
import { createRandom, rngHelpers } from './random.js';
import { applySave, createState, getInteractPrompt, newGame, respawnPlayer, stepWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer } from './render.js';
import {
  createHud,
  SCREEN_BUSTED,
  SCREEN_COMPLETE,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WASTED,
  titleItems,
} from './hud.js';
import { stageShot } from './shots.js';
import { engineSound, sirenSound, sfx, startMusic, wakeAudio } from './audio.js';
import { hasSave, readSave, writeSave } from './save.js';
import { nearestCopDistance } from './police.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Palm Vice is one city: the same seed every visit, so the map in a save always fits. */
const CITY_SEED = 1123;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const hud = createHud(canvas);

function announce(message) {
  if (status) status.textContent = message;
}

function runShot(name) {
  const staged = stageShot(name, seed);
  renderer.updateCamera(staged.state);
  let painted = 0;
  function paint() {
    renderer.drawWorld(staged.state);
    hud.draw(staged.state, staged.screen, staged.ui, 0);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const state = createState(CITY_SEED);
  // The city is fixed; the day's luck is not. Re-seed the runtime stream by the clock.
  state.rng = rngHelpers(createRandom((Date.now() % 2147483647) + 7));
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let shownComplete = false;
  const ui = { menuIndex: 0, hasSave: hasSave(), showHelp: false, prompt: null };
  let accumulator = 0;
  let last = performance.now();
  let prevUp = false;
  let prevDown = false;

  window.addEventListener('keydown', wakeAudio, { once: false });
  window.addEventListener('pointerdown', wakeAudio, { once: false });

  function setScreen(next, message) {
    screen = next;
    if (message) announce(message);
  }

  function startNew() {
    newGame(state);
    shownComplete = false;
    ui.showHelp = false;
    setScreen(SCREEN_PLAY, 'Playing Palm Vice. Meet Marisol at the Coral Diner.');
    startMusic();
  }

  function startContinue() {
    const data = readSave();
    if (data) applySave(state, data);
    shownComplete = state.storyDone;
    ui.showHelp = false;
    setScreen(SCREEN_PLAY, 'Welcome back to Palm Vice.');
    startMusic();
  }

  function drainEvents() {
    const events = state.events.splice(0, state.events.length);
    for (const event of events) {
      hud.notify(event, state);
      switch (event.kind) {
        case 'gunshot':
          sfx.gunshot();
          break;
        case 'punch':
          sfx.punch();
          break;
        case 'crash':
          sfx.crash(event.strength);
          break;
        case 'honk':
          if (Math.hypot(event.x - state.player.x, event.y - state.player.y) < 520) sfx.honk();
          break;
        case 'cash':
        case 'activity-done':
          sfx.cash();
          break;
        case 'checkpoint':
          sfx.checkpoint();
          break;
        case 'mission-passed':
          state.stats.missionsPassed += 1;
          sfx.passed();
          writeSave(state);
          ui.hasSave = true;
          break;
        case 'mission-failed':
          sfx.failed();
          break;
        case 'mission-started':
          sfx.phone();
          break;
        case 'save':
          writeSave(state);
          ui.hasSave = true;
          break;
        case 'busted':
          sfx.busted();
          setScreen(SCREEN_BUSTED, 'Busted. Press Enter.');
          break;
        case 'wasted':
          sfx.wasted();
          setScreen(SCREEN_WASTED, 'Wasted. Press Enter.');
          break;
        default:
          break;
      }
    }
    if (state.storyDone && !shownComplete && screen === SCREEN_PLAY) {
      shownComplete = true;
      writeSave(state);
      setScreen(SCREEN_COMPLETE, 'Story complete. Palm Vice is yours.');
    }
  }

  function titleControls() {
    const items = titleItems(ui.hasSave);
    const up = input.held.up;
    const down = input.held.down;
    if (up && !prevUp) ui.menuIndex = (ui.menuIndex + items.length - 1) % items.length;
    if (down && !prevDown) ui.menuIndex = (ui.menuIndex + 1) % items.length;
    prevUp = up;
    prevDown = down;
    const actions = input.takeActions();
    if (actions & (ACTION_CONFIRM | ACTION_INTERACT)) {
      const item = items[ui.menuIndex];
      if (item.id === 'new') startNew();
      else if (item.id === 'continue') startContinue();
      else ui.showHelp = !ui.showHelp;
    }
    return { axes: { x: 0, y: 0 }, drive: { throttle: 0, steer: 0 }, sprint: false, attack: false, aimAngle: 0, interact: false };
  }

  function playControls(firstStep) {
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) {
      setScreen(SCREEN_PAUSED, 'Paused.');
      return null;
    }
    const aimPoint = renderer.toWorld(input.mouse.x, input.mouse.y);
    const p = state.player;
    return {
      axes: input.axes(),
      drive: input.drive(),
      sprint: input.held.sprint,
      attack: input.attacking(),
      aimAngle: Math.atan2(aimPoint.y - p.y, aimPoint.x - p.x),
      interact: firstStep && !!(actions & ACTION_INTERACT),
    };
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const dt = Math.min(accumulator, MAX_FRAME);

    if (screen === SCREEN_TITLE) {
      const controls = titleControls();
      while (accumulator >= STEP) {
        stepWorld(state, controls, STEP);
        accumulator -= STEP;
      }
      state.events.length = 0;
      state.sayQueue.length = 0;
    } else if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        const controls = playControls(first);
        first = false;
        if (!controls) {
          accumulator = 0;
          break;
        }
        stepWorld(state, controls, STEP);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) {
          accumulator = 0;
          break;
        }
      }
      drainEvents();
    } else if (screen === SCREEN_PAUSED) {
      const actions = input.takeActions();
      if (actions & ACTION_PAUSE) setScreen(SCREEN_PLAY, 'Playing.');
      accumulator = 0;
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      const actions = input.takeActions();
      if (actions & (ACTION_CONFIRM | ACTION_INTERACT)) {
        respawnPlayer(state, screen === SCREEN_BUSTED ? 'busted' : 'wasted');
        drainEvents();
        setScreen(SCREEN_PLAY, 'Back on the street.');
      }
      accumulator = 0;
    } else if (screen === SCREEN_COMPLETE) {
      const actions = input.takeActions();
      if (actions & (ACTION_CONFIRM | ACTION_INTERACT)) setScreen(SCREEN_PLAY, 'Free roam.');
      accumulator = 0;
    }

    ui.prompt = screen === SCREEN_PLAY ? getInteractPrompt(state) : null;
    renderer.updateCamera(state);
    renderer.drawWorld(state);
    hud.draw(state, screen, ui, dt);
    const p = state.player;
    engineSound(p.inCar ? p.car.speed : 0, screen === SCREEN_PLAY && p.inCar);
    sirenSound(screen === SCREEN_PLAY && state.stars > 0 && nearestCopDistance(state, p.x, p.y) < 520);
  }

  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_PAUSED) {
      if (event.code === 'KeyS') {
        if (writeSave(state)) {
          ui.hasSave = true;
          announce('Game saved.');
          hud.notify({ kind: 'saved' }, state);
        }
      }
      if (event.code === 'KeyH') ui.showHelp = !ui.showHelp;
      if (event.code === 'KeyQ') {
        ui.showHelp = false;
        setScreen(SCREEN_TITLE, 'Title screen.');
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) setScreen(SCREEN_PAUSED, 'Paused.');
  });

  announce('Palm Vice. Choose New Game to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
