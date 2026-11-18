// Combat and effects: the player's fists and pistol, police gunfire at high heat, bullets,
// and the particle bursts every impact in the game shares. Loud events register as
// "scares" — the list pedestrians flee from and witnesses report.
import { HEAT, WALK } from './config.js';
import { clamp, dist } from './random.js';
import { downPed } from './pedestrians.js';
import { reportCrime } from './police.js';

export const BULLET_SPEED = 880;

/** A short-lived loud event at a place: peds inside its radius run, crimes get reported. */
export function addScare(state, x, y, radius, seconds) {
  state.scares.push({ x, y, radius, t: seconds });
}

/** A burst of particles: sparks, glass, bloodless dust, cash-green sparkle. */
export function burst(state, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.next() * Math.PI * 2;
    const s = speed * (0.3 + state.rng.next() * 0.9);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: life * (0.5 + state.rng.next() * 0.8),
      maxLife: life,
      color,
      size: size * (0.6 + state.rng.next() * 0.8),
    });
  }
}

export function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - 2.4 * dt;
    p.vy *= 1 - 2.4 * dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const s of state.scares) s.t -= dt;
  state.scares = state.scares.filter((s) => s.t > 0);
}

export function fireBullet(state, x, y, angle, from) {
  state.bullets.push({
    x,
    y,
    px: x,
    py: y,
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
    from,
    life: 0.55,
    dmg: from === 'player' ? 30 : 8,
  });
}

/**
 * The player's attack, aimed at `aimAngle`: a punch when the pistol is holstered, locked
 * or the target is close enough to reach; otherwise a shot, with its noise, its scare and
 * its wanted consequences handled here so every caller gets the same rules.
 */
export function playerAttack(state, aimAngle) {
  const p = state.player;
  if (p.attackT > 0 || p.inCar) return;
  const nearPed = state.peds.find((ped) => ped.state !== 'down' && dist(p.x, p.y, ped.x, ped.y) < WALK.punchRange + 8);
  const nearCop = state.footCops.find((cop) => dist(p.x, p.y, cop.x, cop.y) < WALK.punchRange + 8);
  if (!p.hasPistol || nearPed || nearCop) {
    p.attackT = 0.34;
    p.swingT = 0.18;
    p.angle = aimAngle;
    const hx = p.x + Math.cos(aimAngle) * WALK.punchRange;
    const hy = p.y + Math.sin(aimAngle) * WALK.punchRange;
    const target = nearPed || nearCop;
    if (target && dist(target.x, target.y, hx, hy) < 26) {
      if (target === nearCop) {
        state.events.push({ kind: 'cop-hit' });
        reportCrime(state, 1.2, p.x, p.y);
        burst(state, target.x, target.y, 6, '#ffd166', 120, 0.3, 2.4);
        state.footCops = state.footCops.filter((c) => c !== target);
      } else {
        target.hp -= WALK.punchDamage;
        burst(state, target.x, target.y, 5, '#ffffff', 100, 0.25, 2.2);
        if (target.hp <= 0) {
          downPed(state, target, 'punch');
          reportCrime(state, HEAT.killPed * 0.6, p.x, p.y);
        } else {
          target.state = 'flee';
          target.fleeFrom = p;
          reportCrime(state, 0.5, p.x, p.y);
        }
      }
    }
    state.events.push({ kind: 'punch' });
    return;
  }
  // Pistol shot.
  p.attackT = 0.21;
  p.angle = aimAngle;
  const spread = (state.rng.next() - 0.5) * 0.05;
  fireBullet(state, p.x + Math.cos(aimAngle) * 16, p.y + Math.sin(aimAngle) * 16, aimAngle + spread, 'player');
  state.shake = Math.min(0.45, (state.shake || 0) + 0.1); // the pistol kicks the camera, a little
  burst(state, p.x + Math.cos(aimAngle) * 20, p.y + Math.sin(aimAngle) * 20, 3, '#ffd166', 60, 0.08, 2.6);
  addScare(state, p.x, p.y, 240, 1.6);
  reportCrime(state, HEAT.shotFired, p.x, p.y);
  state.events.push({ kind: 'gunshot', x: p.x, y: p.y });
}

/** Foot officers open fire at three stars and up, with human inaccuracy. */
export function updateCopShooting(state, dt) {
  const p = state.player;
  if (state.stars < 3 || p.dead) return;
  for (const cop of state.footCops) {
    if (cop.shootT > 0) continue;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d > 320 || d < 26) continue;
    cop.shootT = state.rng.range(0.75, 1.3);
    const aim = Math.atan2(p.y - cop.y, p.x - cop.x) + (state.rng.next() - 0.5) * 0.16;
    fireBullet(state, cop.x + Math.cos(aim) * 14, cop.y + Math.sin(aim) * 14, aim, 'cop');
    addScare(state, cop.x, cop.y, 200, 1.2);
    state.events.push({ kind: 'gunshot', x: cop.x, y: cop.y });
  }
}

/** Move every bullet, and apply what it hits: buildings stop them, bodies and cars don't. */
export function updateBullets(state, dt) {
  const p = state.player;
  for (const b of state.bullets) {
    b.life -= dt;
    b.px = b.x;
    b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0) continue;
    if (state.city.solidForFoot(b.x, b.y)) {
      burst(state, b.x, b.y, 3, '#e8e0c8', 70, 0.2, 1.8);
      b.life = 0;
      continue;
    }
    if (b.from === 'player') {
      let hit = false;
      for (const ped of state.peds) {
        if (ped.state !== 'down' && dist(b.x, b.y, ped.x, ped.y) < 11) {
          ped.hp -= b.dmg;
          burst(state, ped.x, ped.y, 6, '#e5534b', 110, 0.3, 2.2);
          if (ped.hp <= 0) {
            downPed(state, ped, 'shot');
            reportCrime(state, HEAT.killPed, b.x, b.y);
          } else {
            ped.state = 'flee';
            ped.fleeFrom = p;
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const cop of state.footCops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 11) {
            state.footCops = state.footCops.filter((c) => c !== cop);
            burst(state, cop.x, cop.y, 8, '#2e6ff2', 130, 0.35, 2.4);
            reportCrime(state, 1.6, b.x, b.y);
            state.events.push({ kind: 'cop-hit' });
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const car of state.cars) {
          if (dist(b.x, b.y, car.x, car.y) < 21) {
            car.hp -= b.dmg * 0.5;
            burst(state, b.x, b.y, 4, '#ffd166', 120, 0.2, 2);
            hit = true;
            break;
          }
        }
      }
      if (hit) b.life = 0;
    } else if (!p.inCar && dist(b.x, b.y, p.x, p.y) < 12) {
      p.hp -= b.dmg;
      p.lastHurtT = state.time;
      burst(state, p.x, p.y, 5, '#e5534b', 110, 0.3, 2.2);
      b.life = 0;
      state.events.push({ kind: 'player-hurt' });
    } else if (p.inCar && dist(b.x, b.y, p.car.x, p.car.y) < 21) {
      p.car.hp -= b.dmg * 0.6;
      b.life = 0;
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
  p.hp = clamp(p.hp, 0, WALK.maxHealth);
}
