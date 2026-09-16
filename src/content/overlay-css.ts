export const OVERLAY_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 400px;
  font: 13px/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #e6edf3; background: rgba(13, 17, 23, 0.96); border: 1px solid #30363d;
  border-radius: 12px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55); backdrop-filter: blur(8px);
}
.panel.collapsed .body { display: none; }
.panel.collapsed { width: auto; }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: default; border-bottom: 1px solid #21262d; }
.panel.collapsed .head { border-bottom: 0; }
.title { font-weight: 600; letter-spacing: 0.2px; }
.pill { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; color: #9da7b3; }
.badge { margin-left: auto; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; background: #21262d; color: #9da7b3; }
.badge.dry { background: #1f3a5f; color: #79c0ff; }
.badge.manual { background: #3d2e00; color: #ffd33d; animation: pulse 1s infinite; }
.badge.live { background: #5a1e1e; color: #ff7b72; animation: pulse 1s infinite; }
.badge.done { background: #1f4d2b; color: #56d364; }
@keyframes pulse { 50% { opacity: 0.55; } }
.lang { background: #0d1117; color: #9da7b3; border: 1px solid #30363d; border-radius: 6px; font: inherit; font-size: 11px; padding: 1px 4px; cursor: pointer; }
.icon-btn { background: none; border: 0; color: #9da7b3; cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 6px; }
.icon-btn:hover { background: #21262d; color: #e6edf3; }
.body { padding: 12px; display: grid; gap: 12px; max-height: 78vh; overflow: auto; }
.clock { text-align: center; }
.clock .time { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 40px; font-weight: 300; letter-spacing: 1px; line-height: 1.1; }
.clock .time small { font-size: 22px; color: #9da7b3; }
.clock .meta { color: #9da7b3; font-size: 12px; margin-top: 2px; }
.clock .sync { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #f85149; display: inline-block; }
.dot.good { background: #3fb950; } .dot.fair { background: #d29922; }
.countdown { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 500; text-align: center; color: #ffd33d; line-height: 1.2; }
.countdown.past { color: #56d364; }
.countdown.unset { color: #6e7681; font-size: 16px; }
.section { display: grid; gap: 6px; }
.section h4 { margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #8b949e; }
.row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.row label { color: #9da7b3; font-size: 12px; }
input[type="text"], input[type="number"], input[type="date"], input[type="time"] {
  background: #0d1117; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 5px 7px; font: inherit; font-size: 13px;
}
input[type="number"] { width: 72px; }
input[type="text"] { flex: 1; min-width: 120px; }
input:focus { outline: none; border-color: #58a6ff; }
input[type="checkbox"] { accent-color: #58a6ff; }
.btn { background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px; padding: 5px 10px; font: inherit; font-size: 12px; cursor: pointer; }
.btn:hover { background: #30363d; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn.primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
.btn.primary:hover { background: #388bfd; }
.btn.danger { background: #b62324; border-color: #b62324; color: #fff; font-weight: 700; }
.btn.danger:hover { background: #da3633; }
.btn.warn { background: #9e6a03; border-color: #9e6a03; color: #fff; font-weight: 700; }
.btn.stop { background: #f85149; border-color: #f85149; color: #fff; font-weight: 800; font-size: 14px; padding: 8px 14px; width: 100%; }
.step { border: 1px solid #30363d; border-radius: 8px; padding: 8px; display: grid; gap: 6px; }
.step .num { font-weight: 700; color: #ffd33d; }
.step .target { font-size: 12px; color: #9da7b3; word-break: break-all; }
.step .target b { color: #e6edf3; }
.step .state { font-size: 12px; }
.state.ok { color: #56d364; } .state.off { color: #d29922; } .state.missing { color: #f85149; }
details summary { cursor: pointer; color: #8b949e; font-size: 12px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: #9da7b3; background: #0d1117; border: 1px solid #21262d; border-radius: 6px; padding: 6px 8px; max-height: 130px; overflow: auto; white-space: pre-wrap; }
.log .ok { color: #56d364; } .log .bad { color: #ff7b72; } .log .warn { color: #d29922; }
.hint { font-size: 11px; color: #6e7681; }
.flash { position: fixed; z-index: 2147483647; pointer-events: none; border: 3px solid #ffd33d; border-radius: 6px; box-shadow: 0 0 0 4px rgba(255, 211, 61, 0.35), 0 0 24px rgba(255, 211, 61, 0.7); animation: flash 1.2s ease-out forwards; }
@keyframes flash { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
.pick-shield { position: fixed; inset: 0; z-index: 2147483646; cursor: crosshair; background: transparent; }
.pick-box { position: fixed; z-index: 2147483647; pointer-events: none; border: 2px solid #58a6ff; background: rgba(88, 166, 255, 0.15); border-radius: 4px; }
.pick-tip { position: fixed; z-index: 2147483647; pointer-events: none; background: #1f6feb; color: #fff; font: 12px/1.3 -apple-system, "Segoe UI", Roboto, sans-serif; padding: 4px 8px; border-radius: 6px; max-width: 360px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); }
.pick-banner { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483647; background: #1f6feb; color: #fff; font: 600 13px -apple-system, "Segoe UI", Roboto, sans-serif; padding: 8px 14px; border-radius: 999px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4); }
`;
