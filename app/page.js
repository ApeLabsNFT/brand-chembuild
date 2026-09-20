"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Lenis from "lenis";
import { asset } from "./basePath";
import {
  TOTAL, SCENES, NAV_FRAMES, SEQUENCE_SPAN, PAST_AT,
  frameForProgress, sceneAt, textSceneAt, specsVisible,
} from "./sequence";

/* ================================================================
   FRAME SEQUENCE
   200 frames, flattened at build time into /public/seq/<tier>/fNNN.webp
   (was 4 folders + an offset map; the old TOTAL of 205 overran the
   real frame count by 5 and froze on the last image.)

   The timeline itself lives in ./sequence.js so tests can assert on it.
   ================================================================ */
const SCROLL_VH = 2800; // scroll distance driving the sequence

/* Decoded-bitmap budget. A 1920x1080 frame costs ~8MB decoded, so
   holding all 200 was ~1.7GB — the actual cause of the stutter and of
   mobile tabs being killed. We keep a window around the playhead. */
const WINDOW_DESKTOP = 120;
const WINDOW_MOBILE = 60;
const EAGER = 24; // frames that must be ready before we hide the loader
const AHEAD = 10; // prefetch distance in scroll direction
const BEHIND = 4;

const frameUrl = (tier, i) => asset(`/seq/${tier}/f${String(i).padStart(3, "0")}.webp`);

/* Which resolution tier to fetch. Re-evaluated on resize, not just at
   mount: a window that starts narrow (or measures 0 while the tab is
   still laying out) would otherwise stay locked to the 1100px frames
   even after being maximised. Treat a zero width as desktop rather than
   downgrading on a bogus measurement. */
function pickTier() {
  const w = window.innerWidth;
  if (!w) return "desktop";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return w <= 900 || coarse ? "mobile" : "desktop";
}

const SPECS = [
  { label: "Spec", value: "C2TES1 High-Performance", desc: "Highest European standard for deformable tile adhesives with extended open time and slip resistance." },
  { label: "Feature", value: "Zero Vertical Slip", desc: "Advanced polymer chemistry ensures tiles stay precisely where placed — zero movement under gravity." },
  { label: "Base", value: "Polymer-Modified Strength", desc: "Engineered polymer matrix delivers superior bond strength for large format tiles on any substrate." },
];

