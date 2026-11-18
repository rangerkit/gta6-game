// Input: the keyboard and mouse, read as a small state the simulation polls each step —
// held keys for movement and driving, an aim point in screen space for combat, and a queue
// of one-shot actions (interact, pause, confirm) that screens and the world consume.
export const ACTION_INTERACT = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_ATTACK = 8;

const KEYMAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'attack',
  KeyJ: 'attack',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, sprint: false, attack: false };
  let actions = 0;
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (event) => {
    const name = KEYMAP[event.code];
    if (name) {
      held[name] = true;
      if (name === 'attack' && !event.repeat) actions |= ACTION_ATTACK;
      event.preventDefault();
    }
    if (event.code === 'KeyF' || event.code === 'KeyE') {
      if (!event.repeat) actions |= ACTION_INTERACT;
    }
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (!event.repeat) actions |= ACTION_PAUSE;
    }
    if (event.code === 'Enter' && !event.repeat) actions |= ACTION_CONFIRM;
  });
  window.addEventListener('keyup', (event) => {
    const name = KEYMAP[event.code];
    if (name) held[name] = false;
  });
  window.addEventListener('blur', () => {
    for (const key of Object.keys(held)) held[key] = false;
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      actions |= ACTION_ATTACK | ACTION_CONFIRM;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    mouse,
    /** Movement axes, each -1..1, from the held keys. */
    axes() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** Driving controls from the same keys: throttle and steer, each -1..1. */
    drive() {
      return {
        throttle: (held.up ? 1 : 0) - (held.down ? 1 : 0),
        steer: (held.right ? 1 : 0) - (held.left ? 1 : 0),
      };
    },
    attacking() {
      return held.attack || mouse.down;
    },
    /** Take (and clear) the one-shot actions pressed since the last call. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
