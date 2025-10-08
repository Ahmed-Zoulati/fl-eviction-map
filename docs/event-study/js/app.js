/* Two charts side-by-side (Evictions + Filings) for a chosen storm type.
   - Populates storm-type dropdown from manifest
   - Loads the ES & DiD for both outcomes
   - Draws vertical dashed ref line at midpoint between k=-2 and k=0 (≈ -1) and horizontal dashed zero line
*/

/* ================== DATASET SWITCH (top viewer) ==================
   Default = CORE dataset (data/processed/...).
   You can optionally load FEMA into the TOP viewer via URL params:
     ?set=fema&method=history&storm=hurricane
   The FEMA section below (second pair) still uses its own controls.
*/
const q = new URLSearchParams(location.search);
const SET    = (q.get("set") || "core").toLowerCase();      // "core" | "fema"
const METHOD = (q.get("method") || "").toLowerCase();       // "history" | "psm" (when SET=fema)
const STORM  = (q.get("storm")  || "").toLowerCase();       // e.g. "hurricane" (optional)

/* Build paths for the TOP viewer (GH Pages-friendly: no "../") */
const paths = (SET === "fema")
  ? {
      manifest: "data_fema/processed/index.json?v=gh",
      es:  (slug) => `data_fema/processed/event_studies/${slug}.json?v=gh`,
      did: (slug) => `data_fema/processed/did/${slug}.json?v=gh`,
    }
  : {
      manifest: "data/processed/index.json?v=gh",
      es:  (slug) => `data/processed/event_studies/${slug}.json?v=gh`,
      did: (slug) => `data/processed/did/${slug}.json?v=gh`,
    };

const state = {
  manifest: null,
  charts: { evict: null, filing: null },
  map: {} // {storm_type: {evict: slug, filing: slug}}
};

// Formatting helpers
const fmt = {
  num: (x, d=3) => (x==null || isNaN(x) ? "—" : (+x).toFixed(d)),
  p: (x) => (x==null || isNaN(x) ? "—" : (+x).toFixed(3)),
  ci: (lo, hi, d=3) => (lo==null||hi==null||isNaN(lo)||isNaN(hi) ? "—" : `[${(+lo).toFixed(d)}, ${(+hi).toFixed(d)}]`)
};

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.json();
}

/* If SET=fema, filter by method for the TOP viewer (only when valid) */
function buildMapFromManifest(manifest, methodFilter=null) {
  const map = {};
  for (const s of (manifest.studies || [])) {
    if (methodFilter) {
      const m = (s.method || "").toLowerCase();
      if (m !== methodFilter) continue;
    }
    if (!map[s.storm_type]) map[s.storm_type] = {};
    map[s.storm_type][s.outcome] = s.slug;
  }
  return map;
}

async function loadManifest() {
  const j = await fetchJSON(paths.manifest);
  const validMethod = (METHOD === "history" || METHOD === "psm") ? METHOD : null;
  state.manifest = j;
  state.map = buildMapFromManifest(j, (SET === "fema" ? validMethod : null));

  const sel = document.getElementById("storm-select");
  sel.innerHTML = "";

  const labelFor = {
    hurricane: "Hurricane",
    tropical: "Tropical Storm",
    both: "Hurricane + Tropical"
  };

  const stormTypes = Object.keys(state.map);
  if (stormTypes.length === 0) {
    sel.innerHTML = `<option value="">No studies found</option>`;
    return;
  }

  for (const st of stormTypes) {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = labelFor[st] || st;
    sel.appendChild(opt);
  }

  const defaultST =
    (STORM && stormTypes.includes(STORM)) ? STORM :
    (stormTypes.includes("hurricane") ? "hurricane" : stormTypes[0]);

  sel.value = defaultST;
  return defaultST;
}