export default function Home() {
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  const lenisRef = useRef(null);
  const rafRef = useRef(null);
  const cursorRef = useRef(null);
  const hudDotRef = useRef(null);
  const hudNumRef = useRef(null);
  const hudTxtRef = useRef(null);

  /* Bitmap cache: index -> ImageBitmap, plus in-flight guard. */
  const bmpRef = useRef(new Map());
  const inflightRef = useRef(new Set());
  const tierRef = useRef("desktop");
  const windowRef = useRef(WINDOW_DESKTOP);
  const curRef = useRef(1);
  const lastDrawnRef = useRef(-1);
  const dirRef = useRef(1);
  const metricsRef = useRef({ dh: 1, w: 0, h: 0, dpr: 1 });
  const sceneRef = useRef(-1);
  const pastRef = useRef(false);
  const reducedRef = useRef(false);
  const scrollFallbackRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("Analyzing molecular bonds…");
  const [sceneIdx, setSceneIdx] = useState(0);
  const [visibleScene, setVisibleScene] = useState(-1);
  const [showSpecs, setShowSpecs] = useState(false);
  const [past, setPast] = useState(false);
  const [glass, setGlass] = useState(false);

  /* ---------------- bitmap loading ---------------- */

  const loadFrame = useCallback(async (i) => {
    const cache = bmpRef.current;
    if (cache.has(i) || inflightRef.current.has(i)) return;
    if (i < 0 || i >= TOTAL) return;
    inflightRef.current.add(i);
    try {
      const res = await fetch(frameUrl(tierRef.current, i), { cache: "force-cache" });
      if (!res.ok) throw new Error(res.status);
      const bmp = await createImageBitmap(await res.blob());
      cache.set(i, bmp);
      evict();
    } catch {
      /* a dropped frame is survivable — draw() falls back to the nearest one */
    } finally {
      inflightRef.current.delete(i);
    }
  }, []);

  /* Drop the frames furthest from the playhead, and release their
     memory explicitly rather than waiting on GC. */
  const evict = useCallback(() => {
    const cache = bmpRef.current;
    const max = windowRef.current;
    if (cache.size <= max) return;
    const cur = curRef.current - 1;
    const byDistance = [...cache.keys()].sort(
      (a, b) => Math.abs(b - cur) - Math.abs(a - cur)
    );
    for (const k of byDistance) {
      if (cache.size <= max) break;
      const bmp = cache.get(k);
      if (bmp && typeof bmp.close === "function") bmp.close();
      cache.delete(k);
    }
  }, []);

  /* Nearest loaded frame, so a not-yet-decoded frame holds the previous
     image instead of clearing the canvas. This is what removes the chop. */
  const nearest = useCallback((i) => {
    const cache = bmpRef.current;
    if (cache.has(i)) return cache.get(i);
    for (let d = 1; d <= 16; d++) {
      if (cache.has(i - d)) return cache.get(i - d);
      if (cache.has(i + d)) return cache.get(i + d);
    }
    return null;
  }, []);

  /* ---------------- drawing ---------------- */

  const draw = useCallback((f) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const img = nearest(Math.max(0, Math.min(f - 1, TOTAL - 1)));
    if (!img) return;

    const { w, h } = metricsRef.current; // device pixels; ctx is NOT scaled
    const ir = img.width / img.height;
    const cr = w / h;
    let dw, dh, dx, dy;

    if (cr < ir) {
      // viewport narrower than the frame (portrait / mobile)
      dh = h;
      dw = dh * ir;
      dx = (w - dw) * 0.85; // subject sits right-of-centre in these renders
      dy = 0;
    } else {
      dw = w;
      dh = dw / ir;
      dx = 0;
      dy = (h - dh) / 2;
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }, [nearest]);

  /* ---------------- scroll -> frame ---------------- */

  const update = useCallback(() => {
    const m = metricsRef.current;
    const st = window.scrollY || 0;
    const p = m.dh > 0 ? Math.max(0, Math.min(1, st / m.dh)) : 0;
    const f = frameForProgress(p);

    if (f !== curRef.current) {
      dirRef.current = Math.sign(f - curRef.current) || 1;
      curRef.current = f;
    }

    /* Keep the window around the playhead topped up. */
    const i = f - 1;
    loadFrame(i);
    for (let k = 1; k <= AHEAD; k++) loadFrame(i + k * dirRef.current);
    for (let k = 1; k <= BEHIND; k++) loadFrame(i - k * dirRef.current);

    if (f !== lastDrawnRef.current) {
      lastDrawnRef.current = f;
      draw(f);
    }

    /* HUD written straight to the DOM. Doing this through setState
       re-rendered the whole page ~200 times per scroll-through. */
    const sp = (f - 1) / (TOTAL - 1);
    if (hudDotRef.current) hudDotRef.current.style.top = `${sp * 100}%`;

    const ai = sceneAt(f);
    const isPast = p > PAST_AT;
    const vis = textSceneAt(f, isPast);
    const specs = !isPast && specsVisible(f);

    /* React state only when something actually changes — a handful of
       times across the whole page, not every frame. */
    if (ai !== sceneRef.current) {
      sceneRef.current = ai;
      const label = (ai >= 0 ? SCENES[ai].id : "Vision").toUpperCase();
      if (hudNumRef.current) hudNumRef.current.textContent = `PHASE ${String(Math.max(1, ai + 1)).padStart(2, "0")}`;
      if (hudTxtRef.current) hudTxtRef.current.textContent = label;
      setSceneIdx(ai);
    }
    if (isPast !== pastRef.current) { pastRef.current = isPast; setPast(isPast); }
    setVisibleScene((v) => (v === vis ? v : vis));
    setShowSpecs((v) => (v === specs ? v : specs));
    setGlass((v) => (v === f > 10 ? v : f > 10));
  }, [draw, loadFrame]);

  /* ---------------- sizing ---------------- */

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;

    /* Tier can change with the window. On a change, drop the cached
       bitmaps so subsequent fetches use the new resolution; the canvas
       keeps its last painted frame meanwhile, so there's no flash. */
    const tier = pickTier();
    if (tier !== tierRef.current) {
      tierRef.current = tier;
      windowRef.current = tier === "mobile" ? WINDOW_MOBILE : WINDOW_DESKTOP;
      for (const b of bmpRef.current.values()) b?.close?.();
      bmpRef.current.clear();
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap: 3x costs 2.25x the fill for no visible gain
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    c.width = w;
    c.height = h;
    c.style.width = `${window.innerWidth}px`;
    c.style.height = `${window.innerHeight}px`;

    /* Cache layout reads. update() ran on every rAF and read
       scrollHeight + innerHeight each time, forcing a synchronous
       layout 60x a second. */
    metricsRef.current = {
      w, h, dpr,
      dh: document.documentElement.scrollHeight - window.innerHeight,
    };
    lastDrawnRef.current = -1;
    draw(curRef.current || 1);
  }, [draw]);

  /* ---------------- cursor ---------------- */

  useEffect(() => {
    const c = cursorRef.current;
    if (!c || reducedRef.current) return;
    if (window.matchMedia("(pointer: coarse)").matches) return; // no custom cursor on touch

    let x = 0, y = 0, tx = 0, ty = 0, active = false, raf = null;

    const onMove = (e) => {
      x = e.clientX; y = e.clientY;
      const t = e.target;
      const mag = t.closest?.(".magnetic") || t.tagName === "A" || t.tagName === "BUTTON";
      if (mag) {
        /* getBoundingClientRect on every mousemove forced a layout per
           event; only measure when the hovered element changes. */
        const el = t.closest(".magnetic") || t;
        const r = el.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
        if (!active) { active = true; c.classList.add("active"); }
      } else if (active) {
        active = false; c.classList.remove("active");
      }
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const apply = () => {
      raf = null;
      const d = 0.2;
      const px = active ? x - 16 + (tx - x) * d : x - 16;
      const py = active ? y - 16 + (ty - y) * d : y - 16;
      c.style.transform = `translate3d(${px}px,${py}px,0) scale(${active ? 1.5 : 1})`;
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* ---------------- init ---------------- */

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    tierRef.current = pickTier();
    windowRef.current = tierRef.current === "mobile" ? WINDOW_MOBILE : WINDOW_DESKTOP;

    ctxRef.current = canvasRef.current.getContext("2d", { alpha: false });
    resize();

    let rt;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 120); };
    window.addEventListener("resize", onResize);

    /* Only the opening frames gate the loader; the rest stream in behind
       the experience. The old code fired 205 requests at once and gave up
       after a 5s timeout, which is why it started on a blank canvas. */
    const msgs = [
      "Analyzing molecular bonds…",
      "Calibrating polymer matrix…",
      "Mapping adhesion geometry…",
      "Initializing crystal lattice…",
      "Rendering molecular shield…",
    ];

    let cancelled = false;
    (async () => {
      let n = 0;
      await Promise.all(
        Array.from({ length: EAGER }, (_, i) =>
          loadFrame(i).then(() => {
            n++;
            const p = Math.round((n / EAGER) * 100);
            setPct(p);
            setMsg(msgs[Math.min(Math.floor(p / 20), 4)]);
          })
        )
      );
      if (cancelled) return;

      setLoading(false);
      lastDrawnRef.current = -1;
      draw(1);

      /* Safety net: the sequence is driven from the rAF loop, but rAF is
         suspended in background tabs and throttled under power saving, so
         a scroll that happens without it would leave the canvas stale.
         update() is idempotent and early-outs when the frame is unchanged,
         so running it from both sources is free. */
      scrollFallbackRef.current = () => update();
      window.addEventListener("scroll", scrollFallbackRef.current, { passive: true });

      if (reducedRef.current) return; // native scrolling only

      const lenis = new Lenis({
        duration: 1.4,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 2,
      });
      lenisRef.current = lenis;
      const loop = (t) => {
        lenis.raf(t);
        update();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    const cache = bmpRef.current;
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (scrollFallbackRef.current) window.removeEventListener("scroll", scrollFallbackRef.current);
      clearTimeout(rt);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (lenisRef.current) lenisRef.current.destroy();
      for (const b of cache.values()) b?.close?.();
      cache.clear();
    };
  }, [resize, draw, update, loadFrame]);

  /* ---------------- nav ---------------- */

  const goFrame = (targetF) => {
    const target = ((targetF - 1) / (TOTAL - 1)) * SEQUENCE_SPAN * metricsRef.current.dh;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, {
        duration: 1.2,
        easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      });
    } else {
      window.scrollTo({ top: target, behavior: reducedRef.current ? "auto" : "smooth" });
    }
  };
  const goEnd = () => {
    const target = 0.95 * metricsRef.current.dh;
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 2 });
    else window.scrollTo({ top: target, behavior: "smooth" });
  };

  return (
    <>
      <div className="cursor" ref={cursorRef} aria-hidden="true"><div className="cursor-ring" /></div>

      {/* Loader */}
      <div className={`loader${loading ? "" : " hidden"}`}>
        <div className="loader-inner">
          <img src={asset("/logo.png")} alt="Brand" className="loader-logo" width="72" height="72" />
          <div className="loader-bar-wrap"><div className="loader-bar" style={{ width: `${pct}%` }} /></div>
          <p className="loader-text">{msg}</p>
          <p className="loader-pct">{pct}%</p>
        </div>
      </div>

      {/* Header */}
      <header className={`hdr ${glass ? "glass" : ""}`}>
        <div className="hdr-left" onClick={() => goFrame(1)}>
          <img src={asset("/logo.png")} alt="Brand" className="hdr-logo" width="34" height="34" />
        </div>
        <nav className="hdr-center">
          <a href="#" className={`hdr-link ${sceneIdx === 0 ? "on" : ""}`} onClick={(e) => { e.preventDefault(); goFrame(NAV_FRAMES.vision); }}>Vision</a>
          <a href="#" className={`hdr-link ${sceneIdx === 1 ? "on" : ""}`} onClick={(e) => { e.preventDefault(); goFrame(NAV_FRAMES.science); }}>The Science</a>
          <a href="#" className={`hdr-link ${sceneIdx === 2 ? "on" : ""}`} onClick={(e) => { e.preventDefault(); goFrame(NAV_FRAMES.shield); }}>The Shield</a>
          <a href="#" className={`hdr-link ${sceneIdx === 3 ? "on" : ""}`} onClick={(e) => { e.preventDefault(); goFrame(NAV_FRAMES.product); }}>The Product</a>
        </nav>
        <div className="hdr-right">
          <button className="hdr-btn" onClick={goEnd}>Specifier Portal</button>
        </div>
      </header>

      {/* Story HUD */}
      <div className="story-hud">
        <div className="hud-line"><div className="hud-dot" ref={hudDotRef} /></div>
        <div className="hud-phase">
          <span className="phase-num" ref={hudNumRef}>PHASE 01</span>
          <span className="phase-sep">//</span>
          <span className="phase-txt" ref={hudTxtRef}>VISION</span>
        </div>
      </div>

      <div className="star" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 0L13.5 10.5L24 12L13.5 13.5L12 24L10.5 13.5L0 12L10.5 10.5Z" fill="white" fillOpacity="0.7" />
        </svg>
      </div>

      <div className="vglow" />

      {/* Canvas */}
      <div className="vp" style={{ opacity: past ? 0 : 1, transition: "opacity 0.5s" }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Scroll height */}
      <div style={{ height: `${SCROLL_VH}vh`, position: "relative", zIndex: 0, pointerEvents: "none" }} />

      {visibleScene === 0 && (
        <div className="ov">
          <div className="ov-center">
            <h1 className="h1 h1-hero">{SCENES[0].h1}</h1>
            <p className="h2">{SCENES[0].h2}</p>
          </div>
        </div>
      )}

      {visibleScene === 1 && (
        <div className="ov">
          <div className="ov-dna">
            <div className="gcard">
              <p className="gcard-t">Waterproofing Membrane:</p>
              <p className="gcard-v">Tested at 50 bar pressure.</p>
            </div>
            <h1 className="h1 h1-hero" style={{ whiteSpace: "pre-line" }}>{SCENES[1].h1}</h1>
          </div>
        </div>
      )}

      {visibleScene === 2 && (
        <div className="ov">
          <div className="ov-center">
            <h1 className="h1 h1-hero">{SCENES[2].h1}</h1>
            <p className="h2 h2-lg">{SCENES[2].h2}</p>
          </div>
        </div>
      )}

      {visibleScene === 3 && (
        <div className="ov ov-prod">
          <div className="prod-wrap">
            <p className="prod-tag">The Chemistry of Integrity</p>
            <h1 className="h1 h1-sm" style={{ whiteSpace: "pre-line", textAlign: "right" }}>{SCENES[3].h1}</h1>
            {showSpecs && (
              <div className="hud-list">
                {SPECS.map((sp, i) => (
                  <div key={i} className="hud-card">
                    <div className="hud-hdr"><div className="hud-dot" /><span className="hud-lbl">{sp.label}</span></div>
                    <div className="hud-val">{sp.value}</div>
                    <div className="hud-desc">{sp.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {past && (
        <div className="legacy on">
          <div className="legacy-bg">
            <img src={frameUrl("desktop", TOTAL - 1)} className="legacy-img" alt="" loading="lazy" decoding="async" />
          </div>
          <div className="legacy-fade" />
          <div className="legacy-body">
            <h1 className="h1-grand">Built to Outlast.</h1>
            <button className="cta-btn magnetic" onClick={() => goFrame(NAV_FRAMES.vision)}>Restart Journey</button>
          </div>
        </div>
      )}
    </>
  );
}
