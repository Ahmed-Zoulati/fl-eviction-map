/* Evictions & Payday event-study viewer (core + FEMA). */

const q = new URLSearchParams(location.search);
const SET    = (q.get("set") || "core").toLowerCase();      // "core" | "fema" (legacy)
const METHOD = (q.get("method") || "").toLowerCase();       // "history" | "psm" (legacy+FEMA)
const STORM  = (q.get("storm")  || "").toLowerCase();       // "hurricane" | "tropical" | "both" (optional)

// === Dataset switch (top viewer) ===
let DATASET = "evictions"; // updated by <select id="dataset-select">

function outcomeKeysFor(dataset) {
  return (dataset === "payday")
    ? ["transaction_volume", "default"]
    : ["evict", "filing"];
}
function labelsFor(dataset) {
  return (dataset === "payday")
    ? { left: "Transaction Volume", right: "Default", unit: "weeks" }
    : { left: "Evictions",          right: "Filings", unit: "months" };
}

// === Paths for the TOP viewer ===
function getCorePaths() {
  // Legacy: allow top viewer to point at FEMA via URL (?set=fema)
  if (SET === "fema") {
    if (DATASET === "payday") {
      return {
        manifest: "../data_payday_fema/processed/index.json",
        es:  (slug) => `../data_payday_fema/processed/event_studies/${slug}.json`,
        did: (slug) => `../data_payday_fema/processed/did/${slug}.json`,
      };
    }
    return {
      manifest: "../data_fema/processed/index.json",
      es:  (slug) => `../data_fema/processed/event_studies/${slug}.json`,
      did: (slug) => `../data_fema/processed/did/${slug}.json`,
    };
  }
  // Default: core (non-FEMA)
  if (DATASET === "payday") {
    return {
      manifest: "../data_payday/processed/index.json",
      es:  (slug) => `../data_payday/processed/event_studies/${slug}.json`,
      did: (slug) => `../data_payday/processed/did/${slug}.json`,
    };
  }
  return {
    manifest: "../data/processed/index.json",
    es:  (slug) => `../data/processed/event_studies/${slug}.json`,
    did: (slug) => `../data/processed/did/${slug}.json`,
  };
}

const state = {
  manifest: null,
  charts: { evict: null, filing: null },   // left/right
  map: {}                                   // {storm_type: {outcome: slug}}
};

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
  const paths = getCorePaths();
  const j = await fetchJSON(paths.manifest);
  state.manifest = j;
  state.map = buildMapFromManifest(j, (SET === "fema" ? METHOD : null));

  const sel = document.getElementById("storm-select");
  sel.innerHTML = "";

  const labelFor = { hurricane: "Hurricane", tropical: "Tropical Storm", both: "Hurricane + Tropical" };

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
  const unit = es.time_unit || labelsFor(DATASET).unit;
  return { labels, est, ciL, ciH, ref: es.reference_period ?? -1, unit };
}

/* ---- plugin: zero line + ref line ---- */
const referenceLinesPlugin = {
  id: 'referenceLines',
  afterDatasetsDraw(chart) {
    const area = chart.chartArea;
    if (!area) return;
    const x = chart.scales.x, y = chart.scales.y, ctx = chart.ctx, labels = chart.data.labels;
    const xForIdx = (i)=> x.getPixelForTick(i);
    let left = -1, right = -1;
    for (let i=0;i<labels.length;i++) if (+labels[i] < 0) left = i;
    for (let i=0;i<labels.length;i++) if (+labels[i] >= 0) { right = i; break; }
    let xRef = null;
    if (left !== -1 && right !== -1) xRef = (xForIdx(left) + xForIdx(right)) / 2;

    ctx.save();
    ctx.beginPath(); ctx.rect(area.left, area.top, area.right-area.left, area.bottom-area.top); ctx.clip();
    ctx.lineWidth = 1; ctx.setLineDash([6,4]); ctx.strokeStyle = 'rgba(0,0,0,0.55)';

    const yZero = y.getPixelForValue(0);
    ctx.beginPath(); ctx.moveTo(area.left, yZero); ctx.lineTo(area.right, yZero); ctx.stroke();

    if (xRef !== null && isFinite(xRef)) {
      ctx.beginPath(); ctx.moveTo(xRef, area.top); ctx.lineTo(xRef, area.bottom); ctx.stroke();
    }
    ctx.restore();
  }
};
Chart.register(referenceLinesPlugin);

