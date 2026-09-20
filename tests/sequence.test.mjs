import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import {
  TOTAL, SCENES, NAV_FRAMES, SEQUENCE_SPAN, PAST_AT,
  frameForProgress, sceneAt, textSceneAt, specsVisible,
} from "../app/sequence.js";

const SEQ = new URL("../public/seq/", import.meta.url);

test("every declared frame exists on disk, in both tiers", () => {
  for (const tier of ["desktop", "mobile"]) {
    const files = new Set(readdirSync(new URL(`${tier}/`, SEQ)));
    assert.equal(files.size, TOTAL, `${tier} should hold exactly ${TOTAL} frames`);
    for (let i = 0; i < TOTAL; i++) {
      const name = `f${String(i).padStart(3, "0")}.webp`;
      assert.ok(files.has(name), `${tier}/${name} is missing`);
    }
  }
});

test("scenes tile the sequence with no gap and no overlap", () => {
  assert.equal(SCENES[0].frameStart, 1);
  assert.equal(SCENES[SCENES.length - 1].frameEnd, TOTAL,
    "the last scene must end on the last real frame — this is what TOTAL=205 got wrong");
  for (let i = 1; i < SCENES.length; i++) {
    assert.equal(SCENES[i].frameStart, SCENES[i - 1].frameEnd + 1,
      `gap/overlap between ${SCENES[i - 1].id} and ${SCENES[i].id}`);
  }
});

test("each scene's text window sits inside its own frame range", () => {
  for (const s of SCENES) {
    assert.ok(s.textIn >= s.frameStart, `${s.id}: textIn precedes the scene`);
    assert.ok(s.textOut <= s.frameEnd, `${s.id}: textOut outlives the scene`);
    assert.ok(s.textIn < s.textOut, `${s.id}: empty text window`);
  }
});

test("spec cards actually become visible", () => {
  // The original condition was `frame >= 205` inside a window ending at 188,
  // so the cards never rendered once.
  const shown = [];
  for (let f = 1; f <= TOTAL; f++) if (specsVisible(f)) shown.push(f);
  assert.ok(shown.length > 0, "spec cards never appear at any frame");
  assert.equal(shown[0], 176);
  assert.equal(shown[shown.length - 1], 196);
});

test("no frame maps outside the real sequence", () => {
  for (let i = 0; i <= 1000; i++) {
    const f = frameForProgress(i / 1000);
    assert.ok(f >= 1 && f <= TOTAL, `progress ${i / 1000} -> frame ${f}`);
    assert.ok(Number.isInteger(f));
  }
  assert.equal(frameForProgress(0), 1);
  assert.equal(frameForProgress(SEQUENCE_SPAN), TOTAL, "sequence must reach its last frame");
  assert.equal(frameForProgress(1), TOTAL);
  assert.equal(frameForProgress(-5), 1);
});

test("the sequence completes before the outro takes over", () => {
  assert.ok(SEQUENCE_SPAN < PAST_AT,
    "frames would still be advancing after the canvas has faded out");
});

test("every nav target lands inside the scene it names", () => {
  const ids = SCENES.map((s) => s.id.toLowerCase());
  for (const [name, frame] of Object.entries(NAV_FRAMES)) {
    const i = sceneAt(frame);
    assert.notEqual(i, -1, `nav "${name}" -> frame ${frame} is outside every scene`);
    assert.equal(ids[i], name, `nav "${name}" -> frame ${frame} lands in ${ids[i]}`);
  }
});

test("at most one scene's text shows at a time", () => {
  for (let f = 1; f <= TOTAL; f++) {
    const hits = SCENES.filter((s) => f >= s.textIn && f <= s.textOut);
    assert.ok(hits.length <= 1, `frame ${f} shows ${hits.length} headings at once`);
  }
});

test("past the handover point no text is shown", () => {
  for (let f = 1; f <= TOTAL; f++) {
    assert.equal(textSceneAt(f, true), -1);
  }
});
