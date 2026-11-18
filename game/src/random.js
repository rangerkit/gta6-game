// A small seeded random number generator (mulberry32) plus the helpers the game uses
// everywhere: the same seed always gives the same city, the same traffic and the same
// screenshot scenes, which is what makes the staged shots repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap a random() function with range, integer, pick and chance helpers.
 *  Accepts a raw random() or an existing helpers object (it unwraps .next). */
export function rngHelpers(random) {
  if (typeof random !== 'function' && random && typeof random.next === 'function') random = random.next;
  return {
    next: random,
    range(min, max) {
      return min + random() * (max - min);
    },
    int(min, max) {
      return Math.floor(min + random() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(random() * list.length) % list.length];
    },
    chance(p) {
      return random() < p;
    },
    /** A random unit vector. */
    direction() {
      const angle = random() * Math.PI * 2;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    },
  };
}

/** Clamp a value into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move an angle toward a target by at most maxStep. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

/** Distance between two points. */
export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}