function drawChart(canvasId, data, titleText) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  for (const key of Object.keys(state.charts)) {
    if (state.charts[key] && state.charts[key].canvas && state.charts[key].canvas.id === canvasId) {
      state.charts[key].destroy(); state.charts[key] = null;
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
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: `Event time (${data.unit || "months"})` }, grid: { display: false } },
        y: { title: { display: true, text: "Coefficient" } }
      },
      plugins: {
        legend: { display: true },
        title: { display: true, text: titleText || "" },
        tooltip: { callbacks: { title: (items)=> `k = ${items[0].label}` } },
        referenceLines: {}
      }
    }
  });
  return chart;
}

function showDid(did, prefix) {
  const q = (id, v)=> { const el = document.getElementById(id); if (el) el.textContent = v; };
  q(`did-${prefix}-term`, did?.term ?? "—");
  q(`did-${prefix}-est`, fmt.num(did?.estimate));
  q(`did-${prefix}-se`, fmt.num(did?.se));
  q(`did-${prefix}-t`, fmt.num(did?.t));
  q(`did-${prefix}-p`, fmt.p(did?.p));
  q(`did-${prefix}-ci`, fmt.ci(did?.ci_low, did?.ci_high));
  const m = did?.meta || {};
  q(`did-${prefix}-dep`, m.dep_var ?? "—");
  q(`did-${prefix}-fe`, m.fixed_effects ?? "—");
  q(`did-${prefix}-obs`, m.observations ?? "—");
  q(`did-${prefix}-rmse`, m.rmse ?? "—");
  q(`did-${prefix}-r2`, m.r2 ?? "—");
}

/* ---------- Heading utilities ---------- */
function getCohortPrefix() {
  const cohortSel = document.getElementById("fema-cohort-select");
  const val = (cohortSel && cohortSel.value) ? cohortSel.value : "fema";
  return val === "nofema" ? "No-FEMA" : "FEMA";
}

// Set the visible heading near a canvas.
// If prefix is provided, it becomes "PREFIX — Label"; otherwise just "Label".
function setHeadingForCanvas(canvasId, baseLabel, prefix = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const explicit = document.querySelector(`[data-title-for="${canvasId}"]`);
  const container = explicit
    ? explicit.closest(".card, .panel, section, .box, .chart-card") || canvas.parentElement
    : canvas.closest(".card, .panel, section, .box, .chart-card") || canvas.parentElement;

  let heading = explicit || (container && container.querySelector("h1,h2,h3,h4,.card-title,.section-title,.panel-title,strong"));
  if (!heading && canvas.parentElement) {
    // try a few previous siblings
    let p = canvas.parentElement;
    for (let i = 0; i < 4 && p && !heading; i++) {
      const prev = p.previousElementSibling;
      if (!prev) break;
      heading = prev.matches?.("h1,h2,h3,h4,.card-title,.section-title,.panel-title,strong")
        ? prev
        : prev.querySelector?.("h1,h2,h3,h4,.card-title,.section-title,.panel-title,strong");
      p = prev;
    }
  }
  if (!heading) return;

  heading.textContent = prefix ? `${prefix} — ${baseLabel}` : baseLabel;
}

function updateOuterHeadings(dataset) {
  const lbls = labelsFor(dataset);
  // Top pair (no prefix)
  setHeadingForCanvas("esChartEvict",  lbls.left,  null);
  setHeadingForCanvas("esChartFiling", lbls.right, null);
  // FEMA/No-FEMA pair (with prefix)
  const prefix = getCohortPrefix();
  setHeadingForCanvas("esFemaEvict",   lbls.left,  prefix);
  setHeadingForCanvas("esFemaFiling",  lbls.right, prefix);
}
/* --------------------------------------- */

