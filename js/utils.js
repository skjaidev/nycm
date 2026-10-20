function fmt(sec) {
  if (!sec && sec !== 0) return "—";
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), r = sec % 3600;
  const m = Math.floor(r / 60), s = r % 60;
  if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function fmtPace(sec, dist) {
  if (!sec || !dist) return "—";
  return fmt(sec / dist) + "/mi";
}

function toSec(t) {
  if (!t) return 0;
  const p = t.split(":").map(Number);
  return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
}

function findClosest(centers, sec) {
  return centers.reduce((best, c) =>
    Math.abs(toSec(c) - sec) < Math.abs(toSec(best) - sec) ? c : best
  );
}

function buildHistogram(sortedTimes, binWidth = 300) {
  if (!sortedTimes.length) return [];
  const lo0 = Math.floor(sortedTimes[0] / binWidth) * binWidth;
  const hi0 = (Math.floor(sortedTimes[sortedTimes.length - 1] / binWidth) + 1) * binWidth;
  const bins = [];
  for (let lo = lo0; lo < hi0; lo += binWidth) {
    const count = sortedTimes.filter(t => t >= lo && t < lo + binWidth).length;
    if (count) bins.push([lo, lo + binWidth, count]);
  }
  return bins;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.floor(sorted.length * p)];
}

function mergeIndicatorData(dataM, dataF) {
  const merged = {};
  const keys = new Set([...Object.keys(dataM), ...Object.keys(dataF)]);
  for (const key of keys) {
    const bM = dataM[key], bF = dataF[key];
    if (!bM && !bF) continue;
    if (!bM) { merged[key] = bF; continue; }
    if (!bF) { merged[key] = bM; continue; }
    const pairs    = [...(bM.pairs || []), ...(bF.pairs || [])];
    const nycmSec  = pairs.map(p => p[1]).sort((a, b) => a - b);
    const nInd     = (bM.n_indicator || 0) + (bF.n_indicator || 0);
    const nNycm    = (bM.n_nycm || 0) + (bF.n_nycm || 0);
    const p25s = pct(nycmSec, 0.25), p50s = pct(nycmSec, 0.50), p75s = pct(nycmSec, 0.75);
    merged[key] = {
      ...bM, pairs,
      n_indicator: nInd, n_nycm: nNycm,
      pct_nycm: nInd ? Math.round(nNycm / nInd * 100) : 0,
      p25_sec: p25s, p50_sec: p50s, p75_sec: p75s,
      p25: fmt(p25s), p50: fmt(p50s), p75: fmt(p75s),
      histogram: buildHistogram(nycmSec),
      small_sample: nNycm < 15,
      vdot_ever_p50: null, vdot_year_p50: null,
    };
  }
  return merged;
}

function mergeTargetData(dataM, dataF) {
  const merged = {};
  const keys = new Set([...Object.keys(dataM), ...Object.keys(dataF)]);
  for (const key of keys) {
    const bM = dataM[key], bF = dataF[key];
    if (!bM && !bF) continue;
    if (!bM) { merged[key] = bF; continue; }
    if (!bF) { merged[key] = bM; continue; }
    const races = {};
    const allRaces = new Set([...Object.keys(bM.races || {}), ...Object.keys(bF.races || {})]);
    for (const race of allRaces) {
      const rM = (bM.races || {})[race], rF = (bF.races || {})[race];
      if (!rM && !rF) continue;
      if (!rM) { races[race] = rF; continue; }
      if (!rF) { races[race] = rM; continue; }
      const pairs   = [...(rM.pairs || []), ...(rF.pairs || [])];
      const indSec  = pairs.map(p => p[0]).sort((a, b) => a - b);
      const nMatched = (rM.n_matched || 0) + (rF.n_matched || 0);
      const nCohort  = (bM.n_cohort  || 0) + (bF.n_cohort  || 0);
      const p25s = pct(indSec, 0.25), p50s = pct(indSec, 0.50), p75s = pct(indSec, 0.75);
      races[race] = {
        ...rM, pairs,
        n_matched: nMatched,
        pct_ran: nCohort ? Math.round(nMatched / nCohort * 100) : 0,
        p25_sec: p25s, p50_sec: p50s, p75_sec: p75s,
        p25: fmt(p25s), p50: fmt(p50s), p75: fmt(p75s),
        histogram: buildHistogram(indSec),
        small_sample: nMatched < 15,
      };
    }
    merged[key] = {
      ...bM, races,
      n_cohort: (bM.n_cohort || 0) + (bF.n_cohort || 0),
      vdot_ever_p50: null, vdot_year_p50: null,
    };
  }
  return merged;
}

export { fmt, fmtPace, toSec, findClosest, buildHistogram, pct, mergeIndicatorData, mergeTargetData };
