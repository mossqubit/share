import { summarizeAppLovin, summarizeReport, type AppLovinReport, type PerformanceQuery, type PerformanceResult, type SavedReport } from "./account-performance";

export type PerformanceAccount = { id: string; store: string };
export async function loadAccountPerformance(accounts: PerformanceAccount[], query: PerformanceQuery, signal?: AbortSignal, fetcher: typeof fetch = fetch, now = new Date()): Promise<(PerformanceResult & { id: string })[]> {
  // Account identities are supplied by the host panel, never bundled in this feature.
  return Promise.all(accounts.map(async account => {
    const applovin = /^AppLovin\b/i.test(account.store);
    const timeZone = applovin ? "UTC" : "America/Los_Angeles";
    try {
      // GET reads the host panel's saved reports. Do not call its synchronization POST endpoints.
      const url = applovin ? "/api/applovin" : `/api/dashboard?account=${encodeURIComponent(account.id)}`;
      const response = await fetcher(url, { method: "GET", cache: "no-store", signal });
      if (!response.ok) return { id: account.id, timeZone, status: "unavailable" as const, message: response.status === 404 ? "尚无保存报表，请启动同步" : "该账户报表读取失败，请同步后重试" };
      const report: unknown = await response.json();
      const result = applovin ? summarizeAppLovin(report as AppLovinReport, query, now) : summarizeReport(report as SavedReport, query, now);
      return { id: account.id, ...result };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { id: account.id, timeZone, status: "error" as const, message: "该账户报表读取失败，请同步后重试" };
    }
  }));
}