function prepareChartData(es) {
  const labels = es.series.map(r => r.k);
  const est = es.series.map(r => r.estimate ?? null);
  const ciL = es.series.map(r => r.ci_low ?? null);
  const ciH = es.series.map(r => r.ci_high ?? null);
  return { labels, est, ciL, ciH, ref: es.reference_period ?? -1 };
}

/* ---- Plugin: zero line + ref line at midpoint between k=-2 and k=0 ---- */
const referenceLinesPlugin = {
  id: 'referenceLines',
  afterDatasetsDraw(chart, _args, opts) {
    const area = chart.chartArea;
    if (!area) return;

    const x = chart.scales.x; // category scale
    const y = chart.scales.y; // linear scale
    const ctx = chart.ctx;
    const labels = chart.data.labels;

    const xForK = (kVal) => {
      const idx = labels.indexOf(kVal);
      if (idx === -1) return null;
      return x.getPixelForTick(idx);
    };

    const idxLeft = (() => {
      let best = -1;
      for (let i = 0; i < labels.length; i++) if (+labels[i] < 0) best = i;
      return best;
    })();
    const idxRight = (() => {
      for (let i = 0; i < labels.length; i++) if (+labels[i] >= 0) return i;
      return -1;
    })();

    let xRef = null;
    if (idxLeft !== -1 && idxRight !== -1) {
      const xLeft = x.getPixelForTick(idxLeft);
      const xRight = x.getPixelForTick(idxRight);
      xRef = (xLeft + xRight) / 2;
    } else {
      const xNeg2 = xForK(-2);
      const xZero = xForK(0);
      if (xNeg2 !== null && xZero !== null) xRef = (xNeg2 + xZero) / 2;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';

    const yZero = y.getPixelForValue(0);
    ctx.beginPath();
    ctx.moveTo(area.left, yZero);
    ctx.lineTo(area.right, yZero);
    ctx.stroke();

    if (xRef !== null && isFinite(xRef)) {
      ctx.beginPath();
      ctx.moveTo(xRef, area.top);
      ctx.lineTo(xRef, area.bottom);
      ctx.stroke();
    }

    ctx.restore();
  }
};
Chart.register(referenceLinesPlugin);
/* ---------------------------------------------------------------------- */

function drawChart(canvasId, data) {
  const ctx = document.getElementById(canvasId).getContext("2d");

  // Ensure any existing chart on this canvas is destroyed first
  for (const key of Object.keys(state.charts)) {
    if (state.charts[key] && state.charts[key].canvas && state.charts[key].canvas.id === canvasId) {
      state.charts[key].destroy();
      state.charts[key] = null;
    }
  }

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        { label: "Estimate", data: data.est, borderWidth: 2, pointRadius: 2, tension: 0.2 },
        { label: "CI low",   data: data.ciL, borderWidth: 1, borderDash: [4,3], pointRadius: 0 },
        { label: "CI high",  data: data.ciH, borderWidth: 1, borderDash: [4,3], pointRadius: 0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Event time (months)" }, grid: { display: false } },
        y: { title: { display: true, text: "Coefficient" } }
      },
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { title: (items)=> `k = ${items[0].label}` } },
        referenceLines: {}
      }
    }
  });

  return chart;
}

function showDid(did, prefix) {
  const q = (id, v)=> document.getElementById(id).textContent = v;
  q(`did-${prefix}-term`, did.term ?? "—");
  q(`did-${prefix}-est`, fmt.num(did.estimate));
  q(`did-${prefix}-se`, fmt.num(did.se));
  q(`did-${prefix}-t`, fmt.num(did.t));
  q(`did-${prefix}-p`, fmt.p(did.p));
  q(`did-${prefix}-ci`, fmt.ci(did.ci_low, did.ci_high));
  const m = did.meta || {};
  q(`did-${prefix}-dep`, m.dep_var ?? "—");
  q(`did-${prefix}-fe`, m.fixed_effects ?? "—");
  q(`did-${prefix}-obs`, m.observations ?? "—");
  q(`did-${prefix}-rmse`, m.rmse ?? "—");
  q(`did-${prefix}-r2`, m.r2 ?? "—");
}

