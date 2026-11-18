// The HUD and the screens: everything drawn over the world — the objective panel, money,
// wanted stars and clock, health and the bust meter, the minimap with its blips, dialogue
// from Marisol and the rest, banners and toasts, and the title, pause, busted, wasted and
// story-complete screens. It reads the world; it never changes it (beyond its own timers).
import { FONT, PALETTE } from './config.js';
import { clamp } from './random.js';
import { T_BUILDING, T_GRASS, T_LOT, T_ROAD, T_SAND, T_WATER } from './city.js';
import { getObjective } from './missions.js';
import { starsOf } from './police.js';
import { CAR_TYPES } from './vehicles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const MAP_W = 198;
const MAP_H = 124;

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let mapBase = null;
  let mapCity = null;
  let banner = null; // {title, sub, t}
  let toast = null; // {text, t}
  let say = null; // {who, text, t}

  /** React to a world event with a banner, a toast or a line of dialogue. */
  function notify(event, state) {
    switch (event.kind) {
      case 'mission-started':
        banner = { title: event.mission.title.toUpperCase(), sub: 'New job from Marisol Vega', t: 2.8 };
        break;
      case 'mission-passed':
        banner = { title: 'MISSION PASSED', sub: `${event.mission.title}  ·  +$${event.reward}`, t: 3.2 };
        break;
      case 'mission-failed':
        banner = { title: 'MISSION FAILED', sub: event.reason || '', t: 2.8 };
        break;
      case 'checkpoint':
        toast = { text: `Gate ${event.index}/${event.total}`, t: 1.6 };
        break;
      case 'activity-done':
        banner = { title: event.label.toUpperCase() + ' DONE', sub: `+$${event.reward}`, t: 2.4 };
        break;
      case 'activity-step':
        toast = { text: event.text, t: 2.6 };
        break;
      case 'activity-failed':
        toast = { text: `${event.label} failed`, t: 2.2 };
        break;
      case 'cash':
        toast = { text: `+$${event.amount}`, t: 1.1 };
        break;
      case 'healed':
        toast = { text: 'Patched up and fed', t: 1.8 };
        break;
      case 'heat-cleared':
        toast = { text: 'You lost them. The heat is off.', t: 2.4 };
        break;
      case 'unlock-pistol':
        toast = { text: 'Marisol left you a pistol — click or Space to use it', t: 3.4 };
        break;
      case 'bank-scored':
        banner = { title: 'THE VAULT IS YOURS', sub: 'Now run.', t: 2.6 };
        break;
      case 'respawn':
        toast = { text: event.fine > 0 ? `Fined $${event.fine}` : 'Back on the street', t: 2.4 };
        break;
      case 'saved':
        toast = { text: 'Game saved', t: 1.6 };
        break;
      default:
        break;
    }
    void state;
  }

  function draw(state, screen, ui, dt) {
    const w = canvas.width;
    const h = canvas.height;
    const scale = h / 720;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui, w, h, scale);
      return;
    }
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_COMPLETE) {
      drawHud(state, ui, w, h, scale, dt);
    }
    if (screen === SCREEN_PAUSED) drawPause(state, ui, w, h, scale);
    if (screen === SCREEN_BUSTED) drawEndScreen(state, w, h, scale, 'BUSTED', '#2e6ff2', 'The PVPD got their hands on you.', ui);
    if (screen === SCREEN_WASTED) drawEndScreen(state, w, h, scale, 'WASTED', '#ff4747', 'St. Coral Hospital patched you up.', ui);
    if (screen === SCREEN_COMPLETE) drawComplete(state, w, h, scale);
  }

  /* --- in-game HUD --- */

  function drawHud(state, ui, w, h, scale, dt) {
    const p = state.player;
    // Objective panel, top-left.
    const objective = getObjective(state);
    ctx.fillStyle = PALETTE.panel;
    roundRectScreen(14 * scale, 14 * scale, 356 * scale, 64 * scale, 10 * scale);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.accentAlt;
    ctx.font = `bold ${14 * scale}px ${FONT}`;
    ctx.fillText((objective.title || 'Palm Vice').toUpperCase(), 26 * scale, 36 * scale);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `${14.5 * scale}px ${FONT}`;
    const distText = objective.x !== null && objective.x !== undefined ? `  ·  ${Math.round(Math.hypot(objective.x - p.x, objective.y - p.y) / 10)} m` : '';
    wrapText(objective.text + distText, 26 * scale, 57 * scale, 336 * scale, 17 * scale, 2);
    if (objective.timer !== null && objective.timer !== undefined) {
      ctx.fillStyle = objective.timer < 20 ? PALETTE.danger : PALETTE.accentAlt;
      ctx.font = `bold ${15 * scale}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatClock(objective.timer), 360 * scale, 36 * scale);
      ctx.textAlign = 'left';
    }
    // Money, stars and the clock, top-right, on a soft panel so they read on any street.
    ctx.fillStyle = PALETTE.panel;
    roundRectScreen(w - 158 * scale, 10 * scale, 144 * scale, 84 * scale, 10 * scale);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.cash;
    ctx.font = `bold ${24 * scale}px ${FONT}`;
    ctx.fillText(`$${p.money}`, w - 18 * scale, 40 * scale);
    drawStars(state, w - 18 * scale, 62 * scale, scale);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `${13.5 * scale}px ${FONT}`;
    ctx.fillText(formatDayClock(state.clockMin), w - 18 * scale, 84 * scale);
    ctx.textAlign = 'left';
    // Health, bottom-left; the bust meter rides above it while the law closes in.
    const hpFrac = clamp(p.hp / 100, 0, 1);
    ctx.fillStyle = PALETTE.panel;
    roundRectScreen(14 * scale, h - 40 * scale, 190 * scale, 26 * scale, 8 * scale);
    ctx.fill();
    ctx.fillStyle = hpFrac > 0.35 ? PALETTE.cash : PALETTE.danger;
    roundRectScreen(19 * scale, h - 35 * scale, 180 * scale * hpFrac, 16 * scale, 5 * scale);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${11.5 * scale}px ${FONT}`;
    const hands = p.inCar && p.car ? CAR_TYPES[p.car.type].label.toUpperCase() : p.hasPistol ? 'PISTOL' : 'FISTS';
    ctx.fillText(hands, 214 * scale, h - 22 * scale);
    if (p.bustT > 0.03) {
      ctx.fillStyle = PALETTE.panel;
      roundRectScreen(14 * scale, h - 66 * scale, 190 * scale, 20 * scale, 8 * scale);
      ctx.fill();
      ctx.fillStyle = PALETTE.copBlue;
      roundRectScreen(19 * scale, h - 61.5 * scale, 180 * scale * clamp(p.bustT, 0, 1), 11 * scale, 5 * scale);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${10.5 * scale}px ${FONT}`;
      ctx.fillText('BUSTED?', 214 * scale, h - 48 * scale);
    }
    drawMinimap(state, w, h, scale);
    // The interact prompt, bottom-centre.
    if (ui.prompt) {
      ctx.font = `bold ${14 * scale}px ${FONT}`;
      const tw = ctx.measureText(ui.prompt).width;
      ctx.fillStyle = PALETTE.panel;
      roundRectScreen((w - tw) / 2 - 14 * scale, h - 108 * scale, tw + 28 * scale, 30 * scale, 15 * scale);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(ui.prompt, w / 2, h - 88 * scale);
      ctx.textAlign = 'left';
    }
    // Dialogue: Marisol and friends get the line above the prompt.
    if (!say && state.sayQueue.length) {
      say = { ...state.sayQueue.shift(), t: 4.2 };
    }
    if (say) {
      say.t -= dt;
      if (say.t <= 0) say = null;
      else {
        ctx.fillStyle = PALETTE.panel;
        roundRectScreen(w / 2 - 330 * scale, h - 168 * scale, 660 * scale, 52 * scale, 10 * scale);
        ctx.fill();
        ctx.fillStyle = PALETTE.accent;
        ctx.font = `bold ${13.5 * scale}px ${FONT}`;
        ctx.fillText(say.who.toUpperCase(), w / 2 - 314 * scale, h - 144 * scale);
        ctx.fillStyle = '#fff';
        ctx.font = `${14.5 * scale}px ${FONT}`;
        wrapText(say.text, w / 2 - 314 * scale, h - 124 * scale, 628 * scale, 18 * scale, 2);
      }
    }
    // Banner and toast.
    if (banner) {
      banner.t -= dt;
      if (banner.t <= 0) banner = null;
      else {
        const alpha = clamp(banner.t, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.accentAlt;
        ctx.font = `italic bold ${44 * scale}px ${FONT}`;
        ctx.fillText(banner.title, w / 2, 170 * scale);
        ctx.fillStyle = '#fff';
        ctx.font = `${17 * scale}px ${FONT}`;
        ctx.fillText(banner.sub, w / 2, 200 * scale);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
    if (toast) {
      toast.t -= dt;
      if (toast.t <= 0) toast = null;
      else {
        ctx.globalAlpha = clamp(toast.t, 0, 1);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${16 * scale}px ${FONT}`;
        ctx.fillText(toast.text, w / 2, 240 * scale);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawStars(state, rightX, y, scale) {
    const stars = starsOf(state.heat);
    const flash = state.stars > 0 && Math.floor(state.time * 2.4) % 2 === 0;
    ctx.font = `${21 * scale}px ${FONT}`;
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i += 1) {
      const lit = i < stars;
      ctx.fillStyle = lit ? (flash ? '#ff4747' : '#ffb52e') : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', rightX - (4 - i) * 24 * scale, y);
    }
    ctx.textAlign = 'left';
  }

  function drawMinimap(state, w, h, scale) {
    if (mapCity !== state.city) {
      mapBase = buildMapBase(state.city);
      mapCity = state.city;
    }
    const mx = w - (MAP_W + 16) * scale;
    const my = h - (MAP_H + 16) * scale;
    ctx.save();
    ctx.fillStyle = PALETTE.panel;
    roundRectScreen(mx - 5 * scale, my - 5 * scale, (MAP_W + 10) * scale, (MAP_H + 10) * scale, 9 * scale);
    ctx.fill();
    ctx.beginPath();
    roundRectScreen(mx, my, MAP_W * scale, MAP_H * scale, 6 * scale);
    ctx.clip();
    ctx.drawImage(mapBase, mx, my, MAP_W * scale, MAP_H * scale);
    const kx = (MAP_W * scale) / state.city.width;
    const ky = (MAP_H * scale) / state.city.height;
    const dot = (x, y, color, size) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * kx, my + y * ky, size * scale, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const cop of state.cops) dot(cop.x, cop.y, '#5b83ff', 2.6);
    for (const cop of state.footCops) dot(cop.x, cop.y, '#5b83ff', 2.2);
    const objective = getObjective(state);
    if (objective && objective.x !== null && objective.x !== undefined) {
      const pulse = 3.4 + Math.sin(state.time * 5) * 0.9;
      dot(objective.x, objective.y, '#ffb52e', pulse);
      dot(objective.x, objective.y, '#20303a', 1.4);
    }
    if (state.mission && state.mission.car) dot(state.mission.car.x, state.mission.car.y, '#ff5d8f', 2.8);
    // The player: a white arrow on their heading.
    const p = state.player;
    ctx.save();
    ctx.translate(mx + p.x * kx, my + p.y * ky);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(6.4 * scale, 0);
    ctx.lineTo(-4.6 * scale, -3.8 * scale);
    ctx.lineTo(-4.6 * scale, 3.8 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${10.5 * scale}px ${FONT}`;
    ctx.fillText('N', mx + 4 * scale, my + 13 * scale);
  }

  function buildMapBase(city) {
    const base = document.createElement('canvas');
    base.width = MAP_W * 2;
    base.height = MAP_H * 2;
    const g = base.getContext('2d');
    const kx = base.width / city.width;
    const ky = base.height / city.height;
    g.fillStyle = '#2fb3c9';
    g.fillRect(0, 0, base.width, base.height);
    for (let ty = 0; ty < city.tilesH; ty += 1) {
      for (let tx = 0; tx < city.tilesW; tx += 1) {
        const t = city.tileAt(tx, ty);
        if (t === T_WATER) continue;
        g.fillStyle = t === T_ROAD ? '#5a5a64' : t === T_SAND ? '#f2ddab' : t === T_GRASS ? '#79c25f' : t === T_BUILDING ? '#e6d7bd' : t === T_LOT ? '#7a7a84' : '#d9d4c5';
        g.fillRect(tx * 48 * kx, ty * 48 * ky, 48 * kx + 1, 48 * ky + 1);
      }
    }
    return base;
  }

  /* --- screens --- */

  function drawTitle(state, ui, w, h, scale) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255, 93, 143, 0.30)');
    grad.addColorStop(0.45, 'rgba(20, 24, 44, 0.25)');
    grad.addColorStop(1, 'rgba(10, 14, 26, 0.64)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(32, 16, 40, 0.55)';
    ctx.font = `italic bold ${104 * scale}px ${FONT}`;
    ctx.fillText('PALM VICE', w / 2 + 5 * scale, 218 * scale + 5 * scale);
    const logoGrad = ctx.createLinearGradient(w / 2 - 260 * scale, 0, w / 2 + 260 * scale, 0);
    logoGrad.addColorStop(0, '#ffb52e');
    logoGrad.addColorStop(0.55, '#ff5d8f');
    logoGrad.addColorStop(1, '#29c7d8');
    ctx.fillStyle = logoGrad;
    ctx.fillText('PALM VICE', w / 2, 218 * scale);
    ctx.fillStyle = '#fff';
    ctx.font = `${19 * scale}px ${FONT}`;
    ctx.fillText('Steal it. Drive it. Deliver it. Disappear.', w / 2, 262 * scale);
    ctx.font = `${15 * scale}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('An original open-world crime story in a sun-soaked coastal city', w / 2, 290 * scale);
    const items = titleItems(ui.hasSave);
    items.forEach((item, i) => {
      const y = (356 + i * 52) * scale;
      const selected = i === ui.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(255, 181, 46, 0.92)';
        roundRectScreen(w / 2 - 170 * scale, y - 27 * scale, 340 * scale, 40 * scale, 20 * scale);
        ctx.fill();
      }
      ctx.fillStyle = selected ? '#20303a' : '#ffffff';
      ctx.font = `bold ${20 * scale}px ${FONT}`;
      ctx.fillText(item.label, w / 2, y);
    });
    ctx.font = `${13.5 * scale}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('↑ ↓ and Enter — WASD drive & walk · F interact · mouse aim, click to fight · Esc pause', w / 2, h - 26 * scale);
    if (ui.showHelp) drawHelp(w, h, scale);
    ctx.textAlign = 'left';
  }

  function drawHelp(w, h, scale) {
    ctx.fillStyle = 'rgba(10, 16, 24, 0.92)';
    roundRectScreen(w / 2 - 330 * scale, 120 * scale, 660 * scale, 430 * scale, 14 * scale);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.accentAlt;
    ctx.font = `bold ${22 * scale}px ${FONT}`;
    ctx.fillText('HOW TO PLAY', w / 2, 162 * scale);
    ctx.fillStyle = '#fff';
    ctx.font = `${15.5 * scale}px ${FONT}`;
    const lines = [
      'WASD / arrows — walk and drive · Shift — sprint',
      'F — talk, steal a car, get in and out, eat & heal',
      'Mouse — aim · Click / Space — punch or shoot',
      'Esc / P — pause · Enter — confirm',
      '',
      'Work Marisol Vega’s jobs from the Coral Diner (gold marker).',
      'Stars mean heat: break the police’s line of sight to cool off.',
      'Busted or wasted costs a cut of your cash — not your story.',
      'Fares (yellow) and courier runs (green) pay between jobs.',
      'Progress saves after every mission — and from the pause menu.',
    ];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, (206 + i * 30) * scale));
    ctx.textAlign = 'left';
  }

  function drawPause(state, ui, w, h, scale) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.62)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `italic bold ${46 * scale}px ${FONT}`;
    ctx.fillText('PAUSED', w / 2, 250 * scale);
    ctx.font = `${17 * scale}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const lines = ['Esc — back to the street', 'S — save game', 'H — how to play', 'Q — quit to title'];
    lines.forEach((line, i) => ctx.fillText(line, w / 2, (320 + i * 34) * scale));
    ctx.textAlign = 'left';
    if (ui.showHelp) drawHelp(w, h, scale);
    void state;
  }

  function drawEndScreen(state, w, h, scale, word, color, line, ui) {
    const flash = Math.floor(state.time * 2.2) % 2 === 0;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = flash ? color : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 10 * scale;
    ctx.strokeRect(5 * scale, 5 * scale, w - 10 * scale, h - 10 * scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `italic bold ${92 * scale}px ${FONT}`;
    ctx.fillText(word, w / 2, 320 * scale);
    ctx.fillStyle = '#fff';
    ctx.font = `${18 * scale}px ${FONT}`;
    ctx.fillText(line, w / 2, 366 * scale);
    const fine = Math.min(state.player.money, Math.max(40, Math.round(state.player.money * 0.12)));
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(word === 'BUSTED' ? `Fine: $${fine} — your story progress is kept` : `Hospital bill: $${fine} — your story progress is kept`, w / 2, 398 * scale);
    ctx.font = `bold ${16 * scale}px ${FONT}`;
    ctx.fillText('Press Enter', w / 2, 452 * scale);
    ctx.textAlign = 'left';
    void ui;
  }

  function drawComplete(state, w, h, scale) {
    ctx.fillStyle = 'rgba(8, 12, 20, 0.6)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    const grad = ctx.createLinearGradient(w / 2 - 300 * scale, 0, w / 2 + 300 * scale, 0);
    grad.addColorStop(0, '#ffb52e');
    grad.addColorStop(1, '#ff5d8f');
    ctx.fillStyle = grad;
    ctx.font = `italic bold ${58 * scale}px ${FONT}`;
    ctx.fillText('STORY COMPLETE', w / 2, 280 * scale);
    ctx.fillStyle = '#fff';
    ctx.font = `${18 * scale}px ${FONT}`;
    ctx.fillText('Marisol made the ferry. Palm Vice is yours now.', w / 2, 326 * scale);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`Missions passed: ${state.stats.missionsPassed}  ·  Cash on hand: $${state.player.money}`, w / 2, 362 * scale);
    ctx.font = `bold ${16 * scale}px ${FONT}`;
    ctx.fillText('Press Enter — the city stays open', w / 2, 420 * scale);
    ctx.textAlign = 'left';
  }

  /* --- small helpers --- */

  function roundRectScreen(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(' ');
    let line = '';
    let lines = 0;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        if (lines >= maxLines) return;
        line = word;
      } else line = test;
    }
    if (lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
  }

  return { draw, notify };
}

/** The title menu's items, in order; Continue appears only with a save on disk. */
export function titleItems(hasSave) {
  const items = [{ id: 'new', label: 'NEW GAME' }];
  if (hasSave) items.push({ id: 'continue', label: 'CONTINUE' });
  items.push({ id: 'help', label: 'HOW TO PLAY' });
  return items;
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDayClock(clockMin) {
  const hh = Math.floor(clockMin / 60) % 24;
  const mm = Math.floor(clockMin % 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
