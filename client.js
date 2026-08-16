/**
 * dsh-im-connect 浏览器端：IM助理设置页 + 工作区频道槽。
 */
window.__ModuleLoader__.load({
  id: "dsh-im-connect",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const { useState, useEffect, useCallback, useRef, useSyncExternalStore } = React;
    const EMPTY_EXTRA_TABS = [];
    const inject = ["slots", "sessions", "workspaces"];
    const API_BASE = "/dsh-im-connect/api";
    const TAB_KEY = "dsh-im-connect.sidebar-tab";
    const h = React.createElement;

    const CSS = `
.ima-page{--ima-text:var(--dsw-alias-label-primary,var(--dsh-text,#e6edf3));--ima-muted:var(--dsw-alias-label-tertiary,var(--dsh-text-muted,#8b949e));--ima-line:var(--dsw-alias-border-l2,var(--dsh-border,rgba(255,255,255,.1)));--ima-card:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.04));--ima-card-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06));--ima-ok:var(--dsw-alias-state-success-primary,#3fb950);--ima-danger:var(--dsw-alias-state-error-primary,#f85149);--ima-accent:var(--dsw-alias-brand-primary,#4b7cff);box-sizing:border-box;max-width:760px;width:100%;margin:0 auto;padding:0 0 32px;color:var(--ima-text)}
.ima-deco{display:flex;justify-content:center;align-items:flex-end;gap:10px;min-height:56px;margin:8px 0 14px}
.ima-bubble{font-size:12px;line-height:1.4;padding:6px 10px;border-radius:12px;max-width:220px;border:1px solid var(--ima-line)}
.ima-bubble.left{background:rgba(46,160,67,.14);color:#7ee787}
.ima-bubble.right{background:rgba(255,255,255,.05);color:var(--ima-muted)}
.ima-avatars{display:flex;align-items:center}
.ima-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:2px solid #111}
.ima-avatar.bot{background:#123524;margin-right:-8px;z-index:1}
.ima-avatar.user{background:#3d3428}
.ima-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.ima-title{margin:0;font-size:20px;line-height:28px;font-weight:650;letter-spacing:-.2px;text-align:left}
.ima-sub{margin:4px 0 0;max-width:42em;color:var(--ima-muted);font-size:13px;line-height:1.5;text-align:left}
.ima-composer-wrap{margin:0 0 16px}
.ima-composer{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:4px;padding:4px 6px;border:1px solid var(--ima-line);border-radius:14px;background:var(--ima-card)}
.ima-composer-left,.ima-composer-right{display:contents}
.ima-composer .ima-chip{width:100%;min-width:0}
.ima-composer .ima-chip-btn{width:100%;justify-content:center}
.ima-chip{position:relative;min-width:0;z-index:1}
.ima-chip.is-open{z-index:30}
.ima-chip-btn{display:inline-flex;align-items:center;gap:6px;min-height:28px;height:28px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--ima-muted);font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer}
.ima-chip-btn:hover,.ima-chip.is-open .ima-chip-btn{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--ima-text)}
.ima-chip-label{min-width:0;overflow:hidden;text-overflow:ellipsis}
.ima-chip-btn em{width:6px;height:6px;margin-left:2px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.55;flex:none}
.ima-chip-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:30;min-width:260px;max-height:280px;overflow:auto;padding:6px;border:1px solid var(--ima-line);border-radius:14px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));box-shadow:var(--dsw-shadow-lv3,0 16px 40px rgba(0,0,0,.18))}
.ima-chip-menu.is-end{left:auto;right:0}
.ima-chip-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer;font-size:13px}
.ima-chip-row:hover,.ima-chip-row.is-on{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-chip-row-main{display:inline-flex;align-items:center;gap:8px;min-width:0}
.ima-chip-tick{width:6px;height:12px;border-right:1.6px solid var(--ima-accent);border-bottom:1.6px solid var(--ima-accent);transform:rotate(45deg) translateY(-2px);flex:none}
.ima-chip-empty{padding:14px 12px;color:var(--ima-muted);font-size:12px;text-align:center}
.ima-composer-hint{margin-top:8px;color:var(--ima-muted);font-size:12px;text-align:center}
.ima-chip svg{flex:none}
.ima-chip-row.is-kv .ima-chip-row-main{flex:none}
.ima-chip-row-side{display:inline-flex;align-items:center;gap:8px;color:var(--ima-muted);font-size:12px;min-width:0}
.ima-chip-next{width:7px;height:7px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(-45deg);opacity:.55;flex:none}
.ima-chip-split{height:1px;margin:6px 8px;background:var(--ima-line)}
.ima-chip-effort{color:var(--ima-muted);font-weight:500}
.ima-chip-dialog{margin-top:10px;padding:12px;border:1px solid var(--ima-line);border-radius:12px;background:var(--dsw-alias-bg-layer-3,transparent)}
.ima-chip-dialog strong{display:block;margin:0 0 8px;font-size:13px}
.ima-chip-dialog input{width:100%;min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);box-sizing:border-box}
.ima-chip-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}

.ima-list{display:flex;flex-direction:column;gap:10px}
.ima-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:52px;padding:13px 16px;border:1px solid var(--ima-line);border-radius:12px;background:var(--ima-card)}
.ima-card:hover{background:var(--ima-card-hover)}
.ima-card-main{min-width:0}
.ima-name-row{display:flex;align-items:center;gap:10px;min-height:28px}
.ima-status{margin-left:auto;color:var(--ima-muted);font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%}
.ima-name{font-size:15px;font-weight:650}
.ima-badge{font-size:11px;line-height:18px;padding:0 7px;border-radius:8px;background:rgba(46,160,67,.16);color:var(--ima-ok)}
.ima-desc,.ima-meta{margin-top:3px;margin-left:38px;color:var(--ima-muted);font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:17px}
.ima-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:36px;position:relative}
.ima-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.16));background:transparent;color:var(--dsw-alias-label-primary,inherit);border-radius:8px;min-width:72px;min-height:32px;padding:0 12px;font:inherit;font-size:13px;cursor:pointer}
.ima-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-btn:focus-visible,.ima-more:focus-visible,.ima-switch:focus-visible,.ima-link:focus-visible,.ima-x:focus-visible{outline:2px solid var(--ima-accent);outline-offset:2px}
.ima-btn:disabled{opacity:.5;cursor:not-allowed}
.ima-btn.primary{background:var(--dsw-alias-button-primary-fill,var(--ima-accent));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff)}
.ima-more{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--ima-text);cursor:pointer;font-size:18px;line-height:1}
.ima-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-menu{position:absolute;right:0;top:36px;min-width:128px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));z-index:5;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18))}
.ima-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:8px 10px;border-radius:6px;cursor:pointer;min-height:36px}
.ima-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-switch{width:40px;height:22px;border-radius:11px;border:0;background:var(--ima-ok);position:relative;cursor:pointer;flex:none}
.ima-switch.off{background:var(--dsw-alias-label-tertiary,#8b8f98)}
.ima-switch i{position:absolute;top:2px;left:20px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .16s ease}
.ima-switch.off i{left:2px}
.ima-error{color:var(--ima-danger);font-size:12px;margin:0 0 12px}
.ima-pending{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(210,153,34,.35);border-radius:12px}
.ima-pending-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.ima-wrap{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}.ima-official-tree{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}.ima-native,.ima-rail.ima-native,.ima-rail.dcu-wb{box-sizing:border-box;padding-right:var(--dsh-sidebar-inline-padding,12px)}
.ima-tabs{display:flex;gap:18px;padding:4px 12px 0;border-bottom:1px solid var(--ima-line)}
.ima-tab{appearance:none;border:0;background:transparent;color:var(--ima-muted);padding:8px 0;font-size:13px;cursor:pointer}
.ima-tab.on{color:var(--ima-text);box-shadow:inset 0 -2px 0 currentColor}
.ima-tabs{flex:none}
.ima-rail{flex:1 1 auto;min-height:180px;overflow:auto}
.ima-item{display:flex;align-items:center;gap:6px;padding:0 8px 0 18px;border-radius:8px;cursor:pointer;font-size:13px;min-height:32px;position:relative}
.ima-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ima-item:hover,.ima-item.on{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-actions{display:none;flex:none;align-items:center;gap:2px}
.ima-item:hover .ima-sess-actions,.ima-item.menu-on .ima-sess-actions{display:flex}
.ima-sess-btn{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1}
.ima-sess-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-menu{position:absolute;right:8px;top:30px;min-width:132px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,#fff));z-index:8;box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.18))}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:7px 10px;border-radius:6px;cursor:pointer}
.ima-sess-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}
.ima-sess-menu button.danger{color:var(--ima-danger)}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);font-size:13px}
.ima-empty{color:var(--ima-muted);font-size:12px;padding:12px 8px}
.ima-logo{width:28px;height:28px;flex:none;display:block;line-height:0;background:transparent}
.ima-logo svg{width:28px;height:28px;display:block}
.ima-logo.sm{width:16px;height:16px;overflow:visible}
.ima-logo.sm svg{width:16px;height:16px}
.ima-logo.sm[data-brand="weixin"] svg,.ima-logo.sm[data-brand="feishu"] svg,.ima-logo.sm[data-brand="lark"] svg,.ima-logo.sm[data-brand="telegram"] svg{transform:scale(1.2);transform-origin:center}
.ima-logo[data-brand="wecom"]{border-radius:6px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);overflow:hidden;background:#fff}
.ima-logo.sm[data-brand="wecom"]{border-radius:4px}
.ima-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(8px));display:grid;place-items:center;z-index:80;padding:24px}
.ima-modal{width:min(440px,100%);background:var(--dsw-alias-bg-layer-2,#fff);color:var(--ima-text);border:1px solid var(--ima-line);border-radius:16px;padding:20px 22px 22px;text-align:left;box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.18))}
.ima-modal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ima-modal-h h2{margin:0;font-size:16px;font-weight:650}
.ima-x{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--ima-muted);width:32px;height:32px}
.ima-seg{display:flex;gap:0;border-bottom:1px solid var(--ima-line);margin:0 -22px 16px;padding:0 22px}
.ima-seg button{flex:1;border:0;background:transparent;padding:10px 0;font-size:13px;color:var(--ima-muted);cursor:pointer}
.ima-seg button.on{color:var(--ima-accent);box-shadow:inset 0 -2px 0 var(--ima-accent);font-weight:600}
.ima-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}
.ima-qrbox img,.ima-qrph{width:200px;height:200px;background:#fff;border:1px solid var(--ima-line);border-radius:12px;object-fit:contain}
.ima-qrph{display:grid;place-items:center;color:var(--ima-muted);font-size:13px}
.ima-hint{margin:0;color:var(--ima-muted);font-size:13px;text-align:center;line-height:1.6}
.ima-link{border:0;background:transparent;color:var(--ima-accent);cursor:pointer;font-size:13px;min-height:32px}
.ima-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}
.ima-field input{padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill,transparent));color:var(--ima-text);min-height:36px}
.ima-radio{display:flex;flex-direction:column;gap:8px;margin:8px 0 14px}
.ima-radio label{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ima-text)}
.ima-radio small{display:block;color:var(--ima-muted);margin-top:2px}
.ima-ok{color:var(--ima-ok);font-size:14px;text-align:center;padding:24px 0}
.ima-modal .ima-error{color:var(--ima-danger)}
@media (prefers-reduced-motion:reduce){.ima-switch i{transition:none}}
`;

    let styleEl = null;
    const ensureStyle = () => {
      if (styleEl && styleEl.isConnected) return;
      styleEl = document.createElement("style");
      styleEl.textContent = CSS;
      document.head.appendChild(styleEl);
    };

    const api = (path, opts) => fetch(API_BASE + path, opts).then((r) => r.json());

    function BrandMark({ id }) {
      const svg = (viewBox, children) => h("svg", {
        viewBox,
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        "aria-hidden": "true",
      }, children);

      if (id === "dingtalk") {
        return svg("0 0 48 48", [
          h("rect", { key: "bg", x: 6, y: 6, width: 36, height: 36, rx: 8, fill: "#0285fc" }),
          h("path", { key: "mark", d: "m20.178 37.577 3.5-6h-3l2-3c-5.5-1-6.281-3.938-6-4.5.162-.325 2.5 1 6.281 1-8.281-.5-8.281-7-7.781-7.5.423-.424 2.44 1.666 6.564 3.53-9.126-4.314-6.453-11.956-5.064-11.03 3.344 3 9.5 8.5 15 13 .658.538 1 2 0 3.25s-2.5 2.75-3 3.25h2.5z", fill: "#fff" }),
        ]);
      }

      if (id === "feishu" || id === "lark") {
        return svg("0 0 48 48", [
          h("path", { key: "wing", d: "M10 8c0 1 7 3.5 14.745 16.744 0 0 4.184-4.363 6.255-5.744 1.5-1 2.712-1.332 2.712-1.332C33.712 15.156 29.5 8 28 8z", fill: "#00d6b9" }),
          h("path", { key: "head", d: "M43.5 18.5c-1-.667-3.65-1.771-6.5-1.5a15 15 0 0 0-3.288.668S32.5 18 31 19c-2.07 1.38-6.255 5.744-6.255 5.744-1.428 1.397-3.05 2.732-5.245 3.756 0 0 7 3 11.5 3 5.063 0 7-3.5 7-3.5 1.5-3.305 3.5-7 5.5-9.5", fill: "#163c9a" }),
          h("path", { key: "body", d: "M4 17.5v17c0 1 6 5.5 15 5.5 10 0 17.05-7.705 19-12 0 0-1.937 3.5-7 3.5-4.5 0-11.5-3-11.5-3-5.117-2.239-10.03-6.577-12.906-9.117C4.974 17.953 4 17.093 4 17.5", fill: "#3370ff" }),
        ]);
      }

      if (id === "weixin") {
        return svg("0 0 48 48", [
          h("path", { key: "left", fillRule: "evenodd", clipRule: "evenodd", d: "M32.8 18.003 32.5 18C25.732 18 20 22.798 20 29c0 1.007.151 1.976.433 2.894A18 18 0 0 1 18.5 32c-1.809 0-3.54-.274-5.137-.775-.394-.123-1.828.696-3.039 1.389-.927.53-1.724.986-1.824.886-.094-.094.169-.718.476-1.448.446-1.06.986-2.346.664-2.552C6.21 27.305 4 23.866 4 20c0-6.627 6.492-12 14.5-12 7.186 0 13.151 4.326 14.3 10.003M16 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0m7 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4", fill: "#07C160" }),
          h("path", { key: "right", fillRule: "evenodd", clipRule: "evenodd", d: "M44 29c0 3.362-1.908 6.336-4.833 8.149-.13.08.169.858.446 1.583.237.618.459 1.196.387 1.268-.075.075-.802-.327-1.571-.752-.829-.458-1.706-.942-1.871-.888-1.262.413-2.63.64-4.058.64C26.149 39 21 34.523 21 29s5.149-10 11.5-10S44 23.477 44 29m-6-3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M28.5 27a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3", fill: "#07C160" }),
        ]);
      }

      if (id === "wecom") {
        return svg("0 0 46 46", [
          h("path", { key: "bg", d: "M39.743 0H6.257A6.257 6.257 0 0 0 0 6.257v33.487A6.257 6.257 0 0 0 6.257 46h33.487A6.257 6.257 0 0 0 46 39.743V6.257A6.257 6.257 0 0 0 39.743 0", fill: "#fff" }),
          h("path", { key: "orange", d: "M28.856 31.647a.483.483 0 0 0 .06.738 6.2 6.2 0 0 1 1.911 3.725 2.02 2.02 0 1 0 2.16-2.54 6.2 6.2 0 0 1-3.448-1.922.483.483 0 0 0-.683-.001", fill: "#fb6500" }),
          h("path", { key: "blueDot", d: "M37.057 28.448a2 2 0 0 0-.58 1.215 6.2 6.2 0 0 1-1.918 3.454.484.484 0 1 0 .738.616 6.2 6.2 0 0 1 3.725-1.91 2.02 2.02 0 1 0-1.96-3.376z", fill: "#0082ef" }),
          h("path", { key: "green", d: "M31.366 22.75a2.02 2.02 0 0 0 1.215 3.435 6.2 6.2 0 0 1 3.454 1.918.483.483 0 0 0 .829-.27.48.48 0 0 0-.212-.468 6.2 6.2 0 0 1-1.911-3.726 2.02 2.02 0 0 0-3.375-.889", fill: "#2dbc00" }),
          h("path", { key: "yellow", d: "m30.374 25.907-.037.037a6.2 6.2 0 0 1-3.78 1.978 2.007 2.007 0 0 0-.895 3.374 2.02 2.02 0 0 0 3.435-1.216 6.2 6.2 0 0 1 1.923-3.453.484.484 0 0 0-.646-.72", fill: "#fc0" }),
          h("path", { key: "bubble", d: "M18.17 8.471c-3.624.4-6.908 1.948-9.266 4.367-.938.956-1.7 2.032-2.262 3.182a11.08 11.08 0 0 0 .78 11.188c.64.968 1.693 2.178 2.654 3.037l-.435 3.423-.048.145c-.012.042-.012.09-.018.133l-.012.108.012.11a1.1 1.1 0 0 0 1.657.852h.018l.067-.049 1.04-.52 3.102-1.56a16 16 0 0 0 4.537.623c1.897.004 3.78-.323 5.564-.968a2.014 2.014 0 0 1-1.373-2.11 13.7 13.7 0 0 1-5.721.568l-.309-.042a14 14 0 0 1-2.056-.43 1.4 1.4 0 0 0-1.1.116l-.085.042-2.552 1.5-.109.066c-.06.036-.09.048-.12.048a.176.176 0 0 1-.164-.181l.097-.393.115-.43.181-.707.212-.787a1.07 1.07 0 0 0-.387-1.19 11.2 11.2 0 0 1-2.577-2.686 8.73 8.73 0 0 1-.629-8.818c.46-.92 1.065-1.773 1.815-2.54 1.935-1.997 4.657-3.267 7.669-3.593a14.3 14.3 0 0 1 3.132 0c2.994.344 5.704 1.633 7.627 3.617a10 10 0 0 1 1.796 2.551 8.7 8.7 0 0 1 .901 3.84c0 .14-.012.279-.018.412a2.015 2.015 0 0 1 2.48.29l.09.109a11 11 0 0 0-1.1-5.733 12.3 12.3 0 0 0-2.238-3.182 15.18 15.18 0 0 0-9.229-4.397 17 17 0 0 0-3.739-.01", fill: "#0082ef" }),
        ]);
      }

      if (id === "telegram") {
        return svg("0 0 24 24", [
          h("path", { key: "mark", fill: "#26A5E4", d: "M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" }),
        ]);
      }

      return svg("0 0 24 24", [
        h("circle", { key: "bg", cx: 12, cy: 12, r: 12, fill: "#8b949e" }),
      ]);
    }

    function Logo({ id, small }) {
      return h("div", { className: small ? "ima-logo sm" : "ima-logo", "data-brand": id, "aria-hidden": "true" }, h(BrandMark, { id }));
    }

    function isRasterQr(value) {
      return typeof value === "string" && (/^data:image\//i.test(value) || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value));
    }

    function qrSrc(pairing) {
      if (!pairing) return "";
      if (isRasterQr(pairing.qrImage)) return pairing.qrImage;
      const payload = pairing.qrUrl || pairing.qrImage;
      if (!payload) return "";
      return "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" + encodeURIComponent(payload);
    }

    function hintOf(ch) {
      if (ch.id === "weixin") return "请使用微信扫描二维码完成绑定";
      if (ch.id === "feishu") return "请使用飞书扫描二维码，将自动创建机器人";
      if (ch.id === "lark") return "请使用 Lark 扫描二维码完成配对";
      if (ch.id === "wecom") return "请使用企业微信扫描二维码，快捷绑定机器人";
      if (ch.id === "dingtalk") return "请使用钉钉扫描二维码，自动创建机器人";
      return "请使用对应 App 扫描二维码";
    }

    let openImSession = (id) => {
      try {
        if (window.__dshSessionsOpen) { window.__dshSessionsOpen(id); return true; }
      } catch { /* ignore */ }
      return false;
    };
    const openListedSession = (id, hostOpen) => {
      if (!id) return;
      if (String(id).startsWith("im:")) {
        api("/sessions/ensure", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: id }),
        }).then((data) => {
          if (!data.ok) { console.warn("[dsh-im-connect] 无法恢复会话", data.error || id); return; }
          const tryOpen = (left) => {
            if (openImSession(id) || left <= 0) return;
            setTimeout(() => tryOpen(left - 1), 80);
          };
          tryOpen(20);
        }).catch((error) => console.warn("[dsh-im-connect] 无法恢复会话", id, error));
        return;
      }
      if (typeof hostOpen === "function") hostOpen(id);
      else openImSession(id);
    };
    let channelSkin = "native";

    function BindModal({ ch, onClose, onConnected }) {
      const hasQr = ch.kind === "qr" || ch.kind === "qr-or-credentials";
      const hasManual = ch.kind === "credentials" || ch.kind === "qr-or-credentials";
      const [tab, setTab] = useState(hasQr ? "qr" : "manual");
      const [pairing, setPairing] = useState(null);
      const [draft, setDraft] = useState({});
      const [accessMode, setAccessMode] = useState(ch.accessMode === "open" ? "open" : "pair");
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const alive = useRef(true);

      const startQr = useCallback((refresh) => {
        if (!hasQr) return;
        setBusy(true);
        setError("");
        api(`/channels/${ch.id}/qr/${refresh ? "refresh" : "start"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ch.id === "dingtalk" ? { accessMode } : {}),
        }).then((data) => {
          if (!alive.current) return;
          if (!data.ok && !data.pairing) setError(data.error || "无法生成二维码");
          setPairing(data.pairing || null);
        }).catch(() => { if (alive.current) setError("无法生成二维码"); })
          .finally(() => { if (alive.current) setBusy(false); });
      }, [ch.id, hasQr, accessMode]);

      useEffect(() => {
        alive.current = true;
        if (tab === "qr") startQr(false);
        return () => { alive.current = false; };
      }, []);

      useEffect(() => {
        if (tab !== "qr") return undefined;
        const timer = setInterval(() => {
          api(`/channels/${ch.id}/qr/status`).then((data) => {
            if (!alive.current || !data.ok) return;
            setPairing(data.pairing);
            if (data.pairing && data.pairing.status === "success") {
              onConnected();
            }
          }).catch(() => undefined);
        }, 2000);
        return () => clearInterval(timer);
      }, [tab, ch.id, onConnected]);

      const close = () => {
        alive.current = false;
        if (hasQr) api(`/channels/${ch.id}/qr/cancel`, { method: "POST" }).catch(() => undefined);
        onClose();
      };

      const saveManual = () => {
        const config = { ...draft };
        if (ch.id === "dingtalk") config.accessMode = accessMode;
        setBusy(true);
        setError("");
        api(`/channels/${ch.id}/connect`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config }),
        }).then((data) => {
          if (!data.ok) setError(data.error || "保存失败");
          else onConnected();
        }).catch(() => setError("保存失败")).finally(() => setBusy(false));
      };

      const switchTab = (next) => {
        setTab(next);
        setError("");
        if (next === "qr") startQr(false);
        else api(`/channels/${ch.id}/qr/cancel`, { method: "POST" }).catch(() => undefined);
      };

      const status = pairing && pairing.status;
      const src = qrSrc(pairing);
      const remain = pairing && pairing.remainingSeconds;

      return h("div", { className: "ima-mask", onClick: close },
        h("div", { className: "ima-modal", onClick: (e) => e.stopPropagation() },
          h("div", { className: "ima-modal-h" },
            h("h2", null, "配置" + ch.label),
            h("button", { className: "ima-x", onClick: close, "aria-label": "关闭" }, "×"),
          ),
          hasQr && hasManual && h("div", { className: "ima-seg" },
            h("button", { className: tab === "qr" ? "on" : "", onClick: () => switchTab("qr") }, "快捷绑定（推荐）"),
            h("button", { className: tab === "manual" ? "on" : "", onClick: () => switchTab("manual") }, "手动配置"),
          ),
          error && h("div", { className: "ima-error" }, error),
          tab === "qr" && hasQr && (
            status === "success"
              ? h("div", { className: "ima-ok" }, "绑定成功，频道已连接")
              : h("div", { className: "ima-qrbox" },
                  h("p", { className: "ima-hint" }, (pairing && pairing.hint) || hintOf(ch)),
                  src
                    ? h("img", { src, alt: ch.label + " 绑定二维码" })
                    : h("div", { className: "ima-qrph" }, busy || status === "starting" ? "正在生成…" : (pairing && pairing.error) || "等待二维码"),
                  remain > 0 && h("p", { className: "ima-hint" }, "二维码 " + Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0") + " 后过期"),
                  status === "scanned" && h("p", { className: "ima-hint" }, "已扫码，请在手机上确认"),
                  (status === "expired" || status === "failed") && h("p", { className: "ima-error" }, (pairing && pairing.error) || "请重新生成二维码"),
                  ch.id === "dingtalk" && h("div", { className: "ima-radio" },
                    h("label", null,
                      h("input", { type: "radio", name: "am", checked: accessMode === "pair", onChange: () => setAccessMode("pair") }),
                      h("span", null, "配对模式", h("small", null, "仅批准过的用户可以驱动本机助手")),
                    ),
                    h("label", null,
                      h("input", { type: "radio", name: "am", checked: accessMode === "open", onChange: () => setAccessMode("open") }),
                      h("span", null, "开放模式", h("small", null, "该渠道消息默认放行，适合企业内部共用")),
                    ),
                  ),
                  h("button", { className: "ima-link", disabled: busy, onClick: () => startQr(true) }, "重新生成二维码"),
                )
          ),
          tab === "manual" && hasManual && h("div", null,
            ...ch.fields.map((f) => h("label", { key: f.key, className: "ima-field" },
              f.label,
              h("input", {
                type: f.secret ? "password" : "text",
                value: draft[f.key] || "",
                placeholder: f.label,
                onChange: (e) => setDraft({ ...draft, [f.key]: e.target.value }),
              }),
            )),
            ch.id === "dingtalk" && h("div", { className: "ima-radio" },
              h("label", null,
                h("input", { type: "radio", name: "am2", checked: accessMode === "pair", onChange: () => setAccessMode("pair") }),
                h("span", null, "配对模式", h("small", null, "仅批准过的用户可以驱动本机助手")),
              ),
              h("label", null,
                h("input", { type: "radio", name: "am2", checked: accessMode === "open", onChange: () => setAccessMode("open") }),
                h("span", null, "开放模式", h("small", null, "该渠道消息默认放行，适合企业内部共用")),
              ),
            ),
            h("div", { style: { display: "flex", justifyContent: "flex-end" } },
              h("button", { className: "ima-btn primary", disabled: busy, onClick: saveManual }, busy ? "保存中…" : "确认"),
            ),
          ),
        ),
      );
    }

    function ChannelCard({ ch, busy, onAction, onConfigure }) {
      const [menu, setMenu] = useState(false);
      const configuring = !ch.connected;
      const meta = configuring ? "未配置" : (ch.status && ch.status !== "未连接" ? ch.status : "已连接");
      const right = h("div", { className: "ima-actions" },
        configuring
          ? h("button", { className: "ima-btn", disabled: busy, onClick: onConfigure }, busy ? "接入中…" : "配置")
          : [
            h("button", { key: "more", className: "ima-more", "aria-label": ch.label + " 更多", onClick: () => setMenu(!menu) }, "…"),
            menu && h("div", { key: "menu", className: "ima-menu" },
              h("button", { onClick: () => { setMenu(false); onConfigure(); } }, "重新接入"),
              h("button", { onClick: () => { setMenu(false); onAction(ch.id, "disconnect"); } }, "断开"),
              h("button", { onClick: () => { setMenu(false); onAction(ch.id, "remove"); } }, "删除配置"),
            ),
            h("button", {
              key: "sw",
              className: ch.receiveEnabled ? "ima-switch" : "ima-switch off",
              role: "switch",
              "aria-checked": ch.receiveEnabled,
              "aria-label": "接收消息",
              onClick: () => onAction(ch.id, "receive", { receiveEnabled: !ch.receiveEnabled }),
            }, h("i")),
          ],
      );

      return h("div", { className: "ima-card", title: ch.description || ch.label },
        h("div", { className: "ima-card-main" },
          h("div", { className: "ima-name-row" },
            h(Logo, { id: ch.id }),
            h("span", { className: "ima-name" }, ch.label),
            ch.connected && h("span", { className: "ima-badge" }, "已连接"),
            h("span", { className: "ima-status" }, meta),
          ),
        ),
        right,
      );
    }


    const PERMISSIONS = [
      { value: "read-only", label: "Read Only" },
      { value: "workspace-write", label: "Workspace Write" },
      { value: "full-access", label: "Full access" },
    ];
    const DEFAULT_EFFORTS = [
      { id: "low", name: "Low" },
      { id: "medium", name: "Medium" },
      { id: "high", name: "High" },
    ];

    function FolderIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M5.196 1.571c.615 0 1.19.308 1.532.819l.471.708c.086.128.23.205.383.205h4.588A2.666 2.666 0 0 1 14.586 5.72v.907c.683.4 1.074 1.223.852 2.06l-1.053 3.971A2.666 2.666 0 0 1 12.05 14.453H2.917A2.416 2.416 0 0 1 .502 11.952V3.987A2.416 2.416 0 0 1 2.918 1.571h2.278Z", fill: "currentColor" }),
      );
    }

    function ShieldIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M8 1.25 14.1 3.15v4.25c0 3.55-2.18 6.15-6.1 7.5-3.92-1.35-6.1-3.95-6.1-7.5V3.15L8 1.25Z", stroke: "currentColor", strokeWidth: "1.4", strokeLinejoin: "round" }),
        h("path", { d: "m5.55 8.05 1.55 1.55 3.35-3.55", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }),
      );
    }

    function PlusIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", "aria-hidden": "true" },
        h("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }),
      );
    }

    function ChipMenu(props) {
      const root = useRef(null);
      useEffect(() => {
        if (!props.open) return undefined;
        const close = (event) => {
          if (root.current && root.current.contains(event.target)) return;
          props.onToggle(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
      }, [props.open]);
      return h("div", { className: "ima-chip" + (props.open ? " is-open" : ""), ref: root },
        h("button", {
          type: "button",
          className: "ima-chip-btn",
          "aria-label": props.ariaLabel,
          "aria-expanded": Boolean(props.open),
          onMouseDown: (event) => event.stopPropagation(),
          onClick: () => props.onToggle(!props.open),
        },
          props.icon,
          h("span", { className: "ima-chip-label" }, props.label),
          props.suffix && h("span", { className: "ima-chip-effort" }, props.suffix),
          h("em"),
        ),
        props.open && h("div", { className: "ima-chip-menu" + (props.align === "end" ? " is-end" : "") }, props.children),
      );
    }

    function ChipRow(props) {
      return h("button", {
        type: "button",
        className: "ima-chip-row" + (props.active ? " is-on" : "") + (props.kv ? " is-kv" : ""),
        onClick: props.onClick,
      },
        h("span", { className: "ima-chip-row-main" },
          props.icon,
          h("span", null, props.label),
        ),
        h("span", { className: "ima-chip-row-side" },
          props.hint && h("span", null, props.hint),
          props.active && !props.chevron && h("i", { className: "ima-chip-tick" }),
          props.chevron && h("i", { className: "ima-chip-next" }),
        ),
      );
    }

    function ComposerBar(props) {
      const items = typeof props.useWorkspaces === "function"
        ? (props.useWorkspaces((state) => (state && state.items) || []) || [])
        : [];
      const [providers, setProviders] = useState([]);
      const [provider, setProvider] = useState("");
      const [model, setModel] = useState("");
      const [effort, setEffort] = useState("");
      const [cwd, setCwd] = useState("");
      const [permission, setPermission] = useState("full-access");
      const [open, setOpen] = useState("");
      const [modelPane, setModelPane] = useState("root");
      const [hint, setHint] = useState("");
      const [adding, setAdding] = useState(false);
      const [addPath, setAddPath] = useState("");
      const [addBusy, setAddBusy] = useState(false);

      useEffect(() => {
        api("/assistant").then((data) => {
          if (!data.ok) { setHint(data.error || "无法加载全局配置"); return; }
          const list = data.providers || [];
          setProviders(list);
          const current = data.assistant || {};
          const nextProvider = current.provider || (list[0] && list[0].id) || "";
          const models = ((list.find((item) => item.id === nextProvider) || {}).models) || [];
          const nextModel = current.model || (models[0] && models[0].id) || "";
          const found = models.find((item) => item.id === nextModel) || models[0];
          setProvider(nextProvider);
          setModel(nextModel);
          setEffort(current.reasoningEffort || (found && found.reasoning && found.reasoning.defaultEffort) || "");
          setCwd(data.cwd || "");
          setPermission(data.permission || "full-access");
          if (!list.length) setHint("当前 Host 还没有可用模型，请先在网页里配置提供商");
        }).catch(() => setHint("无法加载全局配置"));
      }, []);

      const save = (body) => {
        api("/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }).then((data) => {
          if (!data.ok) setHint(data.error || "保存失败");
          else setHint("");
        }).catch(() => setHint("保存失败"));
      };

      const workspace = items.find((item) => item.path === cwd);
      const models = providers.flatMap((item) => (item.models || []).map((entry) => ({
        value: item.id + "::" + entry.id,
        provider: item.id,
        model: entry.id,
        label: entry.name || entry.id,
        reasoning: entry.reasoning,
      })));
      const currentModel = models.find((item) => item.provider === provider && item.model === model);
      const efforts = (currentModel && currentModel.reasoning && currentModel.reasoning.efforts && currentModel.reasoning.efforts.length)
        ? currentModel.reasoning.efforts.map((item) => ({ id: item.id, name: item.name || item.id }))
        : DEFAULT_EFFORTS;
      const effortLabel = (efforts.find((item) => item.id === effort) || {}).name || "";
      const perm = PERMISSIONS.find((item) => item.value === permission) || PERMISSIONS[2];

      const addWorkspace = (path) => {
        const next = (path || "").trim();
        if (!next) { setHint("请选择工作区目录"); return Promise.resolve(); }
        if (typeof props.createWorkspace !== "function") { setHint("当前 Host 无法新增工作区"); return Promise.resolve(); }
        setAddBusy(true);
        return Promise.resolve(props.createWorkspace({ path: next })).then((created) => {
          const cwdPath = (created && (created.path || created.cwd)) || next;
          setCwd(cwdPath);
          save({ cwd: cwdPath });
          setAdding(false);
          setAddPath("");
          setOpen("");
        }).catch((error) => {
          setHint((error && error.message) || "新增工作区失败");
        }).finally(() => setAddBusy(false));
      };

      const onAddWorkspace = () => {
        setOpen("");
        if (typeof props.pickDirectory === "function") {
          Promise.resolve(props.pickDirectory()).then((picked) => {
            if (!picked) return;
            return addWorkspace(picked);
          }).catch(() => {
            setAdding(true);
            setAddPath("");
          });
          return;
        }
        setAdding(true);
        setAddPath("");
      };

      return h("div", { className: "ima-composer-wrap" },
        h("div", { className: "ima-composer", "aria-label": "全局会话配置" },
          h("div", { className: "ima-composer-left" },
            h(ChipMenu, {
              open: open === "ws",
              onToggle: (next) => setOpen(next ? "ws" : ""),
              icon: h(FolderIcon),
              label: (workspace && (workspace.title || workspace.path)) || cwd || "选择项目",
              ariaLabel: "项目",
            },
              items.length === 0 && h("div", { className: "ima-chip-empty" }, "暂无工作区"),
              ...items.map((item) => h(ChipRow, {
                key: item.path,
                icon: h(FolderIcon),
                label: item.title || item.path,
                active: item.path === cwd,
                onClick: () => { setCwd(item.path); save({ cwd: item.path }); setOpen(""); },
              })),
              h("div", { className: "ima-chip-split" }),
              h(ChipRow, {
                icon: h(PlusIcon),
                label: "添加工作区…",
                onClick: onAddWorkspace,
              }),
            ),
            h(ChipMenu, {
              open: open === "perm",
              onToggle: (next) => setOpen(next ? "perm" : ""),
              icon: h(ShieldIcon),
              label: perm.label,
              ariaLabel: "权限",
            },
              ...PERMISSIONS.map((item) => h(ChipRow, {
                key: item.value,
                icon: h(ShieldIcon),
                label: item.label,
                active: item.value === permission,
                onClick: () => { setPermission(item.value); save({ permission: item.value }); setOpen(""); },
              })),
            ),
          ),
          h("div", { className: "ima-composer-right" },
            h(ChipMenu, {
              open: open === "model",
              onToggle: (next) => {
                setOpen(next ? "model" : "");
                if (next) setModelPane("root");
              },
              align: "end",
              label: (currentModel && currentModel.label) || "选择模型",
              suffix: effortLabel,
              ariaLabel: "模型",
            },
              modelPane === "root" && [
                h(ChipRow, {
                  key: "model",
                  kv: true,
                  label: "Model",
                  hint: (currentModel && currentModel.label) || "未选择",
                  chevron: true,
                  onClick: () => setModelPane("model"),
                }),
                h(ChipRow, {
                  key: "effort",
                  kv: true,
                  label: "Effort",
                  hint: effortLabel || "Default",
                  chevron: true,
                  onClick: () => setModelPane("effort"),
                }),
              ],
              modelPane === "model" && (
                models.length === 0
                  ? h("div", { className: "ima-chip-empty" }, "暂无模型")
                  : models.map((item) => h(ChipRow, {
                      key: item.value,
                      label: item.label,
                      active: item.provider === provider && item.model === model,
                      onClick: () => {
                        const nextEffort = (item.reasoning && item.reasoning.defaultEffort) || effort || "high";
                        setProvider(item.provider);
                        setModel(item.model);
                        setEffort(nextEffort);
                        save({ provider: item.provider, model: item.model, reasoningEffort: nextEffort });
                        setOpen("");
                      },
                    }))
              ),
              modelPane === "effort" && efforts.map((item) => h(ChipRow, {
                key: item.id,
                label: item.name,
                active: item.id === effort,
                onClick: () => {
                  setEffort(item.id);
                  if (provider && model) save({ provider, model, reasoningEffort: item.id });
                  setOpen("");
                },
              })),
            ),
          ),
        ),
        adding && h("div", { className: "ima-chip-dialog" },
          h("strong", null, "添加工作区…"),
          h("input", {
            value: addPath,
            placeholder: "工作区路径",
            "aria-label": "工作区路径",
            onChange: (event) => setAddPath(event.target.value),
          }),
          h("div", { className: "ima-chip-dialog-actions" },
            h("button", { className: "ima-btn", onClick: () => { setAdding(false); setAddPath(""); } }, "取消"),
            h("button", {
              className: "ima-btn primary",
              disabled: addBusy || !addPath.trim(),
              onClick: () => addWorkspace(addPath),
            }, addBusy ? "添加中…" : "确认"),
          ),
        ),
        hint && h("div", { className: "ima-composer-hint" }, hint),
      );
    }

    function SettingsPage(props) {
      const [channels, setChannels] = useState(null);
      const [pending, setPending] = useState([]);
      const [error, setError] = useState("");
      const [busy, setBusy] = useState({});
      const [editing, setEditing] = useState(null);

      const refresh = useCallback(() => {
        api("/channels").then((data) => {
          if (data.ok) { setChannels(data.channels); setPending(data.pending || []); setError(""); }
          else setError(data.error || "加载失败");
        }).catch(() => setError("无法连接本机 IM 助理接口"));
      }, []);

      useEffect(() => { ensureStyle(); refresh(); }, [refresh]);
      useEffect(() => {
        if (!(pending || []).length) return;
        const timer = setInterval(refresh, 4000);
        return () => clearInterval(timer);
      }, [pending, refresh]);

      const onAction = (id, action, body) => {
        setBusy((prev) => ({ ...prev, [id]: true }));
        api(`/channels/${id}/${action}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body || {}),
        }).then((data) => {
          if (!data.ok) setError(data.error || "操作失败");
          else setError("");
          refresh();
        }).catch(() => setError("请求失败")).finally(() => {
          setBusy((prev) => ({ ...prev, [id]: false }));
        });
      };

      return h("section", { className: "ima-page", "aria-label": "IM助理" },
        h("header", { className: "ima-head" },
          h("div", null,
            h("h2", { className: "ima-title" }, "IM 频道"),
            h("p", { className: "ima-sub" }, "配置 IM 频道，让本机助手接收来自钉钉、飞书等平台的消息。频道配置仅保存在本机。"),
          ),
        ),
        h(ComposerBar, { useWorkspaces: props.useWorkspaces, createWorkspace: props.createWorkspace, pickDirectory: props.pickDirectory }),
        error && h("div", { className: "ima-error" }, error),
        pending && pending.length > 0 && h("div", { className: "ima-pending" },
          h("div", null, "有访问请求（仅在关闭全局放行时需要批准）"),
          ...pending.map((p) => h("div", { key: p.channelId + p.userId, className: "ima-pending-row" },
            h("span", { style: { flex: 1 } }, (p.username || p.userId) + " · " + p.channelId),
            h("button", { className: "ima-btn", onClick: () => onAction(p.channelId, "approve", { userId: p.userId }) }, "批准"),
            h("button", { className: "ima-btn", onClick: () => onAction(p.channelId, "deny", { userId: p.userId }) }, "拒绝"),
          )),
        ),
        channels == null
          ? h("div", { className: "ima-empty" }, "加载中…")
          : h("div", { className: "ima-list" },
              ...channels.map((ch) => h(ChannelCard, {
                key: ch.id,
                ch,
                busy: busy[ch.id],
                onAction,
                onConfigure: () => setEditing(ch.id),
              })),
            ),
        editing && h(BindModal, {
          ch: (channels || []).find((item) => item.id === editing) || { id: editing, label: editing, kind: "qr", fields: [] },
          onClose: () => setEditing(null),
          onConnected: () => { setEditing(null); refresh(); },
        }),
      );
    }

    const WB_CSS = `.dcu-wb,.ima-native{display:flex;flex:1;min-height:0;flex-direction:column;padding:0;padding-right:var(--dsh-sidebar-inline-padding,12px);box-sizing:border-box;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit}.ima-n-head{flex:none;display:flex;align-items:center;height:36px;padding-left:4px;margin:2px 0 4px;color:var(--dsw-alias-label-tertiary,#81858C);font:14px/20px inherit}.ima-native-tree,.dcu-wb-tree{padding:0 0 16px 4px;scrollbar-gutter:stable}.ima-native-project+.ima-native-project,.dcu-wb-project+.dcu-wb-project{margin-top:4px}.ima-native-project>*+*,.dcu-wb-project>*+*{margin-top:2px}
.dcu-wb *,.ima-native *{box-sizing:border-box}
.dcu-wb-tree,.ima-native-tree{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px;user-select:none}
.dcu-wb-project-head,.ima-native-head,.dcu-wb-session,.ima-native-session{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:8px;padding:0 8px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
.dcu-wb-project-head,.ima-native-head{height:34px}
.dcu-wb-project-head:hover,.dcu-wb-session:hover,.dcu-wb-session.dcu-wb-selected,.ima-native-head:hover,.ima-native-session:hover,.ima-native-session.on{background:var(--dsw-alias-interactive-bg-hover,var(--dcu-sidebar-hover,rgba(255,255,255,.06)))}
.dcu-wb-folder,.ima-native-folder{display:grid;place-items:center;flex:none;width:16px;height:20px}
.dcu-wb-project-title,.dcu-wb-session-title,.ima-native-title,.ima-n-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:400}
.dcu-wb-session-title,.ima-native-session .ima-native-title{font-weight:400}
.dcu-wb-session,.ima-native-session{position:relative;min-height:32px;padding-left:32px}
.dcu-wb-actions,.ima-native-actions{display:none;align-items:center;flex:none}
.dcu-wb-session:hover .dcu-wb-actions,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-actions,.ima-native-session:hover .ima-native-actions,.ima-native-session.menu-on .ima-native-actions{display:flex}
.dcu-wb-more,.ima-native-more{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dsw-alias-label-secondary,var(--ima-muted));cursor:pointer}
.dcu-wb-empty,.ima-native-empty{padding:14px 8px;color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:13px}
.ima-sess-menu{position:absolute;right:8px;top:30px;min-width:132px;padding:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));border-radius:10px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));z-index:8}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:7px 10px;border-radius:6px;cursor:pointer;font:13px/18px inherit}
.ima-sess-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-sess-menu button.danger{color:var(--dsw-alias-state-error-primary,var(--ima-danger))}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));background:transparent;color:inherit;font:inherit}
.ima-n-row,.ima-n-sess{display:flex;align-items:center;gap:6px;border-radius:8px;padding:0 8px;cursor:pointer;user-select:none;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit;text-align:left;box-sizing:border-box}
.ima-n-row{height:34px}
.ima-n-sess{height:32px;gap:0;position:relative}
.ima-n-row:hover,.ima-n-sess:hover,.ima-n-sess.on,.ima-n-row.menu-on,.ima-n-sess.menu-on{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-slot{flex:none;width:16px;height:20px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}.ima-run-dot{flex:none;color:var(--dsw-static-deepseek-450,#4c8dff)}.ima-run-dot-cell{fill:currentColor;opacity:.15;animation:ima-run-chase 1s infinite}@keyframes ima-run-chase{0%,12.4%{opacity:1}12.5%,24.9%{opacity:.6}25%,37.4%{opacity:.35}37.5%,100%{opacity:.15}}
.ima-n-row .ima-n-chevron{display:none;color:var(--dsw-alias-label-caption,#ADB2B8)}
.ima-n-row:hover .ima-n-chevron{display:inline-flex}
.ima-n-row:hover .ima-n-folder{display:none}
.ima-n-arrow{transition:transform .15s ease}
.ima-n-arrow.open{transform:rotate(90deg)}
.ima-n-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:400}
.ima-n-sess .ima-n-title{margin:0 6px 0 4px}
.ima-n-time{flex:none;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-acts{flex:none;display:none;align-items:center;gap:12px}
.ima-n-row:hover .ima-n-acts,.ima-n-sess:hover .ima-n-acts,.ima-n-row.menu-on .ima-n-acts,.ima-n-sess.menu-on .ima-n-acts{display:inline-flex}
.ima-n-sess:hover .ima-n-time,.ima-n-sess.menu-on .ima-n-time{display:none}
.ima-n-ico{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;border-radius:4px;padding:0;background:transparent;cursor:pointer;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-ico:hover{color:var(--dsw-alias-label-primary,var(--ima-text))}
.ima-n-menu{position:absolute;right:8px;top:calc(100% + 4px);z-index:1100;min-width:218px;max-width:360px;box-sizing:border-box;padding:4px;display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-inverted,rgba(255,255,255,.12));border-radius:12px;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2));box-shadow:var(--dsw-shadow-lv3,0 8px 24px rgba(0,0,0,.36))}
.ima-n-menu button{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:0;border-radius:10px;background:transparent;cursor:pointer;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,var(--ima-text));text-align:left}
.ima-n-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-n-mi{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#81858C)}
.ima-n-menu button.danger{color:var(--dsw-alias-state-error-primary,#f85149)}
.ima-n-menu button.danger .ima-n-mi{color:inherit}
.ima-n-menu button.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(248,81,73,.12))}`;

    function NativeSvg(viewBox, size, children) {
      return h("svg", { viewBox, width: size, height: size, fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true" }, children);
    }
    function NativePath(d, extra) {
      return h("path", Object.assign({ d, fill: "currentColor" }, extra || {}));
    }
    function IconEllipsis() {
      return NativeSvg("0 0 16 16", 16, [
        NativePath("M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z"),
        NativePath("M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z"),
        NativePath("M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z"),
      ]);
    }
    function IconEdit() {
      return NativeSvg("0 0 16 16", 16, NativePath("M9.941 1.349a2.54 2.54 0 0 1 2.473 0c.292.171.555.442.897.784.341.341.612.604.783.896a2.54 2.54 0 0 1 0 2.473c-.171.292-.442.555-.784.896L6.659 13.05c-.378.378-.652.661-.994.86-.341.199-.722.298-1.238.44l-1.183.326c-.469.13-.899.25-1.243.292-.349.043-.821.033-1.19-.336-.369-.369-.379-.841-.336-1.19.042-.344.163-.774.292-1.243l.326-1.183c.143-.516.242-.897.44-1.238.199-.342.482-.615.86-.994l6.652-6.651c.341-.342.604-.613.896-.784Zm1.759 1.222a1.16 1.16 0 0 0-1.045 0c-.095.056-.206.158-.61.562L9.456 3.721l2.265 2.265.589-.588c.404-.403.507-.515.562-.61a1.16 1.16 0 0 0 0-1.045c-.056-.095-.158-.206-.562-.61-.404-.404-.515-.507-.61-.562ZM3.394 9.784c-.429.429-.551.56-.637.706-.085.147-.138.318-.3.903l-.326 1.183c-.129.468-.209.766-.242.978.212-.033.51-.112.979-.241l1.183-.327c.585-.161.756-.214.902-.3.147-.085.277-.208.706-.636l5.062-5.063-2.265-2.265-5.062 5.062Z"));
    }
    function IconBranch() {
      return NativeSvg("0 0 16 16", 16, NativePath("M13.076 1.372c1.008 0 1.826.819 1.826 1.827s-.818 1.826-1.826 1.826c-.78 0-1.444-.488-1.706-1.175H4.355c.439.415.804.915 1.062 1.485l1.69 3.733a4.83 4.83 0 0 0 4.312 2.97c.29-.626.923-1.061 1.658-1.061 1.008 0 1.826.818 1.826 1.826s-.818 1.826-1.826 1.826c-.823 0-1.519-.545-1.747-1.293a6.34 6.34 0 0 1-5.406-3.731L4.232 5.871A3.83 3.83 0 0 0 1.098 3.85V2.549h10.272c.263-.687.927-1.177 1.706-1.177Zm0 10.904a.525.525 0 1 0 0 1.052.525.525 0 0 0 0-1.052Zm0-9.603a.526.526 0 1 0 0 1.053.526.526 0 0 0 0-1.053Z", { fillRule: "evenodd", clipRule: "evenodd" }));
    }
    function IconArchive() {
      return NativeSvg("0 0 20 20", 16, [
        NativePath("M15.866 2.06a2.526 2.526 0 0 1 2.525 2.525v.902c0 .54-.172 1.04-.461 1.45l.009.085v5.866c0 .746 0 1.35-.039 1.837-.035.434-.106.825-.262 1.189l-.072.154a3.03 3.03 0 0 1-1.262 1.366l-.236.132c-.408.208-.848.294-1.344.334-.488.04-1.091.04-1.837.04H7.111c-.746 0-1.35 0-1.837-.04-.434-.035-.825-.105-1.189-.261l-.154-.073a3.03 3.03 0 0 1-1.366-1.262l-.132-.235a2.53 2.53 0 0 1-.335-1.344c-.04-.487-.039-1.091-.039-1.837V7.022c0-.029.005-.057.008-.086A2.48 2.48 0 0 1 1.609 5.487v-.902A2.526 2.526 0 0 1 4.134 2.06h11.732Zm.632 5.87a2.48 2.48 0 0 1-.632.083H4.134a2.48 2.48 0 0 1-.634-.083v4.959c0 .77 0 1.304.034 1.72.034.406.095.635.182.806l.076.137c.191.311.465.565.792.731l.141.061c.156.055.361.096.666.121.415.034.95.035 1.72.035h5.775c.77 0 1.305 0 1.72-.035.407-.033.636-.095.807-.182l.138-.077c.311-.191.565-.464.731-.791l.06-.142c.056-.155.097-.36.122-.665.034-.415.034-.95.034-1.72V7.93ZM4.134 3.5a1.086 1.086 0 0 0-1.085 1.085v.902c0 .599.486 1.085 1.085 1.085h11.732c.599 0 1.085-.486 1.085-1.085v-.902A1.086 1.086 0 0 0 15.866 3.5H4.134Z", { fillRule: "evenodd", clipRule: "evenodd" }),
        NativePath("M12.796 12.566v-1.483H7.205v1.483h5.591Z"),
      ]);
    }
    function IconTrash() {
      return NativeSvg("0 0 16 16", 16, NativePath("M14.478 4.841 14.214 10.115c-.104 2.072-.147 2.896-.827 3.846a3.53 3.53 0 0 1-1.044.993c-.519.333-1.101.478-1.784.546-.671.067-1.509.066-2.559.066s-1.887.001-2.558-.066c-.683-.068-1.266-.213-1.784-.546a3.53 3.53 0 0 1-1.044-.993c-.681-.95-.724-1.774-.828-3.846L1.522 4.841l1.368-.068.263 5.273c.109 2.176.171 2.556.573 3.117a2.16 2.16 0 0 0 .673.64c.263.169.603.277 1.179.334.587.059 1.345.06 2.422.06s1.834-.001 2.422-.06c.575-.057.916-.165 1.179-.335.262-.168.49-.386.672-.64.402-.56.464-.94.573-3.116l.263-5.273 1.369.068ZM5.43 6.228h1.37v5.163H5.43V6.228Zm3.77 0h1.37v5.163H9.2V6.228ZM8.536.434c.644 0 1.116-.007 1.56.137.14.045.276.101.406.168.416.212.745.552 1.2 1.007l.796.795h2.876v1.37H.626V2.541h2.876l.796-.795c.456-.455.784-.795 1.2-1.007.13-.067.266-.123.405-.168C6.348.427 6.82.434 7.464.434h1.072Zm-1.072 1.37c-.732 0-.948.008-1.138.07a2.2 2.2 0 0 0-.206.085c-.156.08-.296.204-.678.583h5.117c-.382-.379-.522-.503-.679-.583a2.2 2.2 0 0 0-.205-.085c-.191-.062-.406-.07-1.138-.07H7.464Z"));
    }
    function IconFolderClose() {
      return NativeSvg("0 0 16 16", 16, NativePath("M6.556 3.377 6.007 3.725l.549-.348ZM14.5 12.342h.65V6.397h-.65-.65v5.945h.65Zm-1.674-7.618v-.65H8.023v.65h4.803Zm-5.746-.519.55-.347-.525-.828-.549.348-.549.348.525.828.55-.348ZM5.613 2.858h0H3.174v.65h2.439v-.65ZM3 4.532v8.46h.65V4.532H3Zm11.326 9.484v-.65H4.674v.65h9.652ZM3 12.342h-.65A2.324 2.324 0 0 0 4.674 14.666v-1.3A.824.824 0 0 1 3.65 12.342H3Zm.174-9.484h0A2.324 2.324 0 0 0 2.35 4.532h1.3A.824.824 0 0 1 4.674 3.508h0V2.858Zm3.382.519.549-.348A1.824 1.824 0 0 0 5.613 2.208v1.3c.16 0 .308.082.394.217l.549-.348Zm1.467 1.347h0c-.16 0-.308-.082-.393-.216l-.55.347-.549.348A1.824 1.824 0 0 0 8.023 5.374v-1.3ZM14.5 6.397h.65A2.324 2.324 0 0 0 12.826 4.073v1.3c.565 0 1.024.458 1.024 1.024h.65Zm0 5.945h-.65c0 .565-.458 1.024-1.024 1.024v1.3A2.324 2.324 0 0 0 15.15 12.342h-.65Z"));
    }
    function IconFolderOpen() {
      return NativeSvg("0 0 16 16", 16, NativePath("M5.196 1.571c.615 0 1.19.308 1.532.819l.471.708c.086.128.23.205.383.205h4.588A2.666 2.666 0 0 1 14.586 5.72v.907c.683.4 1.074 1.223.852 2.06l-1.053 3.971A2.666 2.666 0 0 1 12.05 14.453H2.917A2.416 2.416 0 0 1 .502 11.952V3.987A2.416 2.416 0 0 1 2.918 1.571h2.278Zm-1.417 6.185c-.469 0-.88.316-1.001.77l-.862 3.247c-.174.657.322 1.301 1.001 1.301H12.05c.469 0 .88-.316 1.001-.77l1.053-3.97c.078-.291-.142-.577-.444-.577H3.779Zm-.861-4.804c-.572 0-1.035.464-1.035 1.035v3.307a2.67 2.67 0 0 1 1.896-.919h9.426V5.72c0-.572-.464-1.035-1.035-1.035H7.582c-.615 0-1.19-.309-1.531-.82L5.579 3.156a.666.666 0 0 0-.383-.204H2.918Z"));
    }
    function IconChevron() {
      return NativeSvg("0 0 14 14", 14, NativePath("M4.25 2.828v8.344c0 .49.592.735.939.389l4.172-4.172a.55.55 0 0 0 0-.778L5.189 2.439c-.347-.347-.939-.101-.939.389Z"));
    }
    function MoreIcon() {
      return h(IconEllipsis);
    }
    const RUN_CELLS = [[0,0],[4,0],[8,0],[8,4],[8,8],[4,8],[0,8],[0,4]];
    function RunningStateDot() {
      return h("svg", { className: "ima-run-dot", width: 10, height: 10, viewBox: "0 0 10 10", shapeRendering: "crispEdges", "aria-hidden": "true" },
        RUN_CELLS.map(function (cell, index) {
          return h("rect", { key: cell[0] + "-" + cell[1], className: "ima-run-dot-cell", x: cell[0], y: cell[1], width: "2", height: "2", style: { animationDelay: ((index - RUN_CELLS.length) * 125) + "ms" } });
        })
      );
    }
    function relativeTime(value) {
      const ts = Date.parse(value || "");
      if (!Number.isFinite(ts)) return "";
      const delta = Math.max(0, Date.now() - ts);
      const min = Math.floor(delta / 60000);
      if (min < 1) return "刚刚";
      if (min < 60) return min + "分钟";
      const hour = Math.floor(min / 60);
      if (hour < 24) return hour + "小时";
      return Math.floor(hour / 24) + "天";
    }


    function ChannelSessionRow({ sess, selected, onOpen, onChanged, skin, sessionActions, sessionById }) {
      const [menu, setMenu] = useState(false);
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState(sess.title || sess.chatId || "");
      const title = sess.title || sess.chatId;
      const native = skin !== "codex";
      const rowClass = native
        ? ("ima-native-session" + (selected ? " on" : "") + (menu ? " menu-on" : ""))
        : ("dcu-wb-session" + (selected ? " dcu-wb-selected" : "") + (menu ? " dcu-wb-menu-open" : ""));
      const syncList = (groups) => { if (groups) onChanged(groups); };
      const run = (action, extra) => {
        setMenu(false);
        if (action === "copy-title") { try { navigator.clipboard.writeText(title); } catch { /* ignore */ } return; }
        if (action === "copy-id") { try { navigator.clipboard.writeText(sess.sessionId); } catch { /* ignore */ } return; }
        if (action === "copy-link") {
          try { navigator.clipboard.writeText(location.origin + "/?session=" + encodeURIComponent(sess.sessionId)); } catch { /* ignore */ }
          return;
        }
        const acts = sessionActions || {};
        const afterHost = () => api("/sessions/" + (action === "archive" || action === "delete" || action === "fork" ? "remove" : action), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ sessionId: sess.sessionId }, extra || {})),
        }).then((data) => { if (data.ok) syncList(data.groups); }).catch(() => undefined);
        if (action === "rename" && typeof acts.renameSession === "function") {
          Promise.resolve(acts.renameSession(sess.sessionId, (extra && extra.title) || title)).then(afterHost).catch(afterHost);
          return;
        }
        if (action === "archive") {
          if (typeof acts.archiveSession === "function") {
            Promise.resolve(acts.archiveSession(sess.sessionId)).then(afterHost).catch(afterHost);
          } else {
            afterHost();
          }
          return;
        }
        if ((action === "delete" || action === "remove") && typeof acts.deleteSession === "function") {
          Promise.resolve(acts.deleteSession(sess.sessionId)).then(() => afterHost()).catch(() => afterHost());
          return;
        }
        if (action === "fork" && typeof acts.forkSession === "function") {
          Promise.resolve(acts.forkSession(sess.sessionId)).catch(() => undefined);
          return;
        }
        const localAction = action === "delete" ? "remove" : action;
        api("/sessions/" + localAction, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(Object.assign({ sessionId: sess.sessionId }, extra || {})),
        }).then((data) => { if (data.ok) syncList(data.groups); }).catch(() => undefined);
      };
      if (renaming) {
        return h("div", { className: rowClass },
          h("input", {
            className: "ima-rename",
            value: draft,
            autoFocus: true,
            "aria-label": "重命名会话",
            onChange: (e) => setDraft(e.target.value),
            onClick: (e) => e.stopPropagation(),
            onKeyDown: (e) => {
              if (e.key === "Enter") { e.preventDefault(); setRenaming(false); run("rename", { title: draft.trim() || title }); }
              if (e.key === "Escape") { e.preventDefault(); setRenaming(false); setDraft(title); }
            },
            onBlur: () => { setRenaming(false); if (draft.trim() && draft.trim() !== title) run("rename", { title: draft.trim() }); },
          }),
        );
      }
      const menuItems = [
        { id: "rename", label: "重命名", icon: h(IconEdit), go: () => { setRenaming(true); } },
        { id: "fork", label: "分叉会话", icon: h(IconBranch), go: () => run("fork") },
        { id: "archive", label: "归档会话", icon: h(IconArchive), go: () => run("archive") },
        { id: "delete", label: "删除会话", icon: h(IconTrash), danger: true, go: () => run("delete") },
      ];
      return h("div", {
        className: native ? ("ima-n-sess" + (selected ? " on" : "") + (menu ? " menu-on" : "")) : rowClass,
        role: "treeitem",
        tabIndex: 0,
        "aria-selected": selected,
        onClick: () => onOpen(sess.sessionId),
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(sess.sessionId); } },
        onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); setMenu(!menu); },
      },
        native && h("span", { className: "ima-n-slot" }, (sess.running || (sessionById && sessionById[sess.sessionId] && sessionById[sess.sessionId].running)) ? h(RunningStateDot) : null),
        h("span", { className: native ? "ima-n-title" : "dcu-wb-session-title" }, title),
        native && h("span", { className: "ima-n-time" }, relativeTime(sess.updatedAt)),
        h("span", { className: native ? "ima-n-acts" : "dcu-wb-actions" },
          h("button", {
            type: "button",
            className: native ? "ima-n-ico" : "dcu-wb-more",
            "aria-label": title + " 更多",
            onClick: (e) => { e.stopPropagation(); setMenu(!menu); },
          }, native ? h(IconEllipsis) : h(MoreIcon)),
        ),
        menu && h("div", { className: native ? "ima-n-menu" : "ima-sess-menu", onClick: (e) => e.stopPropagation() },
          ...menuItems.map((item) => h("button", {
            key: item.id,
            type: "button",
            className: item.danger ? "danger" : undefined,
            onClick: () => { setMenu(false); item.go(); },
          }, native && h("span", { className: "ima-n-mi" }, item.icon), item.label)),
        ),
      );
    }

    function ChannelRail(props) {
      if (typeof props.useSessions === "function" || typeof props.useWorkspaces === "function") return h(ChannelRailWithSessions, props);
      return h(ChannelRailView, props);
    }

    function ChannelRailWithSessions(props) {
      const selectedId = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.current) || null)
        : (props.selectedId || null);
      const archivedIds = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => (state && state.archivedSessionIds) || [])
        : (props.archivedIds || []);
      const sessionById = typeof props.useSessions === "function"
        ? props.useSessions((state) => (state && state.byId) || {})
        : {};
      return h(ChannelRailView, Object.assign({}, props, {
        selectedId: selectedId || props.selectedId || null,
        archivedIds,
        sessionById,
      }));
    }

    function ChannelRailView(props) {
      const [groups, setGroups] = useState([]);
      const [folded, setFolded] = useState({});
      const [error, setError] = useState("");
      const selectedId = props.selectedId;
      const archived = new Set(props.archivedIds || []);
      const skin = props.skin || channelSkin;
      const native = skin !== "codex";
      const open = (id) => openListedSession(id, props.openSession || props.open);
      useEffect(() => {
        ensureStyle();
        const load = () => api("/channels").then((data) => {
          if (data.ok) { setGroups(data.groups || []); setError(""); }
          else setError(data.error || "加载失败");
        }).catch(() => setError("无法连接本机 IM 助理接口"));
        load();
        const timer = setInterval(load, 4000);
        return () => clearInterval(timer);
      }, []);
      return h("div", { className: native ? "ima-native ima-rail" : "dcu-wb ima-rail" },
        h("style", null, WB_CSS),
        h("div", { className: native ? "ima-native-tree" : "dcu-wb-tree", role: "tree" },
          error && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, error),
          !error && groups.length === 0 && h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, "还没有频道会话。先在设置 → IM助理 里连接渠道，并给机器人发一条消息。"),
          ...groups.map((g) => {
            const visible = (g.sessions || []).filter((sess) => !archived.has(sess.sessionId));
            if (!visible.length) return null;
            const expanded = !folded[g.id];
            return h("div", { key: g.id, className: native ? "ima-native-project" : "dcu-wb-project" },
            h("button", {
              className: native ? "ima-n-row" : "dcu-wb-project-head",
              type: "button",
              role: "treeitem",
              "aria-expanded": expanded,
              onClick: () => setFolded({ ...folded, [g.id]: !folded[g.id] }),
            },
              native
                ? [
                  h("span", { key: "folder", className: "ima-n-slot ima-n-folder" }, expanded ? h(IconFolderOpen) : h(IconFolderClose)),
                  h("span", { key: "chev", className: "ima-n-slot ima-n-chevron" }, h("span", { className: expanded ? "ima-n-arrow open" : "ima-n-arrow" }, h(IconChevron))),
                  h("span", { key: "title", className: "ima-n-title" }, g.label),
                ]
                : [
                  h("span", { key: "folder", className: "dcu-wb-folder" }, h(Logo, { id: g.id, small: true })),
                  h("span", { key: "title", className: "dcu-wb-project-title" }, g.label),
                ],
            ),
            !folded[g.id] && (visible.length
              ? visible.map((sess) => h(ChannelSessionRow, {
                key: sess.sessionId,
                sess,
                selected: selectedId === sess.sessionId,
                sessionById: props.sessionById,
                onOpen: open,
                onChanged: (next) => setGroups(next),
                skin,
                sessionActions: {
                  renameSession: props.renameSession,
                  archiveSession: props.archiveSession,
                  deleteSession: props.deleteSession,
                  forkSession: props.forkSession,
                  openPath: props.openPath,
                },
              }))
              : h("div", { className: native ? "ima-native-empty" : "dcu-wb-empty" }, "暂无会话")),
          );
          }),
        ),
      );
    }

    function isTaskSessionItem(item) {
      if (!item) return false;
      if (item.blank) return false;
      if (item.origin === "im" || item.origin === "subagent") return false;
      return !String(item.id || "").startsWith("im:");
    }

    function TaskList(props) {
      if (typeof props.useSessions === "function") return h(TaskListWithSessions, props);
      return h(TaskListView, { groups: [], current: null, openSession: props.openSession });
    }

    function TaskListWithSessions(props) {
      const snap = props.useSessions((state) => state || { ids: [], byId: {}, current: null });
      const workspaces = typeof props.useWorkspaces === "function"
        ? props.useWorkspaces((state) => state || { items: [], archivedSessionIds: [] })
        : { items: [], archivedSessionIds: [] };
      const archived = new Set(workspaces.archivedSessionIds || []);
      const assigned = new Set();
      const groups = [];
      for (const ws of workspaces.items || []) {
        const sessions = (ws.sessionIds || [])
          .map((id) => snap.byId[id])
          .filter((item) => isTaskSessionItem(item) && !archived.has(item.id));
        sessions.forEach((item) => assigned.add(item.id));
        if (sessions.length) {
          groups.push({ id: ws.workspaceId || ws.id, label: ws.title || ws.path || "工作区", sessions });
        }
      }
      const ungrouped = (snap.ids || [])
        .map((id) => snap.byId[id])
        .filter((item) => item && !assigned.has(item.id) && isTaskSessionItem(item) && !archived.has(item.id));
      if (ungrouped.length) groups.push({ id: "", label: "未分组", sessions: ungrouped });
      return h(TaskListView, { groups, current: snap.current, openSession: props.openSession });
    }

    function TaskListView({ groups, current, openSession }) {
      if (!groups.length) return h("div", { className: "ima-empty" }, "暂无网页任务");
      return h("div", { className: "ima-native ima-rail" },
        h("div", { className: "ima-native-tree" },
          ...groups.map((group) => h("div", { key: group.id || "ungrouped", className: "ima-native-project" },
            h("div", { className: "ima-native-head" },
              h("span", { className: "ima-native-title" }, group.label),
            ),
            ...group.sessions.map((item) => h("div", {
              key: item.id,
              className: current === item.id ? "ima-native-session on" : "ima-native-session",
              role: "treeitem",
              tabIndex: 0,
              onClick: () => openSession && openSession(item.id),
              onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSession && openSession(item.id); } },
            }, h("span", { className: "ima-native-title" }, item.title || item.id))),
          )),
        ),
      );
    }

    function filterSessionsByIm(state, keepIm) {
      const src = state || { ids: [], byId: {}, current: null };
      const ids = (src.ids || []).filter((id) => String(id).startsWith("im:") === keepIm);
      const byId = {};
      for (const id of ids) {
        if (src.byId && src.byId[id]) byId[id] = src.byId[id];
      }
      return Object.assign({}, src, { ids, byId });
    }

    function filterTaskSessions(state) {
      return filterSessionsByIm(state, false);
    }

    function filterChannelSessions(state) {
      return filterSessionsByIm(state, true);
    }

    function createNativeTabRegistry(officialTree) {
      const tabs = new Map();
      const sessionFilters = [];
      const listeners = new Set();
      let cachedTabs = [];
      const rebuild = () => { cachedTabs = [...tabs.values()].sort((a, b) => (a.order || 0) - (b.order || 0)); };
      const emit = () => { for (const listener of listeners) listener(); };
      return {
        version: 1,
        officialTree,
        sessionFilters,
        getTabs() { return cachedTabs; },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        insert(tab) {
          if (!tab || !tab.id) return () => {};
          tabs.set(tab.id, tab);
          rebuild();
          emit();
          return () => { tabs.delete(tab.id); rebuild(); emit(); };
        },
        addSessionFilter(filter) {
          sessionFilters.push(filter);
          emit();
          return () => {
            const index = sessionFilters.indexOf(filter);
            if (index >= 0) sessionFilters.splice(index, 1);
            emit();
          };
        },
      };
    }

    function attachNativeTabRegistry(target, registry) {
      try { target.__dshNativeTabs = registry; } catch { /* ignore */ }
      return registry;
    }

    function findNativeTabRegistry(entry) {
      return entry?.__dshNativeTabs || entry?.component?.__dshNativeTabs || null;
    }

    function applyRegistryFilters(state, registry) {
      const src = state || { ids: [], byId: {}, current: null };
      const filters = registry && registry.sessionFilters ? registry.sessionFilters : [];
      if (!filters.length) return src;
      const ids = (src.ids || []).filter((id) => filters.every((fn) => fn(String(id))));
      const byId = {};
      for (const id of ids) {
        if (src.byId && src.byId[id]) byId[id] = src.byId[id];
      }
      return Object.assign({}, src, { ids, byId });
    }

    function SessionSwitcher(props) {
      const Official = props.officialTree;
      const rawUseSessions = props.useSessions;
      const nativeTabs = props.nativeTabs;
      const extraTabs = useSyncExternalStore(
        (listener) => (nativeTabs && nativeTabs.subscribe ? nativeTabs.subscribe(listener) : () => {}),
        () => (nativeTabs && nativeTabs.getTabs ? nativeTabs.getTabs() : EMPTY_EXTRA_TABS),
        () => EMPTY_EXTRA_TABS,
      );
      const [tab, setTab] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "tasks"; } catch { return "tasks"; }
      });
      const currentId = typeof rawUseSessions === "function"
        ? rawUseSessions((state) => (state && state.current) || null)
        : (props.selectedId || null);
      const useTaskSessions = useCallback((selector) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(applyRegistryFilters(filterTaskSessions(state), nativeTabs)));
      }, [rawUseSessions, nativeTabs]);
      const useChannelSessions = useCallback((selector) => {
        if (typeof rawUseSessions !== "function") return selector({ ids: [], byId: {}, current: null });
        return rawUseSessions((state) => selector(filterChannelSessions(state)));
      }, [rawUseSessions]);
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
      useEffect(() => {
        if (typeof currentId === "string" && currentId.startsWith("im:")) setTab("channels");
        if (typeof currentId === "string") {
          const matched = extraTabs.find((item) => item.matchSession && item.matchSession(currentId));
          if (matched) setTab(matched.id);
        }
      }, [currentId, extraTabs]);
      const openSession = (id) => openListedSession(id, props.openSession || props.open);
      const officialProps = Object.assign({}, props, { useSessions: useTaskSessions });
      const channelRail = h(ChannelRail, {
        openSession,
        open: openSession,
        useSessions: rawUseSessions,
        useWorkspaces: props.useWorkspaces,
        selectedId: currentId || props.selectedId || null,
        skin: "native",
        renameSession: props.renameSession,
        archiveSession: props.archiveSession,
        deleteSession: props.deleteSession,
        forkSession: props.forkSession,
        openPath: props.openPath,
      });
      if (props.wide === false) return Official ? h(Official, officialProps) : null;
      const officialTree = Official
        ? h("div", { className: "ima-official-tree" }, h(Official, officialProps))
        : null;
      const extra = extraTabs.find((item) => item.id === tab);
      return h("div", { className: "ima-wrap" },
        h("div", { className: "ima-tabs", role: "tablist", "aria-label": "工作区分类" },
          h("button", { type: "button", role: "tab", "aria-selected": tab === "tasks", className: tab === "tasks" ? "ima-tab on" : "ima-tab", onClick: () => setTab("tasks") }, "任务"),
          h("button", { type: "button", role: "tab", "aria-selected": tab === "channels", className: tab === "channels" ? "ima-tab on" : "ima-tab", onClick: () => setTab("channels") }, "频道"),
          ...extraTabs.map((item) => h("button", {
            key: item.id,
            type: "button",
            role: "tab",
            "aria-selected": tab === item.id,
            className: tab === item.id ? "ima-tab on" : "ima-tab",
            onClick: () => setTab(item.id),
          }, item.label)),
        ),
        tab === "tasks"
          ? (officialTree || h(TaskList, { useSessions: useTaskSessions, useWorkspaces: props.useWorkspaces, openSession }))
          : extra
            ? extra.render(Object.assign({}, props, { openSession, open: openSession }))
            : channelRail,
      );
    }

    function sidebarOccupantName(item) {
      return String(
        item?.options?.locale ??
        item?.options?.id ??
        item?.options?.name ??
        item?.options?.registrant ??
        item?.component?.displayName ??
        item?.component?.name ??
        item?.id ??
        item?.name ??
        "",
      );
    }

    /** 只认真正占用 sidebar 槽的主人。包在注册表里但没接管侧栏时，必须走原生页签。 */
    function hasDshCodexUiSidebar(ctx) {
      try {
        const read = ctx.slots && (ctx.slots.entriesOfSlot || ctx.slots.entries);
        const sidebar = read && read.call(ctx.slots, "sidebar");
        if (!sidebar) return false;
        for (const item of sidebar) {
          if (/dsh-codex-ui|michengai-codex-ui|michengai\.codexUi|codex-ui/i.test(sidebarOccupantName(item))) return true;
        }
      } catch { /* ignore */ }
      return false;
    }

    function pickOfficialWorkspaces(ctx) {
      const entries = (ctx.slots.entries && ctx.slots.entries("sidebar.workspaces")) || [];
      for (const item of entries) {
        if (!item || !item.component) continue;
        if (item.component.__imConnectWrapped) continue;
        if (item.component.__imConnectOriginal) continue;
        if (item.component.__dshNativeTabHost) continue;
        if (item.component.__dshAutomationWrapped) continue;
        return item;
      }
      return null;
    }

    function apply(ctx) {
      ensureStyle();
      openImSession = (id) => {
        try { ctx.sessions.open(id); return true; }
        catch (error) { console.warn("[dsh-im-connect] 无法打开会话", id, error); return false; }
      };
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "im-assistant",
        order: 28,
        label: "IM助理",
        icon: "chat",
        inject: () => ({
          createWorkspace: (input) => ctx.workspaces.create(input),
          pickDirectory: () => ctx.workspaces.pickDirectory(),
        }),
      }, SettingsPage));

      ctx.slots.inject("sidebar.channels", () => ctx.slots.register({
        name: "sidebar.channels",
        id: "im-connect-channels",
        inject: () => ({
          openSession: (id) => { ctx.sessions.open(id); },
          open: (id) => { ctx.sessions.open(id); },
          archiveSession: (id) => ctx.workspaces.archiveSession(id),
          forkSession: (id) => {
            ctx.sessions.fork({ sessionId: id, increaseTitle: true })
              .then((childId) => { ctx.sessions.open(childId); })
              .catch(() => undefined);
          },
          renameSession: async (sessionId, title) => {
            const session = ctx.sessions.binding && ctx.sessions.binding(sessionId)?.session;
            if (!session) throw new Error("unknown session");
            const result = await session.rename(title);
            if (!result.ok) throw new Error(result.error.message);
          },
        }),
      }, ChannelRail));

      // 只包一层官方任务树，绝不在通知回调里再 register，否则会把启动卡在 Loading plugins。
      ctx.slots.inject("sidebar.workspaces", () => {
        let wrappedEntry = null;
        let originalComp = null;
        let removeInsertedTab = () => {};
        let syncing = false;
        const unwrap = () => {
          removeInsertedTab();
          removeInsertedTab = () => {};
          if (wrappedEntry && originalComp) {
            try { wrappedEntry.component = originalComp; } catch { /* ignore */ }
          }
          wrappedEntry = null;
          originalComp = null;
        };
        const insertChannelTab = (entry) => {
          const registry = findNativeTabRegistry(entry);
          if (!registry) return false;
          if (registry.getTabs().some((item) => item.id === "channels")) return true;
          removeInsertedTab();
          removeInsertedTab = registry.insert({
            id: "channels",
            label: "频道",
            order: 20,
            matchSession: (id) => String(id).startsWith("im:"),
            render: (props) => h(ChannelRail, Object.assign({}, props, {
              skin: "native",
              openSession: (id) => openListedSession(id, props.openSession || props.open),
              open: (id) => openListedSession(id, props.openSession || props.open),
            })),
          });
          return true;
        };
        const sync = () => {
          if (syncing) return;
          syncing = true;
          try {
            const combo = hasDshCodexUiSidebar(ctx);
            channelSkin = combo ? "codex" : "native";
            if (combo) {
              unwrap();
              return;
            }
            const entries = (ctx.slots.entries && ctx.slots.entries("sidebar.workspaces")) || [];
            const occupant = entries.find((item) => item && item.component);
            if (occupant && (occupant.component.__dshNativeTabHost || occupant.component.__dshAutomationWrapped || findNativeTabRegistry(occupant))) {
              insertChannelTab(occupant);
              return;
            }
            if (wrappedEntry && wrappedEntry.component && wrappedEntry.component.__imConnectWrapped) {
              insertChannelTab(wrappedEntry);
              return;
            }
            const official = pickOfficialWorkspaces(ctx);
            if (!official || official.component.__imConnectWrapped || official.component.__dshNativeTabHost) return;
            originalComp = official.component;
            const registry = createNativeTabRegistry(originalComp);
            attachNativeTabRegistry(official, registry);
            function ImNativeWorkspaceShell(innerProps) {
              return h(SessionSwitcher, Object.assign({}, innerProps, { officialTree: originalComp, nativeTabs: registry }));
            }
            ImNativeWorkspaceShell.displayName = "ImNativeWorkspaceShell";
            ImNativeWorkspaceShell.__imConnectWrapped = true;
            ImNativeWorkspaceShell.__imConnectOriginal = originalComp;
            ImNativeWorkspaceShell.__dshNativeTabHost = true;
            attachNativeTabRegistry(ImNativeWorkspaceShell, registry);
            official.component = ImNativeWorkspaceShell;
            wrappedEntry = official;
          } catch (error) {
            console.warn("[dsh-im-connect] 包裹官方任务树失败", error);
          } finally {
            syncing = false;
          }
        };
        sync();
        const unsub = typeof ctx.slots.subscribe === "function" ? ctx.slots.subscribe("sidebar.workspaces", sync) : () => {};
        return () => { unsub(); unwrap(); };
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});














