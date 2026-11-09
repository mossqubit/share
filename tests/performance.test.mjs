import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePerformanceQuery, summarizeReport, summarizeAppLovin, relativeChange } from '../payload/lib/account-performance.ts';
const query = { date: '2026-11-08', start: 0, end: 10, compare: 'previous' };
const now = new Date('2026-11-10T02:00:00Z');
function report() { return { meta: { startDate: '2026-11-01', endDate: '2026-11-09', updatedAt: now.toISOString() }, campaigns: [{ rows: [{ date: '2026-11-07', spend: 40, units: 2, sales: 80, hours: [{ hour: 14, spend: 40, units: 2, sales: 80 }] }, { date: '2026-11-08', spend: 150, units: 5, sales: 450, hours: [{ hour: 0, spend: 100, units: 4, sales: 300 }, { hour: 10, spend: 50, units: 1, sales: 150 }] }] }] }; }
test('previous period crosses midnight; end exclusive; ROI uses aggregated revenue/spend', () => {
  const result = summarizeReport(report(), query, now);
  assert.equal(result.status, 'ready'); assert.equal(result.current.spend, 100); assert.equal(result.current.units, 4); assert.equal(result.current.roi, 3);
  assert.equal(result.previous.spend, 40); assert.equal(result.delta.spend, 150); assert.equal(result.delta.roi, 50);
  assert.equal(result.comparison.start, '2026-11-07 14:00'); assert.equal(result.comparison.end, '2026-11-08 00:00');
});
test('yesterday same period differs from immediately previous period', () => {
  const result = summarizeReport(report(), { ...query, compare: 'yesterday' }, now);
  assert.equal(result.previous.spend, 0); assert.equal(result.delta.spend, null); assert.equal(result.comparison.start, '2026-11-07 00:00');
});
test('today clips both periods to completed hours in business timezone, independent of OS', () => {
  const date = new Date('2026-11-09T18:30:00Z'); // 10:30 Los Angeles
  const saved = report(); saved.meta.updatedAt = date.toISOString();
  const result = summarizeReport(saved, { ...query, date: 'today', end: 24 }, date);
  assert.equal(result.period.end, '2026-11-09 10:00'); assert.equal(result.comparison.start, '2026-11-08 14:00');
  assert.equal(summarizeReport(saved, { ...query, date: 'today' }, new Date('2026-11-09T08:30:00Z')).status, 'unavailable');
});
test('old caches, missing hour detail, missing history and future periods never fabricate comparisons', () => {
  const old = report(); old.meta.updatedAt = '2026-11-08T09:00:00Z'; assert.equal(summarizeReport(old, query, now).status, 'unavailable');
  const noHours = report(); delete noHours.campaigns[0].rows[1].hours; assert.equal(summarizeReport(noHours, query, now).status, 'unavailable');
  const noHistory = report(); noHistory.meta.startDate = '2026-11-08'; const result = summarizeReport(noHistory, query, now); assert.equal(result.current.spend, 100); assert.equal(result.previous, undefined);
  assert.equal(summarizeReport(report(), { ...query, date: '2027-01-01' }, now).status, 'unavailable');
});
test('zero spend is not a fabricated zero ROI; zero baselines do not produce Infinity', () => {
  assert.equal(relativeChange(5, 0), null); assert.equal(relativeChange(0, 0), 0); assert.equal(relativeChange(null, 1), null);
  const result = summarizeReport(report(), { ...query, start: 1, end: 2 }, now); assert.equal(result.current.roi, null);
});
test('AppLovin UTC full days and D0 metrics remain distinct from Google order attribution', () => {
  const daily = { meta: report().meta, rows: [{ date: '2026-11-08', cost: 20, purchasesD0: 3, revenueD0: 50 }, { date: '2026-11-07', cost: 10, purchasesD0: 1, revenueD0: 20 }] };
  assert.equal(summarizeAppLovin(daily, query, now).status, 'unavailable');
  const full = summarizeAppLovin(daily, { ...query, end: 24 }, now); assert.equal(full.current.roi, 2.5); assert.equal(full.delta.spend, 100); assert.equal(full.timeZone, 'UTC');
  const todayNow = new Date('2026-11-09T23:00:00Z');
  const today = summarizeAppLovin({ ...daily, meta: { ...daily.meta, updatedAt: todayNow.toISOString() } }, { ...query, date: 'today', end: 24 }, todayNow); assert.equal(today.previous, undefined); assert.match(today.comparisonMessage, /尚未结束/);
  daily.rows[0].purchasesD0 = null; assert.equal(summarizeAppLovin(daily, { ...query, end: 24 }, now).status, 'unavailable');
});
test('reject malformed dates, invalid hours and unknown comparisons', () => {
  for (const params of ['date=2026-02-30', 'start=10&end=10', 'start=-1', 'end=25', 'start=1.5', 'compare=nope']) assert.throws(() => parsePerformanceQuery(new URLSearchParams(params)));
  assert.equal(parsePerformanceQuery(new URLSearchParams()).date, 'today');
});
test('missing AppLovin baseline metrics preserve valid current metrics without fabricated changes', () => {
  const daily = { meta: report().meta, rows: [{ date: '2026-11-08', cost: 20, purchasesD0: 3, revenueD0: 50 }, { date: '2026-11-07', cost: 10, purchasesD0: null, revenueD0: null }] };
  const result = summarizeAppLovin(daily, { ...query, end: 24 }, now);
  assert.equal(result.current.spend, 20); assert.equal(result.previous, undefined); assert.equal(result.delta, undefined); assert.match(result.comparisonMessage, /缺少/);
  const malformed = report(); malformed.campaigns[0].rows[1].hours[0].spend = NaN;
  assert.throws(() => summarizeReport(malformed, query, now), /指标无效/);
});
