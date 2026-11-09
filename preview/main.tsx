import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccountPerformance } from "../payload/components/account-performance";
import { demoAccounts, demoState } from "./demo-data";
import "./preview.css";

function App() {
  const saved = (window as unknown as { openai?: { widgetState?: { privateContent?: { scenario?: string; active?: string; enabled?: boolean } } } }).openai?.widgetState?.privateContent;
  const scenarios = [{ value: "normal", label: "正常数据" }, { value: "zero", label: "基期为零" }, { value: "history", label: "缺少历史数据" }, { value: "missing", label: "部分账户无数据" }, { value: "hours", label: "缺少小时明细" }, { value: "error", label: "单个账户读取失败" }];
  const initialScenario = scenarios.some(s => s.value === saved?.scenario) ? saved!.scenario! : "normal";
  const [scenario, setScenario] = useState(initialScenario);
  const [active, setActive] = useState(saved?.active && demoAccounts.some(a => a.id === saved.active) ? saved.active : demoAccounts[2].id);
  const [enabled, setEnabled] = useState(saved?.enabled ?? true);
  demoState.scenario = scenario;
  const remember = (changes: object) => {
    const host = (window as unknown as { openai?: { setWidgetState?: (state: object) => Promise<void> } }).openai;
    host?.setWidgetState?.({ modelContent: { preview: "账户表现", scenario, ...changes }, privateContent: { scenario, active, enabled, ...changes } }).catch(() => {});
  };
  useEffect(() => {
    const listener = (event: Event) => {
      const value = (event as CustomEvent).detail?.globals?.widgetState?.privateContent;
      if (!value) return;
      if (scenarios.some(s => s.value === value.scenario)) setScenario(value.scenario);
      if (demoAccounts.some(a => a.id === value.active)) setActive(value.active);
      if (typeof value.enabled === "boolean") setEnabled(value.enabled);
    };
    window.addEventListener("openai:set_globals", listener);
    return () => window.removeEventListener("openai:set_globals", listener);
  }, []);
  return <div className="ap-preview-product">
    <header className="ap-preview-top"><div><span className="ap-preview-brand">AdEngine</span><span className="ap-preview-label">交互验收</span></div><span className="ap-preview-badge">模拟数据</span></header>
    <div className="ap-preview-controls"><label>演示场景<select aria-label="演示场景" value={scenario} onChange={e => { setScenario(e.target.value); remember({ scenario: e.target.value }); }}>{scenarios.map(s => <option value={s.value} key={s.value}>{s.label}</option>)}</select></label><span>固定演示时间：11 月 9 日 10:30 · 洛杉矶</span></div>
    {enabled ? <AccountPerformance key={scenario} missions={demoAccounts} activeAccountId={active} running={false} onSelect={id => { setActive(id); remember({ active: id }); }} onDisable={() => { setEnabled(false); remember({ enabled: false }); }}/> : <section className="ap-preview-off"><h2>已切回同步序列</h2><p>账户表现已关闭</p><button type="button" onClick={() => { setEnabled(true); remember({ enabled: true }); }}>开启账户表现</button></section>}
  </div>;
}
const root = document.getElementById("account-performance-preview");
if (!root) throw Error("preview root missing");
createRoot(root).render(<App/>);