async function loadOne(stormType, outcome, canvasId, capId, missingId, chartKey, didPrefix, titleText) {
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
    const paths = getCorePaths();
    const es = await fetchJSON(paths.es(slug));
    const data = prepareChartData(es);
    const chart = drawChart(canvasId, data, titleText);
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
  const [leftKey, rightKey] = outcomeKeysFor(DATASET);
  const lbls = labelsFor(DATASET);
  await Promise.all([
    loadOne(stormType, leftKey,  "esChartEvict",  "chart-caption-evict",  "missing-evict",  "evict",  "e", lbls.left),
    loadOne(stormType, rightKey, "esChartFiling", "chart-caption-filing", "missing-filing", "filing", "f", lbls.right)
  ]);
  updateDomTitles(DATASET);
  bumpChartTitlesToCurrentDataset();
}

function updateDomTitles(dataset) {
  const lbls = labelsFor(dataset);

  // Specific IDs (if your HTML has them)
  const leftIDs  = ["title-evict", "heading-evict", "card-title-evict"];
  const rightIDs = ["title-filing","heading-filing","card-title-filing"];
  for (const id of leftIDs)  { const el = document.getElementById(id);  if (el) el.textContent = lbls.left; }
  for (const id of rightIDs) { const el = document.getElementById(id);  if (el) el.textContent = lbls.right; }

  // Captions under each chart
  const capE = document.getElementById("chart-caption-evict");
  const capF = document.getElementById("chart-caption-filing");
  if (capE) capE.textContent = `${lbls.left} — Ref line drawn midway between k = −2 and k = 0`;
  if (capF) capF.textContent = `${lbls.right} — Ref line drawn midway between k = −2 and k = 0`;

  // FEMA / No-FEMA captions (dynamic prefix)
  const prefix = getCohortPrefix();
  const fcapE = document.getElementById("fema-caption-evict");
  const fcapF = document.getElementById("fema-caption-filing");
  if (fcapE) fcapE.textContent = `${prefix} — ${lbls.left} — Ref line drawn midway between k = −2 and k = 0`;
  if (fcapF) fcapF.textContent = `${prefix} — ${lbls.right} — Ref line drawn midway between k = −2 and k = 0`;

  // Headings above canvases
  updateOuterHeadings(dataset);
}

function bumpChartTitlesToCurrentDataset() {
  const lbls = labelsFor(DATASET);
  if (state.charts.evict) {
    state.charts.evict.options.plugins.title.text = lbls.left;
    state.charts.evict.update("none");
  }
  if (state.charts.filing) {
    state.charts.filing.options.plugins.title.text = lbls.right;
    state.charts.filing.update("none");
  }
  const prefix = getCohortPrefix();
  if (state.femaCharts?.evict) {
    state.femaCharts.evict.options.plugins.title.text = `${prefix} — ${lbls.left}`;
    state.femaCharts.evict.update("none");
  }
  if (state.femaCharts?.filing) {
    state.femaCharts.filing.options.plugins.title.text = `${prefix} — ${lbls.right}`;
    state.femaCharts.filing.update("none");
  }
}

async function boot() {
  const defaultST = await loadManifest();
  const sel = document.getElementById("storm-select");

  if (sel.value) await loadPair(sel.value);
  else if (defaultST) await loadPair(defaultST);

  // Keep headings in sync right after the first render
  updateDomTitles(DATASET);
  bumpChartTitlesToCurrentDataset();

  sel.addEventListener("change", async (e) => { await loadPair(e.target.value); });

  document.getElementById("btn-refresh").addEventListener("click", async () => {
    const st = sel.value;
    await loadManifest();
    sel.value = st in (state.map || {}) ? st : (Object.keys(state.map)[0] || "");
    if (sel.value) await loadPair(sel.value);
  });

  const dsSel = document.getElementById("dataset-select");
  if (dsSel) {
    dsSel.value = DATASET;
    dsSel.addEventListener("change", async () => {
      DATASET = dsSel.value;               // "evictions" | "payday"
      const st = sel.value;
      await loadManifest();                // reload manifest for chosen dataset
      sel.value = st in (state.map || {}) ? st : (Object.keys(state.map)[0] || "");
      if (sel.value) await loadPair(sel.value);
      await loadFemaPair();                // keep FEMA/No-FEMA pair in sync

      // Refresh visible titles/captions + headings
      updateDomTitles(DATASET);
      bumpChartTitlesToCurrentDataset();
    });
  }

  document.getElementById("save-evict").addEventListener("click", () => {
    const ch = state.charts.evict; if (!ch) return;
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = (DATASET === "payday" ? "event-study_txvolume.png" : "event-study_evictions.png");
    a.click();
  });
  document.getElementById("save-filing").addEventListener("click", () => {
    const ch = state.charts.filing; if (!ch) return;
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = (DATASET === "payday" ? "event-study_default.png" : "event-study_filings.png");
    a.click();
  });
}

