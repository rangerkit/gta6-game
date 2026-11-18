// Drawing the world: a pre-rendered ground (tiles, road paint, beach, bay), then every
// solid thing — buildings with sun-side walls and roofs, palms, cars, people — painted in
// one south-to-north pass so towers occlude what stands behind them, then effects, then
// the light of the hour. The camera follows the player with a driving lookahead.
import { PALETTE, TILE, VIEW } from './config.js';
import { clamp } from './random.js';
import { T_BUILDING, T_DECK, T_GRASS, T_LOT, T_PLAZA, T_ROAD, T_SAND, T_SIDEWALK, T_WATER } from './city.js';
import { getObjective } from './missions.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let groundCache = null;
  let groundCity = null;
  const camera = { x: 0, y: 0, scale: 1, vw: VIEW.width, vh: VIEW.height };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    camera.scale = canvas.height / VIEW.height;
    camera.vw = canvas.width / camera.scale;
    camera.vh = VIEW.height;
  }
  window.addEventListener('resize', resize);
  resize();

  /** Centre the camera on the player, looking a little way ahead of motion. */
  function updateCamera(state) {
    const p = state.player;
    const lead = p.inCar ? clamp(p.car.speed * 0.42, -130, 130) : 0;
    const lx = p.inCar ? Math.cos(p.car.angle) * lead : p.vx * 0.22;
    const ly = p.inCar ? Math.sin(p.car.angle) * lead : p.vy * 0.22;
    const shake = state.shake || 0;
    const sx = shake ? Math.sin(state.time * 51) * shake * 7 : 0;
    const sy = shake ? Math.cos(state.time * 43) * shake * 6 : 0;
    let x = p.x + lx - camera.vw / 2 + sx;
    let y = p.y + ly - camera.vh / 2 + sy;
    x = camera.vw >= state.city.width ? (state.city.width - camera.vw) / 2 : clamp(x, 0, state.city.width - camera.vw);
    y = camera.vh >= state.city.height ? (state.city.height - camera.vh) / 2 : clamp(y, 0, state.city.height - camera.vh);
    camera.x = x;
    camera.y = y;
  }

  /** Convert a canvas-relative CSS point (as input.js reports the mouse) to world space. */
  function toWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect();
    const px = (sx / rect.width) * canvas.width;
    const py = (sy / rect.height) * canvas.height;
    return { x: camera.x + px / camera.scale, y: camera.y + py / camera.scale };
  }

  function drawWorld(state) {
    if (groundCity !== state.city) {
      groundCache = buildGround(state.city);
      groundCity = state.city;
    }
    const { width, height } = canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(camera.scale, 0, 0, camera.scale, -camera.x * camera.scale, -camera.y * camera.scale);
    ctx.drawImage(groundCache, 0, 0);
    drawMarkers(state);
    drawSorted(state);
    drawEffects(state);
    drawLighting(state);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* --- ground --- */

  function buildGround(city) {
    const ground = document.createElement('canvas');
    ground.width = city.width;
    ground.height = city.height;
    const g = ground.getContext('2d');
    for (let ty = 0; ty < city.tilesH; ty += 1) {
      for (let tx = 0; tx < city.tilesW; tx += 1) {
        const t = city.tileAt(tx, ty);
        const x = tx * TILE;
        const y = ty * TILE;
        const vary = ((tx * 73856093) ^ (ty * 19349663)) % 5;
        if (t === T_WATER) {
          g.fillStyle = (tx + ty) % 7 === 0 ? PALETTE.waterDeep : PALETTE.water;
          g.fillRect(x, y, TILE, TILE);
          if ((tx * 3 + ty) % 11 === 0) {
            g.fillStyle = 'rgba(255,255,255,0.20)';
            g.fillRect(x + 8, y + 20, 18, 3);
          }
        } else if (t === T_SAND) {
          g.fillStyle = vary === 0 ? '#efdbA4' : PALETTE.sand;
          g.fillRect(x, y, TILE, TILE);
        } else if (t === T_ROAD) {
          g.fillStyle = PALETTE.road;
          g.fillRect(x, y, TILE, TILE);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(x, y, TILE, 2);
          // Lane dashes: a two-tile road carries one dashed centre line.
          g.fillStyle = PALETTE.laneMark;
          const right = city.tileAt(tx + 1, ty);
          const below = city.tileAt(tx, ty + 1);
          if (right !== T_ROAD && city.tileAt(tx - 1, ty) === T_ROAD) {
            for (let d = 4; d < TILE; d += 16) g.fillRect(x + TILE - 2, y + d, 3, 9);
          }
          if (below !== T_ROAD && city.tileAt(tx, ty - 1) === T_ROAD) {
            for (let d = 4; d < TILE; d += 16) g.fillRect(x + d, y + TILE - 2, 9, 3);
          }
        } else if (t === T_SIDEWALK || t === T_PLAZA) {
          g.fillStyle = t === T_PLAZA ? PALETTE.plaza : PALETTE.sidewalk;
          g.fillRect(x, y, TILE, TILE);
          g.strokeStyle = 'rgba(120,110,90,0.25)';
          g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
          if (t === T_PLAZA && (tx + ty) % 2 === 0) {
            g.fillStyle = 'rgba(255,93,143,0.10)';
            g.fillRect(x, y, TILE, TILE);
          }
        } else if (t === T_GRASS) {
          g.fillStyle = vary === 0 ? PALETTE.grassDark : PALETTE.grass;
          g.fillRect(x, y, TILE, TILE);
          if ((tx * 7 + ty * 3) % 6 === 0) {
            g.fillStyle = 'rgba(255,255,255,0.13)';
            g.fillRect(x + 10, y + 12, 3, 8);
            g.fillRect(x + 26, y + 28, 3, 8);
          }
        } else if (t === T_LOT) {
          g.fillStyle = PALETTE.lot;
          g.fillRect(x, y, TILE, TILE);
          g.strokeStyle = 'rgba(255,255,255,0.35)';
          g.strokeRect(x + 5.5, y + 5.5, TILE - 11, TILE - 11);
        } else if (t === T_DECK) {
          g.fillStyle = PALETTE.deck;
          g.fillRect(x, y, TILE, TILE);
          g.fillStyle = 'rgba(90,60,30,0.35)';
          for (let d = 6; d < TILE; d += 12) g.fillRect(x, y + d, TILE, 2);
        } else if (t === T_BUILDING) {
          g.fillStyle = '#cbbfa8';
          g.fillRect(x, y, TILE, TILE);
        }
      }
    }
    return ground;
  }

  /* --- markers and pickups, flat on the ground --- */

  function drawMarkers(state) {
    const objective = getObjective(state);
    if (objective && objective.x !== null && objective.x !== undefined) {
      pulseMarker(state, objective.x, objective.y, '#ffb52e');
    }
    if (state.mission && state.mission.car && state.mission.def.steps[state.mission.stepIndex].kind === 'steal') {
      pulseMarker(state, state.mission.car.x, state.mission.car.y, '#ff5d8f');
    }
    for (const pickup of state.pickups) {
      const bob = Math.sin(state.time * 5 + pickup.x) * 3;
      ctx.fillStyle = 'rgba(125, 208, 105, 0.25)';
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7dd069';
      ctx.font = 'bold 15px ' + 'sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', pickup.x, pickup.y + 5 + bob);
    }
  }

  function pulseMarker(state, x, y, color) {
    const pulse = 1 + Math.sin(state.time * 4) * 0.12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    const grad = ctx.createLinearGradient(x, y - 130, x, y);
    grad.addColorStop(0, 'rgba(255,181,46,0)');
    grad.addColorStop(1, hexA(color, 0.4));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 9, y - 130, 18, 130);
  }

  /* --- the south-to-north pass --- */

  function drawSorted(state) {
    const items = [];
    for (const b of state.city.buildings) items.push({ y: b.y + b.h, kind: 'building', ref: b });
    for (const palm of state.city.palms) items.push({ y: palm.y, kind: 'palm', ref: palm });
    for (const car of state.cars) items.push({ y: car.y + 14, kind: 'car', ref: car });
    for (const ped of state.peds) items.push({ y: ped.y, kind: 'ped', ref: ped });
    for (const cop of state.footCops) items.push({ y: cop.y, kind: 'cop', ref: cop });
    items.push({ y: state.player.y, kind: 'player', ref: state.player });
    items.sort((a, b) => a.y - b.y);
    const view = { x0: camera.x - 90, y0: camera.y - 140, x1: camera.x + camera.vw + 90, y1: camera.y + camera.vh + 90 };
    for (const item of items) {
      const r = item.ref;
      if (r.x !== undefined && (r.x < view.x0 - 120 || r.x > view.x1 + 120 || item.y < view.y0 - 60 || item.y > view.y1 + 60)) continue;
      if (item.kind === 'building') drawBuilding(state, r);
      else if (item.kind === 'palm') drawPalm(r);
      else if (item.kind === 'car') drawCar(state, r);
      else if (item.kind === 'ped') drawPed(r, false);
      else if (item.kind === 'cop') drawFootCop(r);
      else drawPlayer(state);
    }
  }

  function drawBuilding(state, b) {
    const lift = b.height * 0.5;
    const shift = b.height * 0.16;
    // Shadow, then the sun-side walls, then the roof slab on top.
    ctx.fillStyle = PALETTE.roofShadow;
    ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);
    ctx.fillStyle = shade(b.wall, -18);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x - shift, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w - shift, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(b.wall, -34);
    ctx.beginPath();
    ctx.moveTo(b.x + b.w, b.y);
    ctx.lineTo(b.x + b.w - shift, b.y - lift);
    ctx.lineTo(b.x + b.w - shift, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = b.wall;
    ctx.fillRect(b.x - shift, b.y - lift, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x - shift + 5, b.y - lift + 5, b.w - 10, b.h - 10);
    // Windows down the sun wall, lit and unlit by the building's own seed.
    let s = b.seed;
    const rnd = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const dark = darkness(state) > 0.3;
    for (let wy = 0; wy < 3; wy += 1) {
      for (let wx = 0; wx < 6; wx += 1) {
        const lit = rnd();
        ctx.fillStyle = dark && lit > 0.55 ? 'rgba(255, 214, 130, 0.95)' : 'rgba(70, 100, 120, 0.5)';
        ctx.fillRect(b.x + 10 + wx * ((b.w - 20) / 6), b.y + b.h - lift + 8 + wy * 12, 9, 7);
      }
    }
    for (let i = 0; i < b.acUnits; i += 1) {
      ctx.fillStyle = 'rgba(120,120,125,0.8)';
      ctx.fillRect(b.x - shift + 14 + rnd() * (b.w - 44), b.y - lift + 12 + rnd() * (b.h - 40), 16, 12);
    }
    if (b.label) {
      ctx.fillStyle = 'rgba(32, 48, 58, 0.85)';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.label.toUpperCase(), b.x + b.w / 2 - shift, b.y - lift + b.h / 2 + 4);
    }
  }

  function drawPalm(palm) {
    ctx.fillStyle = 'rgba(46,32,24,0.18)';
    ctx.beginPath();
    ctx.ellipse(palm.x + 6, palm.y + 3, 13 * palm.s, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.palmTrunk;
    ctx.lineWidth = 4.5 * palm.s;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.quadraticCurveTo(palm.x + 3, palm.y - 12 * palm.s, palm.x + 7, palm.y - 21 * palm.s);
    ctx.stroke();
    const topX = palm.x + 7;
    const topY = palm.y - 21 * palm.s;
    ctx.lineWidth = 3.4 * palm.s;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
      ctx.strokeStyle = i % 2 ? PALETTE.palmLeaf : PALETTE.palmLeafDark;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(topX + Math.cos(a) * 13 * palm.s, topY + Math.sin(a) * 8 * palm.s - 5, topX + Math.cos(a) * 20 * palm.s, topY + Math.sin(a) * 13 * palm.s + 4);
      ctx.stroke();
    }
  }

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(30,25,20,0.30)';
    roundRect(3, 3, 42, 23, 6);
    ctx.fill();
    ctx.fillStyle = car.hp <= 0 ? '#4c4c4c' : car.color;
    roundRect(-21, -11.5, 42, 23, 6);
    ctx.fill();
    if (car.type === 'patrol') {
      ctx.fillStyle = '#f2f4f6';
      roundRect(-9, -11.5, 15, 23, 4);
      ctx.fill();
      const flash = Math.floor(state.time * 3.4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff4747' : '#5b83ff';
      ctx.fillRect(-4, -8, 7, 6);
      ctx.fillStyle = flash ? '#5b83ff' : '#ff4747';
      ctx.fillRect(-4, 2, 7, 6);
    }
    ctx.fillStyle = 'rgba(24, 34, 44, 0.9)';
    roundRect(2, -9.5, 9, 19, 3);
    ctx.fill();
    roundRect(-13, -9.5, 7, 19, 3);
    ctx.fill();
    ctx.fillStyle = car.type === 'taxi' ? '#20303a' : 'rgba(255,255,255,0.25)';
    if (car.type === 'taxi') {
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffc61a';
      ctx.fillRect(-3.5, -4, 7, 8);
      ctx.fillStyle = '#20303a';
      ctx.fillText('TAXI', 0, 2.5);
    }
    ctx.fillStyle = '#22242a';
    for (const [wx, wy] of [[13, -12.5], [13, 10], [-13, -12.5], [-13, 10]]) ctx.fillRect(wx - 4, wy, 8, 3.4);
    if (car.isMissionCar) {
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath();
      ctx.arc(0, -20, 4.5 + Math.sin(state.time * 5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (car.hp < 40 && car.hp > 0) {
      ctx.fillStyle = 'rgba(70,70,70,0.35)';
      ctx.beginPath();
      ctx.arc(car.x + 14, car.y - 6, 6 + Math.sin(state.time * 9 + car.id) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFigure(x, y, angle, walkPhase, shirt, skin, opts = {}) {
    ctx.fillStyle = 'rgba(30,25,20,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 8, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const step = Math.sin(walkPhase) * 4.5;
    ctx.strokeStyle = opts.legs || '#31435a';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle + 2.6) * (5 + step * 0.4), y + Math.sin(angle + 2.6) * (5 + step * 0.4));
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle - 2.6) * (5 - step * 0.4), y + Math.sin(angle - 2.6) * (5 - step * 0.4));
    ctx.stroke();
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(x, y, 7.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4, 4.4, 0, Math.PI * 2);
    ctx.fill();
    if (opts.cap) {
      ctx.fillStyle = opts.cap;
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * 2.4, y + Math.sin(angle) * 2.4, 4.6, angle - 1.9, angle + 1.9);
      ctx.fill();
    }
  }

  function drawPed(ped, isCop) {
    if (ped.state === 'down') {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + 1.2);
      ctx.globalAlpha = ped.downT > 5 ? Math.max(0, 1 - (ped.downT - 5) / 2) : 1;
      ctx.fillStyle = ped.shirt;
      roundRect(-10, -4.5, 20, 9, 4);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(12, 0, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    drawFigure(ped.x, ped.y, ped.angle, ped.walkPhase, ped.shirt, ped.skin, {});
    void isCop;
  }

  function drawFootCop(cop) {
    drawFigure(cop.x, cop.y, cop.angle, cop.walkPhase, '#274b8f', '#e8b98d', { cap: '#1d3560', legs: '#1d2c44' });
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(cop.x - 2, cop.y - 2, 3.4, 3.4);
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.inCar) return;
    drawFigure(p.x, p.y, p.angle, state.time * 9, '#12b5a5', '#c68863', { cap: '#ff5d8f', legs: '#263238' });
    if (p.swingT > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 17, p.angle - 0.7, p.angle + 0.5);
      ctx.stroke();
    } else if (p.hasPistol) {
      ctx.strokeStyle = '#22242a';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6);
      ctx.lineTo(p.x + Math.cos(p.angle) * 15, p.y + Math.sin(p.angle) * 15);
      ctx.stroke();
    }
  }

  /* --- effects and light --- */

  function drawEffects(state) {
    for (const b of state.bullets) {
      ctx.strokeStyle = 'rgba(255, 230, 150, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function darkness(state) {
    const h = state.clockMin / 60;
    if (h >= 7 && h < 16.5) return 0;
    if (h >= 16.5 && h < 19) return (h - 16.5) / 2.5; // dusk deepens
    if (h >= 19 || h < 5) return 1;
    return 1 - (h - 5) / 2; // dawn
  }

  function drawLighting(state) {
    const d = darkness(state);
    const h = state.clockMin / 60;
    if (d <= 0.01) return;
    const x0 = camera.x;
    const y0 = camera.y;
    if (h >= 16.5 && h < 20) {
      ctx.fillStyle = `rgba(255, 122, 60, ${0.13 * d})`;
      ctx.fillRect(x0, y0, camera.vw, camera.vh);
    }
    ctx.fillStyle = `rgba(16, 24, 64, ${0.36 * d})`;
    ctx.fillRect(x0, y0, camera.vw, camera.vh);
    // Lamp pools and the marina's string lights.
    ctx.fillStyle = `rgba(255, 205, 110, ${0.16 * d})`;
    for (const lamp of state.city.lamps) {
      if (lamp.x < x0 - 60 || lamp.x > x0 + camera.vw + 60 || lamp.y < y0 - 60 || lamp.y > y0 + camera.vh + 60) continue;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 30, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return { drawWorld, updateCamera, toWorld, camera, resize };
}

/** Darken or lighten a #rrggbb colour by an amount in -100..100. */
export function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amount));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function hexA(hex, alpha) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
