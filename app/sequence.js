/**
 * Pure scroll->frame->scene mapping, kept free of React and the DOM so it
 * can be tested directly (see tests/sequence.test.mjs).
 *
 * The original version of this lived inline in the page component with
 * TOTAL = 205 against 200 real frames, and a spec-card condition that could
 * never be true. Both were invisible without something to assert against.
 */

export const TOTAL = 200;

/** Fraction of total scroll spent on the sequence; the tail is the outro. */
export const SEQUENCE_SPAN = 0.88;

/** Past this scroll fraction the canvas hands over to the closing panel. */
export const PAST_AT = 0.97;

export const SCENES = [
  {
    id: "Vision",
    frameStart: 1, frameEnd: 40,
    textIn: 4, textOut: 32,
    h1: "Architecture is a vision.",
    h2: "We make it permanent.",
  },
  {
    id: "Science",
    frameStart: 41, frameEnd: 120,
    textIn: 50, textOut: 110,
    h1: "Precision at the\nMolecular Level.",
  },
  {
    id: "Shield",
    frameStart: 121, frameEnd: 160,
    textIn: 124, textOut: 152,
    h1: "Water is the enemy of time.",
    h2: "We are the shield.",
  },
  {
    id: "Product",
    frameStart: 161, frameEnd: 200,
    textIn: 166, textOut: 196,
    specsFrom: 176,
    h1: "The Core of Modern\nConstruction.",
    h2: "Engineered for excellence.",
  },
];

/** Nav targets, as frame numbers. Each must land inside its scene. */
export const NAV_FRAMES = { vision: 1, science: 49, shield: 121, product: 166 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Scroll progress (0..1) -> 1-based frame number. */
export function frameForProgress(p) {
  const fp = Math.min(1, clamp(p, 0, 1) / SEQUENCE_SPAN);
  return clamp(Math.round(fp * (TOTAL - 1)) + 1, 1, TOTAL);
}

/** Index of the scene owning this frame, or -1. */
export function sceneAt(frame) {
  for (let i = 0; i < SCENES.length; i++) {
    if (frame >= SCENES[i].frameStart && frame <= SCENES[i].frameEnd) return i;
  }
  return -1;
}

/** Index of the scene whose text is on screen, or -1. */
export function textSceneAt(frame, past) {
  if (past) return -1;
  for (let i = 0; i < SCENES.length; i++) {
    if (frame >= SCENES[i].textIn && frame <= SCENES[i].textOut) return i;
  }
  return -1;
}

/** Whether the product spec cards should be showing. */
export function specsVisible(frame) {
  const s = SCENES[sceneAt(frame)];
  return !!(s && s.specsFrom && frame >= s.specsFrom && frame <= s.textOut);
}