async function loadOne(stormType, outcome, canvasId, capId, missingId, chartKey, didPrefix) {
  const slug = state.map?.[stormType]?.[outcome];
  const missingEl = document.getElementById(missingId);
  const cap = document.getElementById(capId);

  if (!slug) {
    if (state.charts[chartKey]) { state.charts[chartKey].destroy(); state.charts[chartKey] = null; }
    if (missingEl) missingEl.style.display = "block";
    if (cap) cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
    showDid({}, didPrefix);
    return;
  }

  try {
    const es = await fetchJSON(paths.es(slug));
    const data = prepareChartData(es);
    const chart = drawChart(canvasId, data);
    state.charts[chartKey] = chart;
    if (missingEl) missingEl.style.display = "none";
    if (cap) cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
    try {
      const did = await fetchJSON(paths.did(slug));
      showDid(did, didPrefix);
    } catch {
      showDid({}, didPrefix);
    }
  } catch (e) {
    console.error(e);
    if (state.charts[chartKey]) { state.charts[chartKey].destroy(); state.charts[chartKey] = null; }
    if (missingEl) missingEl.style.display = "block";
    if (cap) cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
    showDid({}, didPrefix);
  }
}

async function loadPair(stormType) {
  await Promise.all([
    loadOne(stormType, "evict", "esChartEvict", "chart-caption-evict", "missing-evict", "evict", "e"),
    loadOne(stormType, "filing", "esChartFiling", "chart-caption-filing", "missing-filing", "filing", "f")
  ]);
}

async function boot() {
  const defaultST = await loadManifest();
  const sel = document.getElementById("storm-select");

  if (sel.value) {
    await loadPair(sel.value);
  } else if (defaultST) {
    await loadPair(defaultST);
  }

  sel.addEventListener("change", async (e) => {
    await loadPair(e.target.value);
  });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const st = sel.value;
    await loadManifest();
    sel.value = st in (state.map || {}) ? st : (Object.keys(state.map)[0] || "");
    if (sel.value) await loadPair(sel.value);
  });

  document.getElementById("save-evict").addEventListener("click", () => {
    const ch = state.charts.evict; if (!ch) return;
    const a = document.createElement("a"); a.href = ch.toBase64Image(); a.download = "event-study_evictions.png"; a.click();
  });
  document.getElementById("save-filing").addEventListener("click", () => {
    const ch = state.charts.filing; if (!ch) return;
    const a = document.createElement("a"); a.href = ch.toBase64Image(); a.download = "event-study_filings.png"; a.click();
  });
}

boot().catch(err => {
  alert("Error: " + err.message);
  console.error(err);
});

/* ========================= FEMA SECTION =========================
   FEMA results (second pair) with its own method/cohort controls.
   Slugs:
   - FEMA cohort:  fema_{method}_hurricane_{outcome}.json
   - No-FEMA:      fema_{method}_nofema_hurricane_{outcome}.json
*/
const femaPaths = {
  es:  (slug) => `data_fema/processed/event_studies/${slug}.json?v=gh`,
  did: (slug) => `data_fema/processed/did/${slug}.json?v=gh`,
};

// Keep separate chart refs for FEMA
state.femaCharts = { evict: null, filing: null };

function femaSlug(method, cohort, outcome) {
  if (cohort === "nofema") return `fema_${method}_nofema_hurricane_${outcome}`;
  return `fema_${method}_hurricane_${outcome}`;
}

