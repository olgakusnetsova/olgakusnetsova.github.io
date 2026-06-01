(() => {
  const params = new URLSearchParams(window.location.search);
  const motionParam = (params.get("motion") || "").toLowerCase();
  const forceMotion = motionParam === "on" || motionParam === "full" || motionParam === "force";
  if (forceMotion) {
    document.documentElement.classList.add("force-motion");
  }
  const frame = document.getElementById("frame");
  const headRunner = document.getElementById("headRunner");
  const rearRunner = document.getElementById("rearRunner");
  const bodyStripes = document.getElementById("bodyStripes");
  const trackText = document.getElementById("trackText");
  const welcomeLetters = Array.from(document.querySelectorAll(".welcome-letter"));

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const CONFIG = {
    track: {
      xStart: -20,
      xEnd: 112,
      eraseFactor: 0.9,
      centerY: 50,
    },
    timing: {
      growMobileMs: 3100,
      growDesktopMs: 3100,
    },
    geometry: {
      headRunnerHeight: 30,
      rearRunnerHeight: 12.5,
      // Fine offsets because SVG viewBoxes have different internal paddings.
      headBottomOffset: 0.2,
      rearBottomOffset: 1.0,
      headBodyAnchor: 11,
      rearEraseAnchor: 17,
    },
    stripe: {
      bodyThicknessFallback: 8.7,
      text: "SAUSAGE PARTY",
    },
    neon: {
      minPauseMs: 260,
      maxPauseMs: 1200,
      minFlickerMs: 120,
      maxFlickerMs: 340,
      multiLetterChance: 0.35,
    },
    svg: {
      headViewBox: "560 380 220 250",
      rearViewBox: "235 485 250 135",
      headIds: ["front", "ear", "eye", "leftfrontleg", "rightfrontleg"],
      rearIds: ["rear", "tail", "leftrearleg", "rightrearleg"],
      classById: {
        leftfrontleg: "front-leg leg-a",
        rightfrontleg: "front-leg leg-b",
        leftrearleg: "back-leg leg-a",
        rightrearleg: "back-leg leg-b",
        tail: "tail-shape",
      },
    },
  };

  function resolveReducedMotion() {
    if (motionParam === "on" || motionParam === "full" || motionParam === "force") {
      return false;
    }
    if (motionParam === "off" || motionParam === "reduce") {
      return true;
    }
    return reducedMotion.matches;
  }

  const state = {
    phase: "grow",
    phaseStartedAt: 0,
    growMs: CONFIG.timing.growMobileMs,
    headY: 82,
    rearY: 82,
    stripeTop: 88,
    stripeThickness: CONFIG.stripe.bodyThicknessFallback,
    stripe: null,
    rafId: 0,
    reduced: resolveReducedMotion(),
    ready: false,
    scale: 1,
    trackStart: CONFIG.track.xStart,
    trackEnd: CONFIG.track.xEnd,
    flickerTimeoutId: 0,
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function parseCssNumber(node, variable, fallback) {
    const raw = getComputedStyle(node).getPropertyValue(variable).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function setRunnerXY(el, x, y) {
    el.style.setProperty("--x", x.toFixed(4));
    el.style.setProperty("--y", y.toFixed(4));
  }

  function setStripeRange(left, right) {
    if (!state.stripe) return;
    const safeLeft = clamp(left, 0, 100);
    const safeRight = clamp(right, 0, 100);
    state.stripe.style.left = `${safeLeft.toFixed(4)}%`;
    state.stripe.style.right = `${safeRight.toFixed(4)}%`;

    if (100 - safeLeft - safeRight <= 0.05) {
      state.stripe.classList.remove("on");
      state.stripe.classList.add("off");
      return;
    }

    state.stripe.classList.remove("off");
    state.stripe.classList.add("on");
  }

  function mountStripe() {
    bodyStripes.innerHTML = "";
    const stripe = document.createElement("span");
    stripe.className = "stripe off";
    stripe.style.top = `${state.stripeTop.toFixed(4)}%`;
    bodyStripes.appendChild(stripe);
    state.stripe = stripe;
    if (trackText) {
      trackText.textContent = CONFIG.stripe.text;
      const center = state.stripeTop + state.stripeThickness * 0.5;
      trackText.style.top = `${center.toFixed(4)}%`;
    }
  }

  function clearFlickerLoop() {
    if (state.flickerTimeoutId) {
      clearTimeout(state.flickerTimeoutId);
      state.flickerTimeoutId = 0;
    }
    welcomeLetters.forEach((letter) => letter.classList.remove("is-flickering"));
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickRandomLetters() {
    if (welcomeLetters.length === 0) return [];
    const picked = [];
    const first = welcomeLetters[Math.floor(Math.random() * welcomeLetters.length)];
    picked.push(first);
    if (Math.random() < CONFIG.neon.multiLetterChance && welcomeLetters.length > 1) {
      let second = first;
      while (second === first) {
        second = welcomeLetters[Math.floor(Math.random() * welcomeLetters.length)];
      }
      picked.push(second);
    }
    return picked;
  }

  function scheduleNeonFlicker() {
    clearFlickerLoop();
    if (state.reduced || welcomeLetters.length === 0) return;

    const run = () => {
      const letters = pickRandomLetters();
      const flickerMs = randomBetween(CONFIG.neon.minFlickerMs, CONFIG.neon.maxFlickerMs);
      letters.forEach((letter) => letter.classList.add("is-flickering"));

      state.flickerTimeoutId = window.setTimeout(() => {
        letters.forEach((letter) => letter.classList.remove("is-flickering"));
        const pauseMs = randomBetween(CONFIG.neon.minPauseMs, CONFIG.neon.maxPauseMs);
        state.flickerTimeoutId = window.setTimeout(run, pauseMs);
      }, flickerMs);
    };

    const startDelay = randomBetween(CONFIG.neon.minPauseMs, CONFIG.neon.maxPauseMs);
    state.flickerTimeoutId = window.setTimeout(run, startDelay);
  }

  function createRunnerSvg(sourceSvg, ids, viewBox) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("dog-svg");

    ids.forEach((id) => {
      const node = sourceSvg.querySelector(`#${id}`);
      if (!node) return;
      const clone = node.cloneNode(true);
      clone.removeAttribute("id");
      clone.setAttribute("data-part", id);
      const cls = CONFIG.svg.classById[id];
      if (cls) clone.setAttribute("class", cls);
      svg.appendChild(clone);
    });

    return svg;
  }

  async function mountSvgRunners() {
    const response = await fetch("./dachsund.svg", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load dachsund.svg: ${response.status}`);
    }

    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    const sourceSvg = doc.querySelector("svg");
    if (!sourceSvg) {
      throw new Error("Invalid SVG: missing <svg> root");
    }

    headRunner.innerHTML = "";
    rearRunner.innerHTML = "";
    headRunner.appendChild(createRunnerSvg(sourceSvg, CONFIG.svg.headIds, CONFIG.svg.headViewBox));
    rearRunner.appendChild(createRunnerSvg(sourceSvg, CONFIG.svg.rearIds, CONFIG.svg.rearViewBox));
  }

  function updateGeometry() {
    const topPad = parseCssNumber(frame, "--frame-padding-top", 6);
    const bottomPad = parseCssNumber(frame, "--frame-padding-bottom", 6);
    state.scale = parseCssNumber(frame, "--dog-scale", 1);
    const centerY = CONFIG.track.centerY;
    const s = state.scale;

    state.trackStart = CONFIG.track.xStart * s;
    state.trackEnd = 100 + (CONFIG.track.xEnd - 100) * s;

    const headCenterOffset = CONFIG.geometry.headRunnerHeight * s * 0.5;
    const rearCenterOffset = CONFIG.geometry.rearRunnerHeight * s * 0.5;
    state.headY = clamp(centerY - headCenterOffset, topPad, 100 - CONFIG.geometry.headRunnerHeight * s);
    state.rearY = clamp(centerY - rearCenterOffset, topPad, 100 - CONFIG.geometry.rearRunnerHeight * s);
    state.stripeThickness = parseCssNumber(frame, "--body-thickness", CONFIG.stripe.bodyThicknessFallback) * s;
    state.stripeTop = centerY - (state.stripeThickness * 0.5);
  }

  function updateTiming() {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    state.growMs = desktop ? CONFIG.timing.growDesktopMs : CONFIG.timing.growMobileMs;
  }

  function setPhase(phase, now) {
    state.phase = phase;
    state.phaseStartedAt = now;

    if (phase === "grow") {
      headRunner.classList.remove("is-hidden", "legs-paused");
      rearRunner.classList.add("is-hidden", "legs-paused");
      setRunnerXY(rearRunner, state.trackStart, state.rearY);
      return;
    }

    headRunner.classList.add("is-hidden", "legs-paused");
    rearRunner.classList.remove("is-hidden", "legs-paused");
    setRunnerXY(headRunner, state.trackEnd, state.headY);
    setRunnerXY(rearRunner, state.trackStart, state.rearY);
  }

  function applyReducedStatic() {
    cancelAnimationFrame(state.rafId);
    headRunner.classList.remove("is-hidden");
    rearRunner.classList.remove("is-hidden");
    headRunner.classList.add("legs-paused");
    rearRunner.classList.add("legs-paused");
    setRunnerXY(headRunner, 56, state.headY);
    setRunnerXY(rearRunner, 36, state.rearY);
    setStripeRange(42, 33);
  }

  function updateGrow(now) {
    const progress = clamp((now - state.phaseStartedAt) / state.growMs, 0, 1);
    const headX = lerp(state.trackStart, state.trackEnd, progress);
    const headAnchor = clamp(headX + CONFIG.geometry.headBodyAnchor * state.scale, 0, 100);

    setRunnerXY(headRunner, headX, state.headY);
    setStripeRange(0, 100 - headAnchor);

    if (progress >= 1) {
      setStripeRange(0, 0);
      setPhase("erase", now);
    }
  }

  function updateErase(now) {
    const duration = state.growMs * CONFIG.track.eraseFactor;
    const progress = clamp((now - state.phaseStartedAt) / duration, 0, 1);
    const rearX = lerp(state.trackStart, state.trackEnd, progress);
    const eraseAnchor = clamp(rearX + CONFIG.geometry.rearEraseAnchor * state.scale, 0, 100);

    setRunnerXY(rearRunner, rearX, state.rearY);
    setStripeRange(eraseAnchor, 0);

    if (progress >= 1) {
      setStripeRange(100, 0);
      setPhase("grow", now);
      setRunnerXY(headRunner, state.trackStart, state.headY);
    }
  }

  function tick(now) {
    if (!state.ready) return;

    if (state.reduced) {
      applyReducedStatic();
      return;
    }

    if (state.phase === "grow") {
      updateGrow(now);
    } else {
      updateErase(now);
    }

    state.rafId = requestAnimationFrame(tick);
  }

  function recalc(now = performance.now()) {
    if (!state.ready) return;

    updateGeometry();
    updateTiming();
    mountStripe();

    if (state.reduced) {
      applyReducedStatic();
      return;
    }

    setPhase("grow", now);
    setRunnerXY(headRunner, state.trackStart, state.headY);
    setStripeRange(100, 0);

    cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(tick);
  }

  reducedMotion.addEventListener("change", (event) => {
    if (motionParam === "on" || motionParam === "full" || motionParam === "force") return;
    if (motionParam === "off" || motionParam === "reduce") return;
    state.reduced = event.matches;
    scheduleNeonFlicker();
    recalc(performance.now());
  });

  window.addEventListener("resize", () => {
    recalc(performance.now());
  });

  mountSvgRunners()
    .then(() => {
      state.ready = true;
      scheduleNeonFlicker();
      recalc(performance.now());
    })
    .catch((error) => {
      console.error(error);
    });
})();
