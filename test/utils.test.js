import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmt, fmtPace, toSec, findClosest,
  buildHistogram, pct,
  mergeIndicatorData, mergeTargetData,
} from "../js/utils.js";

// ── fmt ───────────────────────────────────────────────────────────────────
test("fmt: formats hours correctly", () => {
  assert.equal(fmt(12600), "3:30:00");
  assert.equal(fmt(3661),  "1:01:01");
  assert.equal(fmt(7200),  "2:00:00");
});

test("fmt: formats sub-hour correctly", () => {
  assert.equal(fmt(3750), "1:02:30");
  assert.equal(fmt(90),   "1:30");
  assert.equal(fmt(0),    "0:00");
});

test("fmt: returns dash for null/undefined", () => {
  assert.equal(fmt(null),      "—");
  assert.equal(fmt(undefined), "—");
});

// ── toSec ─────────────────────────────────────────────────────────────────
test("toSec: parses HH:MM:SS", () => {
  assert.equal(toSec("3:30:00"), 12600);
  assert.equal(toSec("1:01:01"), 3661);
  assert.equal(toSec("0:00:00"), 0);
});

test("toSec: parses MM:SS", () => {
  assert.equal(toSec("1:30"), 90);
  assert.equal(toSec("62:30"), 3750);
});

test("toSec: returns 0 for empty", () => {
  assert.equal(toSec(""), 0);
  assert.equal(toSec(null), 0);
});

test("fmt and toSec are inverses for whole seconds", () => {
  for (const sec of [9000, 12600, 14400, 18000]) {
    assert.equal(toSec(fmt(sec)), sec);
  }
});

// ── fmtPace ───────────────────────────────────────────────────────────────
test("fmtPace: formats pace", () => {
  // 12600s / 26.2mi = ~481s/mi = 8:01/mi
  const pace = fmtPace(12600, 26.2);
  assert.match(pace, /^\d+:\d{2}\/mi$/);
});

test("fmtPace: returns dash for missing inputs", () => {
  assert.equal(fmtPace(null, 26.2), "—");
  assert.equal(fmtPace(12600, 0),   "—");
});

// ── findClosest ───────────────────────────────────────────────────────────
test("findClosest: returns exact match", () => {
  const centers = ["3:20:00", "3:30:00", "3:40:00"];
  assert.equal(findClosest(centers, 12600), "3:30:00");
});

test("findClosest: rounds to nearest", () => {
  const centers = ["3:20:00", "3:30:00", "3:40:00"];
  // 3:20:00=12000, 3:30:00=12600, 3:40:00=13200
  assert.equal(findClosest(centers, 12200), "3:20:00"); // 200 from 12000, 400 from 12600
  assert.equal(findClosest(centers, 13000), "3:40:00"); // 200 from 13200, 400 from 12600
});

// ── pct ───────────────────────────────────────────────────────────────────
test("pct: returns null for empty array", () => {
  assert.equal(pct([], 0.5), null);
});

test("pct: returns correct percentile", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(pct(arr, 0),    1);
  assert.equal(pct(arr, 0.5),  6);
  assert.equal(pct(arr, 0.25), 3);
});

// ── buildHistogram ────────────────────────────────────────────────────────
test("buildHistogram: empty input", () => {
  assert.deepEqual(buildHistogram([]), []);
});

test("buildHistogram: single bin", () => {
  const bins = buildHistogram([12600, 12700, 12800]);
  assert.equal(bins.length, 1);
  assert.equal(bins[0][2], 3);
});

test("buildHistogram: multiple bins, all values counted", () => {
  const bins = buildHistogram([12000, 12100, 12500, 12900]);
  assert.ok(bins.length >= 2);
  const total = bins.reduce((s, b) => s + b[2], 0);
  assert.equal(total, 4);
});

test("buildHistogram: value on bin boundary is counted", () => {
  // 12600 is exactly on a 300s boundary — must not be dropped
  const bins = buildHistogram([12600], 300);
  assert.equal(bins.length, 1);
  assert.equal(bins[0][2], 1);
  assert.equal(bins[0][0] % 300, 0);
  assert.equal(bins[0][1] % 300, 0);
});

// ── mergeIndicatorData ────────────────────────────────────────────────────
test("mergeIndicatorData: empty both", () => {
  assert.deepEqual(mergeIndicatorData({}, {}), {});
});

test("mergeIndicatorData: M only passes through", () => {
  const bucket = { n_indicator: 10, n_nycm: 8, pairs: [[4000, 12600]], p25_sec: 12000, p50_sec: 12600, p75_sec: 13200, p25: "3:20:00", p50: "3:30:00", p75: "3:40:00", histogram: [], small_sample: false };
  const result = mergeIndicatorData({ "4:10:00": bucket }, {});
  assert.deepEqual(result["4:10:00"], bucket);
});

test("mergeIndicatorData: pools n_indicator and n_nycm", () => {
  const b = (n_indicator, n_nycm, pairs) => ({ n_indicator, n_nycm, pairs, histogram: [], small_sample: false });
  const dM = { "4:10:00": b(100, 80, [[4000, 12600], [4000, 13200]]) };
  const dF = { "4:10:00": b(60,  50, [[4000, 11400], [4000, 12000]]) };
  const merged = mergeIndicatorData(dM, dF)["4:10:00"];
  assert.equal(merged.n_indicator, 160);
  assert.equal(merged.n_nycm, 130);
  assert.equal(merged.pairs.length, 4);
  assert.equal(merged.pct_nycm, Math.round(130/160*100));
});

test("mergeIndicatorData: recomputes percentiles from pooled pairs", () => {
  const b = (pairs) => ({ n_indicator: pairs.length, n_nycm: pairs.length, pairs, histogram: [] });
  const dM = { "4:10:00": b([[4000, 12000]]) };
  const dF = { "4:10:00": b([[4000, 14400]]) };
  const merged = mergeIndicatorData(dM, dF)["4:10:00"];
  // sorted nycm times: [12000, 14400]; p25 = index 0 = 12000, p50 = index 1 = 14400
  assert.equal(merged.p25_sec, 12000);
  assert.equal(merged.p50_sec, 14400);
});

// ── mergeTargetData ───────────────────────────────────────────────────────
test("mergeTargetData: empty both", () => {
  assert.deepEqual(mergeTargetData({}, {}), {});
});

test("mergeTargetData: F only passes through", () => {
  const bucket = { n_cohort: 50, races: {} };
  const result = mergeTargetData({}, { "3:30:00": bucket });
  assert.deepEqual(result["3:30:00"], bucket);
});

test("mergeTargetData: pools n_cohort", () => {
  const race = (n_matched, pairs) => ({
    n_matched, pairs,
    p25_sec: 4000, p50_sec: 4500, p75_sec: 5000,
    p25: "1:06:40", p50: "1:15:00", p75: "1:23:20",
    histogram: [], small_sample: false,
  });
  const dM = { "3:30:00": { n_cohort: 100, races: { bronx_10m: race(60, [[4000, 12600]]) } } };
  const dF = { "3:30:00": { n_cohort: 80,  races: { bronx_10m: race(40, [[4200, 12900]]) } } };
  const merged = mergeTargetData(dM, dF)["3:30:00"];
  assert.equal(merged.n_cohort, 180);
  assert.equal(merged.races.bronx_10m.n_matched, 100);
  assert.equal(merged.races.bronx_10m.pairs.length, 2);
  assert.equal(merged.races.bronx_10m.pct_ran, Math.round(100/180*100));
});
