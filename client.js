/**
 * dsh-im-connect 浏览器端：IM助理设置页 + 工作区频道槽。
 */
window.__ModuleLoader__.load({
  id: "dsh-im-connect",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    const React = require("react");
    const { useState, useEffect, useCallback, useRef } = React;
    const inject = ["slots", "sessions"];
    const API_BASE = "/dsh-im-connect/api";
    const TAB_KEY = "dsh-im-connect.sidebar-tab";
    const h = React.createElement;

    const CSS = `
.ima-page{--ima-text:var(--dsh-text,#e6edf3);--ima-muted:var(--dsh-text-muted,#8b949e);--ima-line:var(--dsh-border,rgba(255,255,255,.1));--ima-card:rgba(255,255,255,.04);--ima-card-hover:rgba(255,255,255,.06);--ima-ok:#3fb950;--ima-danger:#f85149;--ima-accent:#1677ff;max-width:720px;margin:0 auto;padding:8px 4px 36px;color:var(--ima-text)}
.ima-deco{display:flex;justify-content:center;align-items:flex-end;gap:10px;min-height:56px;margin:8px 0 14px}
.ima-bubble{font-size:12px;line-height:1.4;padding:6px 10px;border-radius:12px;max-width:220px;border:1px solid var(--ima-line)}
.ima-bubble.left{background:rgba(46,160,67,.14);color:#7ee787}
.ima-bubble.right{background:rgba(255,255,255,.05);color:var(--ima-muted)}
.ima-avatars{display:flex;align-items:center}
.ima-avatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;border:2px solid #111}
.ima-avatar.bot{background:#123524;margin-right:-8px;z-index:1}
.ima-avatar.user{background:#3d3428}
.ima-title{margin:0 0 8px;font-size:26px;font-weight:700;letter-spacing:.03em;text-align:center}
.ima-sub{margin:0 auto 22px;max-width:520px;color:var(--ima-muted);font-size:13px;line-height:1.7;text-align:center}
.ima-model{margin:0 0 14px}
.ima-model-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end;margin-top:10px}
.ima-select-wrap{display:flex;flex-direction:column;gap:6px;min-width:0}
.ima-select-wrap span{color:var(--ima-muted);font-size:12px}
.ima-select{width:100%;min-height:36px;padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:#0d1117;color:var(--ima-text)}
@media (max-width:640px){.ima-model-grid{grid-template-columns:1fr}}
.ima-list{display:flex;flex-direction:column;gap:10px}
.ima-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:52px;padding:10px 16px;border:1px solid var(--ima-line);border-radius:14px;background:var(--ima-card)}
.ima-card:hover{background:var(--ima-card-hover)}
.ima-card-main{min-width:0}
.ima-name-row{display:flex;align-items:center;gap:10px;min-height:28px}
.ima-status{margin-left:auto;color:var(--ima-muted);font-size:12px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42%}
.ima-name{font-size:15px;font-weight:650}
.ima-badge{font-size:11px;line-height:18px;padding:0 7px;border-radius:8px;background:rgba(46,160,67,.16);color:var(--ima-ok)}
.ima-desc,.ima-meta{margin-top:3px;margin-left:38px;color:var(--ima-muted);font-size:12px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:17px}
.ima-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-height:36px;position:relative}
.ima-btn{appearance:none;border:1px solid rgba(255,255,255,.78);background:#fff;color:#111;border-radius:10px;min-width:72px;min-height:32px;padding:0 14px;font-size:13px;cursor:pointer}
.ima-btn:hover{filter:brightness(.96)}
.ima-btn:focus-visible,.ima-more:focus-visible,.ima-switch:focus-visible,.ima-link:focus-visible,.ima-x:focus-visible{outline:2px solid var(--ima-accent);outline-offset:2px}
.ima-btn:disabled{opacity:.5;cursor:not-allowed}
.ima-btn.primary{background:var(--ima-accent);border-color:var(--ima-accent);color:#fff}
.ima-more{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--ima-text);cursor:pointer;font-size:18px;line-height:1}
.ima-more:hover{background:rgba(255,255,255,.06)}
.ima-menu{position:absolute;right:0;top:36px;min-width:128px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:#161b22;z-index:5}
.ima-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:8px 10px;border-radius:6px;cursor:pointer;min-height:36px}
.ima-menu button:hover{background:rgba(255,255,255,.06)}
.ima-switch{width:40px;height:22px;border-radius:11px;border:0;background:var(--ima-ok);position:relative;cursor:pointer;flex:none}
.ima-switch.off{background:#6e7681}
.ima-switch i{position:absolute;top:2px;left:20px;width:18px;height:18px;border-radius:50%;background:#fff;transition:left .16s ease}
.ima-switch.off i{left:2px}
.ima-error{color:var(--ima-danger);font-size:12px;margin:0 0 12px}
.ima-pending{margin:0 0 14px;padding:10px 12px;border:1px solid rgba(210,153,34,.35);border-radius:12px}
.ima-pending-row{display:flex;gap:8px;align-items:center;margin-top:8px}
.ima-wrap{display:flex;flex-direction:column;min-height:0;flex:1;height:100%;overflow:hidden}
.ima-tabs{display:flex;gap:18px;padding:4px 12px 0;border-bottom:1px solid var(--ima-line)}
.ima-tab{appearance:none;border:0;background:transparent;color:var(--ima-muted);padding:8px 0;font-size:13px;cursor:pointer}
.ima-tab.on{color:var(--ima-text);box-shadow:inset 0 -2px 0 currentColor}
.ima-tabs{flex:none}
.ima-rail{flex:1 1 auto;min-height:180px;overflow:auto}
.ima-item{display:flex;align-items:center;gap:6px;padding:0 8px 0 18px;border-radius:8px;cursor:pointer;font-size:13px;min-height:32px;position:relative}
.ima-item-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ima-item:hover,.ima-item.on{background:rgba(255,255,255,.06)}
.ima-sess-actions{display:none;flex:none;align-items:center;gap:2px}
.ima-item:hover .ima-sess-actions,.ima-item.menu-on .ima-sess-actions{display:flex}
.ima-sess-btn{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1}
.ima-sess-btn:hover{background:rgba(255,255,255,.08)}
.ima-sess-menu{position:absolute;right:8px;top:30px;min-width:132px;padding:6px;border:1px solid var(--ima-line);border-radius:10px;background:#161b22;z-index:8}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:var(--ima-text);padding:7px 10px;border-radius:6px;cursor:pointer}
.ima-sess-menu button:hover{background:rgba(255,255,255,.06)}
.ima-sess-menu button.danger{color:var(--ima-danger)}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--ima-line);background:#0d1117;color:var(--ima-text);font-size:13px}
.ima-empty{color:var(--ima-muted);font-size:12px;padding:12px 8px}
.ima-logo{width:28px;height:28px;flex:none;display:block;line-height:0;background:transparent}
.ima-logo svg{width:28px;height:28px;display:block}
.ima-logo.sm{width:16px;height:16px;overflow:visible}
.ima-logo.sm svg{width:16px;height:16px}
.ima-logo.sm[data-brand="weixin"] svg,.ima-logo.sm[data-brand="feishu"] svg,.ima-logo.sm[data-brand="lark"] svg,.ima-logo.sm[data-brand="telegram"] svg{transform:scale(1.2);transform-origin:center}
.ima-logo[data-brand="wecom"]{border-radius:6px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.12);overflow:hidden;background:#fff}
.ima-logo.sm[data-brand="wecom"]{border-radius:4px}
.ima-mask{position:fixed;inset:0;background:rgba(0,0,0,.62);display:grid;place-items:center;z-index:80;padding:24px}
.ima-modal{width:min(440px,100%);background:#1c2128;color:var(--ima-text);border:1px solid var(--ima-line);border-radius:16px;padding:20px 22px 22px;text-align:left;box-shadow:0 16px 48px rgba(0,0,0,.4)}
.ima-modal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ima-modal-h h2{margin:0;font-size:16px;font-weight:650}
.ima-x{border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:var(--ima-muted);width:32px;height:32px}
.ima-seg{display:flex;gap:0;border-bottom:1px solid var(--ima-line);margin:0 -22px 16px;padding:0 22px}
.ima-seg button{flex:1;border:0;background:transparent;padding:10px 0;font-size:13px;color:var(--ima-muted);cursor:pointer}
.ima-seg button.on{color:#79b8ff;box-shadow:inset 0 -2px 0 #79b8ff;font-weight:600}
.ima-qrbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0 4px}
.ima-qrbox img,.ima-qrph{width:200px;height:200px;background:#fff;border:1px solid var(--ima-line);border-radius:12px;object-fit:contain}
.ima-qrph{display:grid;place-items:center;color:var(--ima-muted);font-size:13px}
.ima-hint{margin:0;color:var(--ima-muted);font-size:13px;text-align:center;line-height:1.6}
.ima-link{border:0;background:transparent;color:#79b8ff;cursor:pointer;font-size:13px;min-height:32px}
.ima-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;font-size:13px}
.ima-field input{padding:8px 10px;border-radius:8px;border:1px solid var(--ima-line);background:#0d1117;color:var(--ima-text);min-height:36px}
.ima-radio{display:flex;flex-direction:column;gap:8px;margin:8px 0 14px}
.ima-radio label{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ima-text)}
.ima-radio small{display:block;color:var(--ima-muted);margin-top:2px}
.ima-ok{color:var(--ima-ok);font-size:14px;text-align:center;padding:24px 0}
.ima-modal .ima-error{color:#ff7b72}
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

    let openImSession = (id) => { try { window.__dshSessionsOpen && window.__dshSessionsOpen(id); } catch { /* ignore */ } };
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
        h(ModelCard),
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


    function ModelCard() {
      const [providers, setProviders] = useState([]);
      const [provider, setProvider] = useState("");
      const [model, setModel] = useState("");
      const [saved, setSaved] = useState(false);
      const [busy, setBusy] = useState(false);
      const [hint, setHint] = useState("");

      useEffect(() => {
        api("/assistant").then((data) => {
          if (!data.ok) { setHint(data.error || "无法加载模型列表"); return; }
          const list = data.providers || [];
          setProviders(list);
          const current = data.assistant || {};
          const nextProvider = current.provider || (list[0] && list[0].id) || "";
          const models = ((list.find((item) => item.id === nextProvider) || {}).models) || [];
          const nextModel = current.model || (models[0] && models[0].id) || "";
          setProvider(nextProvider);
          setModel(nextModel);
          setSaved(Boolean(current.provider && current.model));
          if (!list.length) setHint("当前 Host 还没有可用模型，请先在网页里配置提供商");
        }).catch(() => setHint("无法加载模型列表"));
      }, []);

      const models = ((providers.find((item) => item.id === provider) || {}).models) || [];

      const save = (nextProvider, nextModel) => {
        if (!nextProvider || !nextModel) { setHint("请选择提供商和模型"); return; }
        setBusy(true);
        api("/assistant", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: nextProvider, model: nextModel }),
        }).then((data) => {
          if (!data.ok) { setHint(data.error || "保存失败"); setSaved(false); return; }
          setSaved(true);
          setHint("已保存。新的频道会话将使用这个模型。");
        }).catch(() => { setHint("保存失败"); setSaved(false); })
          .finally(() => setBusy(false));
      };

      const onProvider = (value) => {
        const nextModels = ((providers.find((item) => item.id === value) || {}).models) || [];
        const nextModel = nextModels.some((item) => item.id === model) ? model : ((nextModels[0] && nextModels[0].id) || "");
        setProvider(value);
        setModel(nextModel);
        setSaved(false);
      };

      return h("div", { className: "ima-card ima-model" },
        h("div", { className: "ima-card-main" },
          h("div", { className: "ima-name-row" },
            h("span", { className: "ima-name" }, "助手模型"),
            saved && h("span", { className: "ima-badge" }, "已设置"),
          ),
          h("div", { className: "ima-desc" }, "频道会话使用这里选择的模型，与网页任务互不影响。"),
          h("div", { className: "ima-model-grid" },
            h("label", { className: "ima-select-wrap" },
              h("span", null, "提供商"),
              h("select", {
                className: "ima-select",
                value: provider,
                "aria-label": "提供商",
                onChange: (event) => onProvider(event.target.value),
              },
                h("option", { value: "" }, "请选择"),
                ...providers.map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id)),
              ),
            ),
            h("label", { className: "ima-select-wrap" },
              h("span", null, "模型"),
              h("select", {
                className: "ima-select",
                value: model,
                "aria-label": "模型",
                onChange: (event) => { setModel(event.target.value); setSaved(false); },
              },
                h("option", { value: "" }, models.length ? "请选择" : "暂无模型"),
                ...models.map((item) => h("option", { key: item.id, value: item.id }, item.name || item.id)),
              ),
            ),
            h("button", {
              className: "ima-btn primary",
              disabled: busy || !provider || !model,
              onClick: () => save(provider, model),
            }, busy ? "保存中…" : "保存"),
          ),
          hint && h("div", { className: "ima-meta" }, hint),
        ),
      );
    }

    function SettingsPage() {
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
        h("h1", { className: "ima-title" }, "IM 频道"),
        h("p", { className: "ima-sub" },
          "配置 IM 频道，让本机助手接收来自钉钉、飞书等平台的消息。",
          h("br"),
          "频道配置信息仅存储在本地，不会上传到云端。",
        ),
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

    function ChannelRail(props) {
      if (typeof props.useSessions === "function") return h(ChannelRailWithSessions, props);
      return h(ChannelRailView, props);
    }

    function ChannelRailWithSessions(props) {
      const selectedId = props.useSessions((state) => (state && state.current) || null);
      return h(ChannelRailView, Object.assign({}, props, { selectedId: selectedId || props.selectedId || null }));
    }

    const WB_CSS = `.dcu-wb,.ima-native{display:flex;flex:1;min-height:0;flex-direction:column;padding:4px 10px 8px;color:var(--dsw-alias-label-primary,var(--ima-text));font:14px/20px inherit}
.dcu-wb *,.ima-native *{box-sizing:border-box}
.dcu-wb-tree,.ima-native-tree{flex:1;min-height:0;overflow-y:auto;padding-bottom:16px;user-select:none}
.dcu-wb-project-head,.ima-native-head,.dcu-wb-session,.ima-native-session{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:8px;padding:0 8px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
.dcu-wb-project-head,.ima-native-head{height:34px}
.dcu-wb-project-head:hover,.dcu-wb-session:hover,.dcu-wb-session.dcu-wb-selected,.ima-native-head:hover,.ima-native-session:hover,.ima-native-session.on{background:var(--dsw-alias-interactive-bg-hover,var(--dcu-sidebar-hover,rgba(255,255,255,.06)))}
.dcu-wb-folder,.ima-native-folder{display:grid;place-items:center;flex:none;width:16px;height:20px}
.dcu-wb-project-title,.dcu-wb-session-title,.ima-native-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;flex:1;font-weight:500}
.dcu-wb-session-title,.ima-native-session .ima-native-title{font-weight:400}
.dcu-wb-session,.ima-native-session{position:relative;min-height:32px;padding-left:32px}
.dcu-wb-actions,.ima-native-actions{display:none;align-items:center;flex:none}
.dcu-wb-session:hover .dcu-wb-actions,.dcu-wb-session.dcu-wb-menu-open .dcu-wb-actions,.ima-native-session:hover .ima-native-actions,.ima-native-session.menu-on .ima-native-actions{display:flex}
.dcu-wb-more,.ima-native-more{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:4px;padding:0;background:transparent;color:var(--dsw-alias-label-secondary,var(--ima-muted));cursor:pointer}
.dcu-wb-empty,.ima-native-empty{padding:14px 8px;color:var(--dsw-alias-label-tertiary,var(--ima-muted));font-size:13px}
.ima-sess-menu{position:absolute;right:8px;top:30px;min-width:132px;padding:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));border-radius:10px;background:var(--dsw-alias-bg-secondary,#161b22);z-index:8}
.ima-sess-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:7px 10px;border-radius:6px;cursor:pointer;font:13px/18px inherit}
.ima-sess-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}
.ima-sess-menu button.danger{color:var(--dsw-alias-state-error-primary,var(--ima-danger))}
.ima-rename{flex:1;min-width:0;min-height:28px;padding:2px 8px;border-radius:6px;border:1px solid var(--dsw-alias-stroke-primary,var(--ima-line));background:transparent;color:inherit;font:inherit}`;

    function MoreIcon() {
      return h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true" },
        h("circle", { cx: 3.5, cy: 8, r: 1.2, fill: "currentColor" }),
        h("circle", { cx: 8, cy: 8, r: 1.2, fill: "currentColor" }),
        h("circle", { cx: 12.5, cy: 8, r: 1.2, fill: "currentColor" }),
      );
    }

    function ChannelSessionRow({ sess, selected, onOpen, onChanged, skin, sessionActions }) {
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
        if (action === "archive" && typeof acts.archiveSession === "function") {
          Promise.resolve(acts.archiveSession(sess.sessionId)).then(afterHost).catch(afterHost);
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
      return h("div", {
        className: rowClass,
        role: "treeitem",
        tabIndex: 0,
        "aria-selected": selected,
        onClick: () => onOpen(sess.sessionId),
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(sess.sessionId); } },
        onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); setMenu(!menu); },
      },
        h("span", { className: native ? "ima-native-title" : "dcu-wb-session-title" }, title),
        h("span", { className: native ? "ima-native-actions" : "dcu-wb-actions" },
          h("button", {
            type: "button",
            className: native ? "ima-native-more" : "dcu-wb-more",
            "aria-label": title + " 更多",
            onClick: (e) => { e.stopPropagation(); setMenu(!menu); },
          }, h(MoreIcon)),
        ),
        menu && h("div", { className: "ima-sess-menu", onClick: (e) => e.stopPropagation() },
          h("button", { type: "button", onClick: () => { setMenu(false); setRenaming(true); } }, "重命名"),
          native
            ? h("button", { type: "button", onClick: () => run("remove") }, "归档")
            : [
              h("button", { key: "fork", type: "button", onClick: () => run("fork") }, "派生"),
              h("button", { key: "arch", type: "button", onClick: () => run("archive") }, "归档"),
              h("button", { key: "ct", type: "button", onClick: () => run("copy-title") }, "复制标题"),
              h("button", { key: "ci", type: "button", onClick: () => run("copy-id") }, "复制 ID"),
              h("button", { key: "cl", type: "button", onClick: () => run("copy-link") }, "复制链接"),
              h("button", { key: "del", type: "button", className: "danger", onClick: () => run("delete") }, "删除"),
            ],
        ),
      );
    }

    function ChannelRail(props) {
      if (typeof props.useSessions === "function") return h(ChannelRailWithSessions, props);
      return h(ChannelRailView, props);
    }

    function ChannelRailWithSessions(props) {
      const selectedId = props.useSessions((state) => (state && state.current) || null);
      return h(ChannelRailView, Object.assign({}, props, { selectedId: selectedId || props.selectedId || null }));
    }

    function ChannelRailView(props) {
      const [groups, setGroups] = useState([]);
      const [folded, setFolded] = useState({});
      const [error, setError] = useState("");
      const selectedId = props.selectedId;
      const skin = props.skin || channelSkin;
      const native = skin !== "codex";
      const open = (id) => {
        if (typeof props.openSession === "function") props.openSession(id);
        else if (typeof props.open === "function") props.open(id);
        else openImSession(id);
      };
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
          ...groups.map((g) => h("div", { key: g.id, className: native ? "ima-native-project" : "dcu-wb-project" },
            h("button", {
              className: native ? "ima-native-head" : "dcu-wb-project-head",
              type: "button",
              onClick: () => setFolded({ ...folded, [g.id]: !folded[g.id] }),
            },
              h("span", { className: native ? "ima-native-folder" : "dcu-wb-folder" }, h(Logo, { id: g.id, small: true })),
              h("span", { className: native ? "ima-native-title" : "dcu-wb-project-title" }, g.label),
            ),
            !folded[g.id] && ((g.sessions && g.sessions.length)
              ? g.sessions.map((sess) => h(ChannelSessionRow, {
                key: sess.sessionId,
                sess,
                selected: selectedId === sess.sessionId,
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
          )),
        ),
      );
    }

    function TaskList(props) {
      if (typeof props.useSessions === "function") return h(TaskListWithSessions, props);
      return h(TaskListView, { items: [], current: null, openSession: props.openSession });
    }

    function TaskListWithSessions(props) {
      const snap = props.useSessions((state) => state || { ids: [], byId: {}, current: null });
      const items = (snap.ids || []).map((id) => snap.byId[id]).filter((item) => item && item.origin !== "im" && item.origin !== "subagent" && !item.blank && !(item.id || "").startsWith("im:"));
      return h(TaskListView, { items, current: snap.current, openSession: props.openSession });
    }

    function TaskListView({ items, current, openSession }) {
      if (!items.length) return h("div", { className: "ima-empty" }, "暂无网页任务");
      return h("div", { className: "ima-rail" },
        ...items.map((item) => h("div", {
          key: item.id,
          className: current === item.id ? "ima-item on" : "ima-item",
          onClick: () => openSession && openSession(item.id),
        }, item.title || item.id)),
      );
    }

    function SessionSwitcher(props) {
      const [tab, setTab] = useState(() => {
        try { return localStorage.getItem(TAB_KEY) || "tasks"; } catch { return "tasks"; }
      });
      useEffect(() => { ensureStyle(); }, []);
      useEffect(() => { try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ } }, [tab]);
      const openSession = props.openSession;
      return h("div", { className: "ima-wrap" },
        h("div", { className: "ima-tabs" },
          h("button", { className: tab === "tasks" ? "ima-tab on" : "ima-tab", onClick: () => setTab("tasks") }, "任务"),
          h("button", { className: tab === "channels" ? "ima-tab on" : "ima-tab", onClick: () => setTab("channels") }, "频道"),
        ),
        tab === "tasks"
          ? h(TaskList, { useSessions: props.useSessions, openSession })
          : h(ChannelRail, { openSession, useSessions: props.useSessions, selectedId: props.selectedId || null }),
      );
    }

    /** 探测是否装了 dsh-codex-ui。装了则只填 sidebar.channels，样式走官方 Codex 工作区树；没装则给原生 sidebar.workspaces 套「任务/频道」壳，样式走 DSH 原生行。 */
    function hasDshCodexUi(ctx) {
      try {
        const registry = ctx.registry;
        if (registry) {
          for (const item of registry) {
            const n = String(item?.name ?? item?.runtime?.name ?? item?.id ?? "");
            if (/codex-ui|dsh-codex-ui|michengai-codex-ui/i.test(n)) return true;
          }
        }
        const sidebar = ctx.slots && ctx.slots.entries && ctx.slots.entries("sidebar");
        if (sidebar) {
          for (const item of sidebar) {
            const n = String(item?.options?.id ?? item?.options?.name ?? item?.id ?? "");
            if (/codex-ui|dsh-codex-ui|michengai-codex-ui/i.test(n)) return true;
          }
        }
      } catch { /* ignore */ }
      return false;
    }

    function apply(ctx) {
      ensureStyle();
      channelSkin = hasDshCodexUi(ctx) ? "codex" : "native";
      openImSession = (id) => {
        try { ctx.sessions.open(id); }
        catch (error) { console.warn("[dsh-im-connect] 无法打开会话", id, error); }
      };
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "im-assistant",
        order: 28,
        label: "IM助理",
      }, SettingsPage));

      ctx.slots.inject("sidebar.channels", () => ctx.slots.register({
        name: "sidebar.channels",
        id: "im-connect-channels",
      }, ChannelRail));

      if (!hasDshCodexUi(ctx)) {
        ctx.slots.inject("sidebar.workspaces", () => ctx.slots.register({
          name: "sidebar.workspaces",
          id: "im-connect-switcher",
          priority: 20,
          inject: () => ({
            openSession: (id) => { ctx.sessions.open(id); },
            open: (id) => { ctx.sessions.open(id); },
          }),
        }, SessionSwitcher));
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});









