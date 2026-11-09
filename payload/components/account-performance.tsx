"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PerformanceResult, Totals } from "@/lib/account-performance";
import { loadAccountPerformance } from "@/lib/account-performance-loader";
import styles from "./account-performance.module.css";

type Mission = { id: string; store: string; state: "waiting" | "running" | "done" | "failed" };
type Props = { missions: Mission[]; activeAccountId: string; disabled?: boolean; running: boolean; onSelect: (id: string) => void; onDisable: () => void };
type Snapshot = { key: string; accounts: (PerformanceResult & { id: string })[] };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const metrics = [{ key: "spend", label: "花费" }, { key: "units", label: "单量" }, { key: "roi", label: "ROI" }] as const;
function metricValue(key: "spend" | "units" | "roi", current?: Totals) {
  const value = current?.[key];
  if (value === null || value === undefined) return "—";
  return key === "spend" ? money(value) : key === "roi" ? value.toFixed(2) : new Intl.NumberFormat("zh-CN").format(value);
}
function change(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "↑ " : value < 0 ? "↓ " : ""}${Math.abs(value).toFixed(1)}%`;
}

export function AccountPerformance({ missions, activeAccountId, disabled = false, running, onSelect, onDisable }: Props) {
  const [date, setDate] = useState("today");
  const [customDate, setCustomDate] = useState("");
  const [start, setStart] = useState(0), [end, setEnd] = useState(24);
  const [compare, setCompare] = useState("previous");
  const [account, setAccount] = useState("all");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const retry = () => setReload(n => n + 1);
  const selectedDate = date === "custom" ? customDate : "today";
  const valid = !!selectedDate && start < end;
  const key = new URLSearchParams({ date: selectedDate, start: String(start), end: String(end), compare }).toString();
  // Reread saved reports when synchronization finishes. No upstream ad API calls are made here.
  const syncVersion = missions.map(m => `${m.id}:${m.state === "done" || m.state === "failed" ? m.state : "pending"}`).join("|");
  const requestId = useRef(0);
  const accountList = JSON.stringify(missions.map(({ id, store }) => ({ id, store })));
  const read = useCallback(async (signal: AbortSignal) => {
    const id = ++requestId.current;
    if (!valid) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const values = await loadAccountPerformance(JSON.parse(accountList), { date: selectedDate, start, end, compare: compare as "previous" | "yesterday" }, signal);
      if (id === requestId.current && !signal.aborted) setSnapshot({ key, accounts: values });
    } catch (reason) {
      if (!signal.aborted && id === requestId.current) { setSnapshot(null); setError(reason instanceof Error ? reason.message : "账户表现读取失败"); }
    } finally { if (!signal.aborted && id === requestId.current) setLoading(false); }
  }, [key, valid, accountList, selectedDate, start, end, compare]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => { void read(controller.signal); }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [read, reload, syncVersion]);
  // Keep 'today' current across midnight and reread caches while the page remains open.
  useEffect(() => { const timer = setInterval(retry, 60000); return () => clearInterval(timer); }, []);
  const values = snapshot?.key === key && !loading && !error && valid ? snapshot.accounts : [];
  const visible = missions.filter(m => account === "all" || account === m.id);
  return <section className={styles.panel} aria-label="账户表现">
    <header className={styles.heading}><div><h2>账户表现</h2><span>当日数据与时段对比</span></div><div><small>{missions.length} ACCOUNTS</small><button type="button" onClick={onDisable}>切回同步序列</button></div></header>
    <div className={styles.filters}>
      <label>日期<select value={date} onChange={e => setDate(e.target.value)}><option value="today">今天</option><option value="custom">指定日期</option></select></label>
      {date === "custom" && <label>指定日期<input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}/></label>}
      <label>开始<select value={start} onChange={e => setStart(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
      <label>结束<select value={end} onChange={e => setEnd(Number(e.target.value))}>{Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
      <label>对比<select value={compare} onChange={e => setCompare(e.target.value)}><option value="previous">上一时段（紧邻等长）</option><option value="yesterday">昨日同时段</option></select></label>
      <label>账户<select value={account} onChange={e => setAccount(e.target.value)}><option value="all">全部账户</option>{missions.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
      <button type="button" onClick={retry} disabled={loading}>重新读取</button>
    </div>
    <p className={styles.context}>筛选后自动读取已保存数据；今天仅统计已结束的完整小时。{running ? "账户同步中，完成后自动读取。" : ""}</p>
    <div role="status" aria-live="polite">{!valid ? <p className={styles.warning}>请选择日期，且开始时间须早于结束时间。</p> : error ? <p className={styles.warning}>{error} <button type="button" onClick={retry}>重试</button></p> : loading ? <p className={styles.context}>正在读取账户表现…</p> : null}</div>
    <div className={styles.grid}>{visible.map(mission => {
      const result = values.find(v => v.id === mission.id);
      const current = result?.status === "ready" ? result.current : undefined;
      return <button type="button" key={mission.id} disabled={disabled} onClick={() => onSelect(mission.id)} aria-pressed={activeAccountId === mission.id} className={`${styles.card} ${activeAccountId === mission.id ? styles.active : ""}`}>
        <div className={styles.identity}><span className={styles.number}>{String(missions.indexOf(mission) + 1).padStart(2, "0")}</span><span><strong>{mission.id}</strong><small>{mission.store}</small></span></div>
        <div className={styles.metrics}>{metrics.map(metric => {
          const delta = result?.delta?.[metric.key];
          const tone = metric.key === "spend" ? styles.neutral : delta !== null && delta !== undefined && delta < 0 ? styles.down : styles.up;
          return <div key={metric.key}><span>{metric.label}</span><strong>{metricValue(metric.key, current)}</strong><small className={tone}>{change(delta)}</small></div>;
        })}</div>
        <div className={styles.detail}>
          {result?.period && <span>当前：{result.period.label}</span>}
          {result?.comparison && <span>对比：{result.comparison.label}</span>}
          <span>{result?.timeZone === "UTC" || /^AppLovin\b/i.test(mission.store) ? "UTC · AppLovin D0 购买数 / 收入" : "洛杉矶时间 · 已归因订单"}</span>
          {result?.message && <span className={styles.warning}>{result.message}</span>}
          {result?.comparisonMessage && <span className={styles.warning}>{result.comparisonMessage}</span>}
          {result?.previous && <span>基期：{money(result.previous.spend)} / {result.previous.units} 单 / ROI {result.previous.roi?.toFixed(2) ?? "—"}</span>}
        </div>
      </button>;
    })}</div>
    <p className={styles.footer}>ROI = 销售额 ÷ 花费，与现有 ROAS 口径一致 · 涨跌为相对变化 · 基期为 0 时显示 —（两期均为 0 则显示 0.0%） · 数据随原有“启动同步”更新</p>
  </section>;
}