boot().catch(err => { alert("Error: " + err.message); console.error(err); });

/* ========================= FEMA SECTION ========================= */

function getFemaPaths() {
  if (DATASET === "payday") {
    return {
      es:  (slug) => `../data_payday_fema/processed/event_studies/${slug}.json`,
      did: (slug) => `../data_payday_fema/processed/did/${slug}.json`,
    };
  }
  return {
    es:  (slug) => `../data_fema/processed/event_studies/${slug}.json`,
    did: (slug) => `../data_fema/processed/did/${slug}.json`,
  };
}

state.femaCharts = { evict: null, filing: null };

function femaSlug(method, cohort, outcome) {
  return (cohort === "nofema")
    ? `fema_${method}_nofema_hurricane_${outcome}`
    : `fema_${method}_hurricane_${outcome}`;
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

async function loadFemaOne(method, cohort, outcome, opt, titleText, prefix) {
  const { canvasId, captionId, missingId, chartKey, didPrefixBase } = opt;

  const existing = state.femaCharts[chartKey];
  if (existing && existing.canvas && existing.canvas.id === canvasId) {
    existing.destroy(); state.femaCharts[chartKey] = null;
  }

  const slug = femaSlug(method, cohort, outcome);
  const missingEl = document.getElementById(missingId);
  const capEl     = document.getElementById(captionId);

  try {
    const fpaths = getFemaPaths();
    const es = await fetchJSON(fpaths.es(slug));
    const data = prepareChartData(es);
    const chart = drawChart(canvasId, data, `${prefix} — ${titleText}`);
    state.femaCharts[chartKey] = chart;
    if (missingEl) missingEl.style.display = "none";
    if (capEl) capEl.textContent = "Ref line drawn midway between k = −2 and k = 0";

    try {
      const did = await fetchJSON(fpaths.did(slug));
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

  const method = methodSel.value;         // "history" | "psm"
  const cohort = cohortSel.value;         // "fema" | "nofema"
  const [leftKey, rightKey] = outcomeKeysFor(DATASET);
  const lbls = labelsFor(DATASET);
  const prefix = cohort === "nofema" ? "No-FEMA" : "FEMA";

  await Promise.all([
    loadFemaOne(method, cohort, leftKey, {
      canvasId: "esFemaEvict",
      captionId: "fema-caption-evict",
      missingId: "fema-missing-evict",
      chartKey: "evict",
      didPrefixBase: "fema-e"
    }, lbls.left, prefix),
    loadFemaOne(method, cohort, rightKey, {
      canvasId: "esFemaFiling",
      captionId: "fema-caption-filing",
      missingId: "fema-missing-filing",
      chartKey: "filing",
      didPrefixBase: "fema-f"
    }, lbls.right, prefix)
  ]);

  // Update captions/headings + re-title charts if needed
  updateDomTitles(DATASET);
  bumpChartTitlesToCurrentDataset();
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
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = (DATASET === "payday" ? "event-study_FEMA_txvolume.png" : "event-study_FEMA_evictions.png");
    a.click();
  });
  if (saveF) saveF.addEventListener("click", () => {
    const ch = state.femaCharts.filing; if (!ch) return;
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = (DATASET === "payday" ? "event-study_FEMA_default.png" : "event-study_FEMA_filings.png");
    a.click();
  });
}

bootFema();
/* ======================= END FEMA SECTION ======================= */
