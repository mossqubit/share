import { summarizeAppLovin, summarizeReport, type PerformanceQuery, type SavedReport, type AppLovinReport } from "../payload/lib/account-performance";

export const demoNow = new Date("2026-11-09T18:30:00Z");
export const demoAccounts = Array.from({ length: 6 }, (_, i) => ({ id: `示例账户 ${String.fromCharCode(65 + i)}`, store: i === 5 ? "AppLovin · example.test" : `store-${i < 2 ? "a" : i < 4 ? "b" : "c"}.example.test`, state: "done" as const }));
export const demoState = { scenario: "normal" };
const round = (n: number) => Math.round(n * 100) / 100;
export function makeReport(index: number, scenario = "normal"): SavedReport {
  const rows: SavedReport["campaigns"][number]["rows"] = [];
  const rates = [118, 204, 316, 167, 49, 92];
  for (let day = 1; day <= 9; day++) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    const hours = Array.from({ length: day === 9 ? 11 : 24 }, (_, hour) => {
      const baselineZero = scenario === "zero" && day < 9;
      const direction = [1.15, 1.06, 1.24, .86, 1.12, 1.08][index];
      const factor = (day === 9 ? direction : 1) * (0.83 + .26 * Math.sin(hour / 4 + index) ** 2);
      const spend = baselineZero ? 0 : round(rates[index] * factor);
      const units = baselineZero ? 0 : Math.round(spend / (15 + index * 2) * (day === 9 ? [1.04, 1.12, 1.16, .83, 1.09, 1][index] : 1));
      const roi = [1.82, 2.14, 1.96, 1.67, 1.74, 2.06][index] * (day === 9 ? [0.97, 1.09, 1.03, .95, 1.06, 1.04][index] : 1);
      return { hour, spend, units, sales: round(spend * roi) };
    });
    rows.push({ date, spend: round(hours.reduce((s, h) => s + h.spend, 0)), units: hours.reduce((s, h) => s + h.units, 0), sales: round(hours.reduce((s, h) => s + h.sales, 0)), hours });
  }
  if (scenario === "hours" && index === 0) for (const row of rows) delete row.hours;
  return { meta: { startDate: scenario === "history" && index === 0 ? "2026-11-09" : "2026-11-01", endDate: "2026-11-09", updatedAt: demoNow.toISOString() }, campaigns: [{ rows }] };
}
function makeAppLovin(scenario: string): AppLovinReport {
  const report = makeReport(5, scenario);
  return { meta: report.meta, rows: report.campaigns[0].rows.map(row => ({ date: row.date, cost: row.spend, purchasesD0: row.units, revenueD0: row.sales })) };
}
export async function loadAccountPerformance(accounts: { id: string; store: string }[], query: PerformanceQuery, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 180);
    if (signal?.aborted) { clearTimeout(timer); reject(new Error("aborted")); return; }
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("aborted")); }, { once: true });
  });
  const scenario = demoState.scenario;
  return accounts.map((account, index) => {
    const timeZone = index === 5 ? "UTC" : "America/Los_Angeles";
    if (scenario === "missing" && index === 3) return { id: account.id, timeZone, status: "unavailable" as const, message: "尚无保存报表，请启动同步" };
    if (scenario === "missing" && index === 1) return { id: account.id, timeZone, status: "unavailable" as const, message: "缓存尚未覆盖所选时段，请启动同步后重试" };
    if (scenario === "error" && index === 0) return { id: account.id, timeZone, status: "error" as const, message: "该账户报表读取失败，请同步后重试" };
    return { id: account.id, ...(index === 5 ? summarizeAppLovin(makeAppLovin(scenario), query, demoNow) : summarizeReport(makeReport(index, scenario), query, demoNow)) };
  });
}
