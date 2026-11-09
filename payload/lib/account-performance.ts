export type PerformanceQuery = { date: string; start: number; end: number; compare: "previous" | "yesterday" };
export type Totals = { spend: number; units: number; sales: number; roi: number | null };
export type Period = { start: string; end: string; label: string };
export type PerformanceResult = {
  status: "ready" | "unavailable" | "error";
  message?: string;
  timeZone: string;
  current?: Totals;
  previous?: Totals;
  delta?: { spend: number | null; units: number | null; roi: number | null };
  period?: Period;
  comparison?: Period;
  comparisonMessage?: string;
};
type Hour = { hour: number; spend: number; units: number; sales: number };
type Day = { date: string; spend: number; units: number; sales: number; hours?: Hour[] };
export type SavedReport = { meta: { startDate: string; endDate: string; updatedAt: string }; campaigns: { rows: Day[] }[] };
export type AppLovinReport = { meta: SavedReport["meta"]; rows: { date: string; cost: number; purchasesD0: number | null; revenueD0: number | null }[] };

export function parsePerformanceQuery(params: URLSearchParams): PerformanceQuery {
  const date = params.get("date") ?? "today";
  if (date !== "today" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00Z`)) || new Date(`${date}T00:00Z`).toISOString().slice(0, 10) !== date)) throw Error("日期无效");
  const start = Number(params.get("start") ?? 0), end = Number(params.get("end") ?? 24);
  const compare = params.get("compare") ?? "previous";
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) throw Error("时段须为 0–24 点之间的有效整点范围");
  if (compare !== "previous" && compare !== "yesterday") throw Error("对比方式无效");
  return { date, start, end, compare };
}

function clock(now: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
function tick(date: string, hour: number) { return Date.parse(`${date}T00:00:00Z`) / 3600000 + hour; }
function formatTick(value: number) { const date = new Date(value * 3600000).toISOString(); return `${date.slice(0, 10)} ${date.slice(11, 16)}`; }
function period(start: number, end: number): Period { return { start: formatTick(start), end: formatTick(end), label: `${formatTick(start)} → ${formatTick(end)}` }; }
export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return current === 0 && previous === 0 ? 0 : null;
  return (current - previous) / previous * 100;
}
function total(spend: number, units: number, sales: number): Totals { return { spend, units, sales, roi: spend > 0 ? sales / spend : null }; }
function validMetrics(value: { spend: number; units: number; sales: number }) {
  if (![value.spend, value.units, value.sales].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) throw Error("报表指标无效");
}
function aggregate(report: SavedReport, start: number, end: number): Totals | null {
  const first = formatTick(start).slice(0, 10), last = formatTick(end - 1).slice(0, 10);
  if (report.meta.startDate > first || report.meta.endDate < last) return null;
  let spend = 0, units = 0, sales = 0;
  for (const campaign of report.campaigns) for (const day of campaign.rows) {
    const midnight = tick(day.date, 0);
    if (midnight >= end || midnight + 24 <= start) continue;
    if (start <= midnight && end >= midnight + 24) {
      validMetrics(day);
      spend += day.spend; units += day.units; sales += day.sales;
    } else {
      if (!day.hours?.length && (day.spend || day.units || day.sales)) return null;
      for (const hour of day.hours ?? []) if (midnight + hour.hour >= start && midnight + hour.hour < end) {
        validMetrics(hour);
        spend += hour.spend; units += hour.units; sales += hour.sales;
      }
    }
  }
  return total(spend, units, sales);
}

export function summarizeReport(report: SavedReport, query: PerformanceQuery, now = new Date(), timeZone = "America/Los_Angeles"): PerformanceResult {
  const currentClock = clock(now, timeZone);
  const date = query.date === "today" ? currentClock.date : query.date;
  const start = tick(date, query.start);
  // Use completed wall-clock hours in the account's reporting timezone. Host OS timezone is irrelevant.
  const end = Math.min(tick(date, query.end), tick(currentClock.date, currentClock.hour));
  const base = { timeZone };
  if (end <= start) return { ...base, status: "unavailable", message: "所选时段尚无已结束的完整小时" };
  if (!Number.isFinite(Date.parse(report.meta.updatedAt))) return { ...base, status: "error", message: "报表缺少有效的数据时间" };
  const savedClock = clock(new Date(report.meta.updatedAt), timeZone);
  if (tick(savedClock.date, savedClock.hour) < end) return { ...base, status: "unavailable", message: "缓存尚未覆盖所选时段，请启动同步后重试" };
  const current = aggregate(report, start, end);
  if (!current) return { ...base, status: "unavailable", message: "当前时段缺少报表或小时明细，请同步数据" };
  const previousEnd = query.compare === "previous" ? start : end - 24;
  const previousStart = query.compare === "previous" ? start - (end - start) : start - 24;
  const previous = aggregate(report, previousStart, previousEnd);
  return {
    ...base, status: "ready", current, period: period(start, end), comparison: period(previousStart, previousEnd),
    ...(previous ? { previous, delta: { spend: relativeChange(current.spend, previous.spend), units: relativeChange(current.units, previous.units), roi: relativeChange(current.roi, previous.roi) } } : { comparisonMessage: "对比时段缺少报表或小时明细" }),
  };
}

export function summarizeAppLovin(report: AppLovinReport, query: PerformanceQuery, now = new Date()): PerformanceResult {
  const timeZone = "UTC", today = clock(now, timeZone).date;
  const date = query.date === "today" ? today : query.date;
  if (query.start !== 0 || query.end !== 24) return { status: "unavailable", timeZone, message: "AppLovin 当前接入日报，仅支持整日筛选；小时数据不可用于此处对比" };
  if (date > today) return { status: "unavailable", timeZone, message: "所选日期尚未开始" };
  const rows = report.rows;
  if (rows.some(r => r.date === date && (r.purchasesD0 === null || r.revenueD0 === null))) return { status: "unavailable", timeZone, message: "AppLovin 报表缺少 D0 购买数或收入" };
  const daily: SavedReport = { meta: report.meta, campaigns: [{ rows: rows.map(r => ({ date: r.date, spend: r.cost, units: r.purchasesD0 ?? 0, sales: r.revenueD0 ?? 0 })) }] };
  if (date === today) {
    if (report.meta.endDate < date || report.meta.startDate > date || !Number.isFinite(Date.parse(report.meta.updatedAt)) || clock(new Date(report.meta.updatedAt), timeZone).date !== today) return { status: "unavailable", timeZone, message: "尚无今日 AppLovin 缓存，请启动同步" };
    const current = aggregate(daily, tick(date, 0), tick(date, 24));
    return { status: "ready", timeZone, current: current!, period: { start: `${date} 00:00`, end: "已保存日报", label: `${date} 当日累计（UTC，尚未结束）` }, comparisonMessage: "当日尚未结束；日报无法提供等长小时对比" };
  }
  const result = summarizeReport(daily, query, now, timeZone);
  const previousDate = formatTick(tick(date, -24)).slice(0, 10);
  if (result.status === "ready" && rows.some(r => r.date === previousDate && (r.purchasesD0 === null || r.revenueD0 === null))) {
    delete result.previous; delete result.delta;
    result.comparisonMessage = "对比日报缺少 D0 购买数或收入";
  }
  return result;
}