function showDidInto(prefixBase, did) {
  const q = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const m = did?.meta || {};
  q(`${prefixBase}-term`, did?.term ?? "—");
  q(`${prefixBase}-est`,  fmt.num(did?.estimate));
  q(`${prefixBase}-se`,   fmt.num(did?.se));
  q(`${prefixBase}-t`,    fmt.num(did?.t));
  q(`${prefixBase}-p`,    fmt.p(did?.p));
  q(`${prefixBase}-ci`,   fmt.ci(did?.ci_low, did?.ci_high));
  q(`${prefixBase}-dep`,  m.dep_var ?? "—");
  q(`${prefixBase}-fe`,   m.fixed_effects ?? "—");
  q(`${prefixBase}-obs`,  m.observations ?? "—");
  q(`${prefixBase}-rmse`, m.rmse ?? "—");
  q(`${prefixBase}-r2`,   m.r2 ?? "—");
}

async function loadFemaOne(method, cohort, outcome, opt) {
  const { canvasId, captionId, missingId, chartKey, didPrefixBase } = opt;

  const existing = state.femaCharts[chartKey];
  if (existing && existing.canvas && existing.canvas.id === canvasId) {
    existing.destroy();
    state.femaCharts[chartKey] = null;
  }

  const slug = femaSlug(method, cohort, outcome);
  const missingEl = document.getElementById(missingId);
  const capEl     = document.getElementById(captionId);

  try {
    const es = await fetchJSON(femaPaths.es(slug));
    const data = prepareChartData(es);
    const chart = drawChart(canvasId, data);
    state.femaCharts[chartKey] = chart;
    if (missingEl) missingEl.style.display = "none";
    if (capEl) capEl.textContent = "Ref line drawn midway between k = −2 and k = 0";

    try {
      const did = await fetchJSON(femaPaths.did(slug));
      showDidInto(didPrefixBase, did);
    } catch {
      showDidInto(didPrefixBase, {});
    }
  } catch (e) {
    console.error(e);
    if (missingEl) missingEl.style.display = "block";
    if (capEl) capEl.textContent = "Ref line drawn midway between k = −2 and k = 0";
    showDidInto(didPrefixBase, {});
  }
}

async function loadFemaPair() {
  const methodSel = document.getElementById("fema-method-select");
  const cohortSel = document.getElementById("fema-cohort-select");
  if (!methodSel || !cohortSel) return;

  const method = methodSel.value;        // "history" | "psm"
  const cohort = cohortSel.value;        // "fema" | "nofema"

  await Promise.all([
    loadFemaOne(method, cohort, "evict", {
      canvasId: "esFemaEvict",
      captionId: "fema-caption-evict",
      missingId: "fema-missing-evict",
      chartKey: "evict",
      didPrefixBase: "fema-e"
    }),
    loadFemaOne(method, cohort, "filing", {
      canvasId: "esFemaFiling",
      captionId: "fema-caption-filing",
      missingId: "fema-missing-filing",
      chartKey: "filing",
      didPrefixBase: "fema-f"
    })
  ]);
}

function bootFema() {
  const methodSel = document.getElementById("fema-method-select");
  const cohortSel = document.getElementById("fema-cohort-select");
  const refreshBtn = document.getElementById("fema-btn-refresh");
  const saveE = document.getElementById("fema-save-evict");
  const saveF = document.getElementById("fema-save-filing");

  if (!methodSel || !cohortSel) return;

  loadFemaPair();

  methodSel.addEventListener("change", loadFemaPair);
  cohortSel.addEventListener("change", loadFemaPair);
  if (refreshBtn) refreshBtn.addEventListener("click", loadFemaPair);

  if (saveE) saveE.addEventListener("click", () => {
    const ch = state.femaCharts.evict; if (!ch) return;
    const a = document.createElement("a"); a.href = ch.toBase64Image(); a.download = "event-study_FEMA_evictions.png"; a.click();
  });
  if (saveF) saveF.addEventListener("click", () => {
    const ch = state.femaCharts.filing; if (!ch) return;
    const a = document.createElement("a"); a.href = ch.toBase64Image(); a.download = "event-study_FEMA_filings.png"; a.click();
  });
}

bootFema();
/* ======================= END FEMA SECTION ======================= */
