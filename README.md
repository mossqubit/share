# AdEngine 账户表现功能包

为现有 AdEngine 面板增加账户花费、单量、ROI 和时段涨跌对比。此仓库是**增量功能包**，不是完整面板；需要已能正常运行的原面板、原有报表缓存和原有授权配置。Windows 开发，macOS / Windows 均可安装，不新增 npm 依赖。

## Mac 安装

先保存原面板的未提交修改。在终端执行（将 `/你的路径/面板项目` 替换为已有面板项目根目录，路径有空格也保留引号）：

```sh
git clone https://github.com/mossqubit/share.git adengine-account-performance
cd adengine-account-performance
node scripts/install.mjs --target "/你的路径/面板项目" --check
node scripts/install.mjs --target "/你的路径/面板项目"
```

安装器会检查兼容性、新增四个功能文件，并修改 `components/mission-control.tsx`，保留原同步序列。不同结构或同名冲突会停止，避免覆盖现有代码。原文件保存在目标项目 `.account-performance-backup.json`，请保留，勿将该备份提交到公开仓库。安装器检查现有面板结构；另一台的版本如有差异，先运行 `--check`。

然后回到原面板目录，按原来方式启动。开发环境通常运行 `npm run dev`；运行构建版本则先 `npm run build` 再 `npm start`。如果原面板使用其他启动脚本，继续使用其原有流程。**仅在已有面板环境安装，不要在本功能包目录运行 npm install 或 npm run dev。** 原面板需要的 Node、Cloudflare 本地运行环境、缓存、密钥等由原项目提供；Git 不传输这些配置或数据。

打开面板后，在同步序列上方点击 **开启账户表现**。默认关闭，启用状态存储在本设备、当前浏览器的 localStorage 中；不会随 Git 同步到另一台电脑。同一个浏览器中的其他标签页会跟随开关。点击 **切回同步序列** 恢复原界面。清除浏览器站点数据后需重新开启。

## 功能和统计口径

- 新视图移除原卡片中的剩余额度、更新时间、等待启动文字。原同步流程和侧栏状态保持工作。
- 从面板现有账户列表生成卡片：花费、单量、ROI、相对涨跌幅。支持今天 / 指定日期、开始 / 结束整点、全部 / 单账户筛选。公开功能包不包含真实账户编号或内部缓存路径。
- 对比方式：上一时段为当前时段之前紧邻的等长时段，可跨日；昨日同时段为前一日相同时段。每张卡片列出实际起止范围和基期数值。
- Google / SHOPLINE 沿用原报表的 `America/Los_Angeles` 时区和归因订单口径，单量使用现有 `units`。ROI = 归因销售额 / 花费（与面板原 ROAS 一致，并非利润率）。不按 Mac 或 Windows 系统时区计算。
- 今天只统计已结束的完整报表小时，自动裁剪结束时间，再用同样长度做对比；当前正在进行的小时不计入。跨夏令时按原报表的日期与小时槽统计，不能区分重复的同名小时。
- AppLovin 接入原有 UTC 日报，单量为 D0 购买数，ROI = D0 收入 / 花费；不混为 SHOPLINE 归因订单。今天显示已保存的当日累计，因没有对应等长小时数据，不显示涨跌；历史日期支持整日对比。选择非整日时提示不支持，不伪造小时数据。
- 基期为零、零花费、无历史数据、无小时明细、旧缓存未覆盖当前时段时，不显示虚假的涨跌或无穷大；缺失用 `—` 和原因说明。两期均为零时涨跌为 0.0%。
- 复用原面板已有报表 GET 接口读取缓存，不新增后端路由、不额外请求广告平台、不修改账户操作。页面打开时、筛选变更时、同步完成后以及每 60 秒重新读取缓存；数据实际更新仍使用原有“启动同步”。原报表可能有平台延迟或后续归因修订。每次读取按账户分别调用已有接口，较新增汇总接口传输数据量更大。

## 文件

安装后新增：

```text
components/account-performance.tsx
components/account-performance.module.css
lib/account-performance.ts
lib/account-performance-loader.ts
```

`scripts/install.mjs` 只添加本地开关包装，原 `MissionSequence` 改名为 `LegacyMissionSequence` 后保留。若安装器提示结构不兼容，应由开发者按此逻辑手动合并，不要整份覆盖另一台电脑的页面。后续 `git pull` 只更新功能包，再次安装不会强行覆盖已改动文件。

## 验证

使用 Node 22.13+（与原项目一致），模型及接口测试使用内置 TypeScript 支持：

```sh
node --experimental-strip-types --experimental-vm-modules --test tests/*.test.mjs
```

测试覆盖跨天、整点边界、业务时区、零基期、缺失小时、旧缓存、AppLovin 日报限制、账户错误隔离、安装检查、备份和重复安装。完整项目类型检查须在原面板安装后进行。

## 恢复

最快恢复方式是点击“切回同步序列”。要移除源码变更，请使用原面板 Git 对照修改，或从 `.account-performance-backup.json` 的 `files` 中恢复原 `mission-control.tsx`；仅在确认安装后没有手工修改这些文件时，再删除上面四个新增文件。不要用旧备份覆盖后续开发成果。

此包不包含真实报表、账户凭据、授权会话或本机环境文件。
