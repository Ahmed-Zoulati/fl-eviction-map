/* Two charts side-by-side (Evictions + Filings) for a chosen storm type.
   - Populates storm-type dropdown from manifest
   - Loads the ES & DiD for both outcomes
   - Draws vertical dashed ref line at midpoint between k=-2 and k=0 (≈ -1) and horizontal dashed zero line
*/

const paths = {
  manifest: "data/processed/index.json",
  es: (slug) => `data/processed/event_studies/${slug}.json`,
  did: (slug) => `data/processed/did/${slug}.json`,
};
console.log("Event-study paths:", paths);


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

function buildMapFromManifest(manifest) {
  const map = {};
  for (const s of (manifest.studies || [])) {
    if (!map[s.storm_type]) map[s.storm_type] = {};
    map[s.storm_type][s.outcome] = s.slug;
  }
  return map;
}

async function loadManifest() {
  const j = await fetchJSON(paths.manifest);
  state.manifest = j;
  state.map = buildMapFromManifest(j);

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

  const defaultST = stormTypes.includes("hurricane") ? "hurricane" : stormTypes[0];
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

    // helper: pixel for a label value (category)
    const xForK = (kVal) => {
      const idx = labels.indexOf(kVal);
      if (idx === -1) return null;
      return x.getPixelForTick(idx);
    };

    // compute midpoint X between the last negative tick (<0) and the first non-negative tick (>=0)
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
      xRef = (xLeft + xRight) / 2; // halfway between k<0 and k>=0 -> visually ≈ -1
    } else {
      // fallback: try exact -2 and 0 if present
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

    // horizontal dashed zero line (draw even if outside y-range; it will clip)
    const yZero = y.getPixelForValue(0);
    ctx.beginPath();
    ctx.moveTo(area.left, yZero);
    ctx.lineTo(area.right, yZero);
    ctx.stroke();

    // vertical dashed ref line at midpoint
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
        {
          label: "Estimate",
          data: data.est,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2
        },
        {
          label: "CI low",
          data: data.ciL,
          borderWidth: 1,
          borderDash: [4,3],
          pointRadius: 0
        },
        {
          label: "CI high",
          data: data.ciH,
          borderWidth: 1,
          borderDash: [4,3],
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { display: true, text: "Event time (months)" },
          grid: { display: false }
        },
        y: {
          title: { display: true, text: "Coefficient" }
        }
      },
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            title: (items)=> `k = ${items[0].label}`
          }
        },
        referenceLines: {} // plugin has no required options now
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
    missingEl.style.display = "block";
    cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
    showDid({}, didPrefix);
    return;
  }

  try {
    const es = await fetchJSON(paths.es(slug));
    const data = prepareChartData(es);
    const chart = drawChart(canvasId, data);
    state.charts[chartKey] = chart;
    missingEl.style.display = "none";
    cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
    // DiD
    try {
      const did = await fetchJSON(paths.did(slug));
      showDid(did, didPrefix);
    } catch {
      showDid({}, didPrefix);
    }
  } catch (e) {
    console.error(e);
    if (state.charts[chartKey]) { state.charts[chartKey].destroy(); state.charts[chartKey] = null; }
    missingEl.style.display = "block";
    cap.textContent = "Ref line drawn midway between k = −2 and k = 0";
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

  // save buttons
  document.getElementById("save-evict").addEventListener("click", () => {
    const ch = state.charts.evict;
    if (!ch) return;
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = "event-study_evictions.png";
    a.click();
  });
  document.getElementById("save-filing").addEventListener("click", () => {
    const ch = state.charts.filing;
    if (!ch) return;
    const a = document.createElement("a");
    a.href = ch.toBase64Image();
    a.download = "event-study_filings.png";
    a.click();
  });
}

boot().catch(err => {
  alert("Error: " + err.message);
  console.error(err);
});
