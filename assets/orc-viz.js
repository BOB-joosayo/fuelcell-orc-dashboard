/*
 * 연료전지 폐열 ORC 시각화 공통 엔진
 *  - 데이터: OrcViz.setProvider(fn) 로 교체. fn(tick) → { 포인트ID: { v, ts } } (또는 Promise)
 *  - 화면 갱신: OrcViz.onRender(fn) 로 등록한 함수가 갱신 주기마다 호출됨
 */
(function () {
  const P = window.ORC_POINTS || {};
  const GROUPS = window.ORC_POINT_GROUPS || [];
  const SVGNS = "http://www.w3.org/2000/svg";

  const config = {
    refreshMs: 3000,        // 시연용 갱신 주기. 실연동 시 EMS 수집 주기(15분)에 맞춰 조정
    staleMin: 30,           // 이 시간보다 오래된 값은 통신 없음으로 본다 (15분 × 2)
    hotPumpRunAmp: 1,       // 중온수펌프 M1/M2: 전류가 이 값을 넘으면 운전
    contractEffPct: 15,     // 목표 효율 기준선
    effScaleMaxPct: 20,     // 효율 막대 눈금 최대값
    ratedKw: 180,           // ORC 1대 정격
    diffWarnPct: 5,         // 현장값 vs EMS 계산값 차이 경고 기준
  };

  const STATE_LABEL = { run: "운전 중", start: "기동 중", stopping: "정지 중", stop: "정지", fault: "고장", nodata: "통신 없음" };
  const STATE_COLOR = { run: "#2fbf71", start: "#1c7ed6", stopping: "#e67700", stop: "#4a4a52", fault: "#ff4d4f", nodata: "#3a3a40" };
  const ORC_NAME = ["ORC#1-1", "ORC#1-2", "ORC#2-1", "ORC#2-2", "ORC#3-1", "ORC#3-2"];
  const CONTAINER = ["A", "A", "B", "B", "C", "C"];

  let snap = {};
  let tick = 0;
  let provider = null;
  const renderers = [];
  const binders = [];
  const flows = {};

  // ---------- 값 ----------
  function val(id) {
    const p = snap[id];
    if (!p || p.v === null || p.v === undefined || Number.isNaN(p.v)) return null;
    if (Date.now() - p.ts > config.staleMin * 60000) return null;
    return p.v;
  }
  function tsOf(id) { return snap[id] ? snap[id].ts : null; }
  function fmt(v, d = 1) {
    if (v === null || v === undefined) return "—";
    return Number(v).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function unitOf(id) { const b = id.split("@")[0]; return (P[b] && P[b].unit) || ""; }
  /** 오늘(00시~현재) 누적값. 공급 함수가 `ID@today` 키로 넣어준다 (15분 지표의 일 합계) */
  function today(id) { return val(`${id}@today`); }
  function ratioPct(num, den) { return num === null || den === null || den <= 0 ? null : (num / den) * 100; }
  function hhmm(t) {
    if (!t) return "—";
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function sum(ids) {
    let s = 0;
    for (const id of ids) { const v = val(id); if (v === null) return null; s += v; }
    return s;
  }
  function diffPct(site, ems) {
    if (site === null || ems === null || site === 0) return null;
    return ((ems - site) / site) * 100;
  }

  // ---------- 상태 판정 ----------
  const u2 = (n) => String(n).padStart(2, "0");
  const state = {
    orc(n) {
      const v = val(`orc.state.${u2(n)}`);
      return v === null ? "nodata" : ({ 0: "stop", 1: "start", 2: "run", 3: "stopping" }[v] || "nodata");
    },
    coolPump(k) {
      const f = val(`cwpump.fault.0${k}`), r = val(`cwpump.state.0${k}`);
      if (f === null && r === null) return "nodata";
      if (f === 1) return "fault";
      return r === 1 ? "run" : "stop";
    },
    hotPump(n) {
      const a = val(`hwpump.pump_current.0${n}`);
      if (a === null) return "nodata";
      return a > config.hotPumpRunAmp ? "run" : "stop";
    },
    fc(n) {
      const c = val(`fc.running_units.0${n}`);
      if (c === null) return "nodata";
      return c > 0 ? "run" : "stop";
    },
    lockout(id) {
      const v = val(id);
      if (v === null) return "nodata";
      return v === 1 ? "fault" : "run";
    },
  };
  function nOp() {
    let n = 0;
    for (let i = 1; i <= 6; i++) if (val(`orc.state.${u2(i)}`) === 2) n++;
    return n;
  }
  function orcFlowing(st) { return st === "run" || st === "start" || st === "stopping"; }

  // ---------- SVG ----------
  function s(tag, attrs = {}, parent) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") el.textContent = v;
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    if (parent) parent.appendChild(el);
    return el;
  }
  function defs(svg) {
    const d = s("defs", {}, svg);
    const pat = s("pattern", { id: "orc-hatch", width: 8, height: 8, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, d);
    s("rect", { width: 8, height: 8, fill: "#141417" }, pat);
    s("line", { x1: 0, y1: 0, x2: 0, y2: 8, stroke: "#3a3a40", "stroke-width": 3 }, pat);
    const sw = s("linearGradient", { id: "orc-sweep", x1: 0, x2: 1, y1: 0, y2: 0 }, d);
    [["0%", 0], ["50%", 0.16], ["100%", 0]].forEach(([o, a]) => s("stop", { offset: o, "stop-color": "#2fbf71", "stop-opacity": a }, sw));
    return d;
  }
  let pathSeq = 0;
  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 전력: 선보다 살짝 큰 미니 지그재그 번개가 지지직거리며 선을 따라 흐른다 (모양은 45ms마다 새로 흔들림)
  const ZAP_LAYERS = ["zap-bloom", "zap-glow", "zap-core"];
  const ZAP_PX_PER_S = 170, ZAP_LEN = 30, ZAP_AMP = 3.2, ZAP_STEP = 3.2, ZAP_JITTER_S = 0.045, ZAP_GAP = 320;
  const zaps = [];
  let zapLast = 0, zapLoop = false;
  const rnd = (a, b) => a + Math.random() * (b - a);
  /** 선 위 거리 d 지점의 좌표와 진행 방향(단위 벡터) */
  function frameAt(base, len, d) {
    d = Math.max(0, Math.min(len, d));
    const a = base.getPointAtLength(d);
    const fwd = d + 0.8 <= len;
    const b = base.getPointAtLength(fwd ? d + 0.8 : Math.max(0, d - 0.8));
    const tx = fwd ? b.x - a.x : a.x - b.x, ty = fwd ? b.y - a.y : a.y - b.y, m = Math.hypot(tx, ty) || 1;
    return { x: a.x, y: a.y, tx: tx / m, ty: ty / m };
  }
  function drawZap(w, k) {
    const a = Math.max(0, k.pos - w.L), b = Math.min(w.len, k.pos);
    let pts = "";
    if (b > a) {
      const n = Math.max(2, Math.round((b - a) / ZAP_STEP));
      for (let i = 0; i <= n; i++) {
        const f = frameAt(w.base, w.len, a + ((b - a) * i) / n);
        const amp = i === 0 || i === n ? 0 : ZAP_AMP * k.jit[i % k.jit.length];
        pts += `${(f.x - f.ty * amp).toFixed(1)},${(f.y + f.tx * amp).toFixed(1)} `;
      }
    }
    k.lines.forEach((l) => l.setAttribute("points", pts));
  }
  function tickZaps(now) {
    const dt = zapLast ? Math.min(0.1, (now - zapLast) / 1000) : 0;
    zapLast = now;
    for (const w of zaps) {
      w.rate += (w.target - w.rate) * Math.min(1, dt * 2);
      for (const k of w.streaks) {
        if (!k.active) {
          if (!w.on) continue;
          k.wait -= dt;
          if (k.wait > 0) continue;
          Object.assign(k, { active: true, pos: 0 });
        }
        k.pos += ZAP_PX_PER_S * w.rate * dt;
        k.jt -= dt;
        if (k.jt <= 0) { k.jt = ZAP_JITTER_S; k.jit = k.jit.map(() => rnd(-1, 1)); }
        drawZap(w, k);
        if (k.pos > w.len + w.L) {
          Object.assign(k, { active: false, wait: rnd(0.5, 1.5) / w.rate });
          k.lines.forEach((l) => l.setAttribute("points", ""));
        }
      }
    }
    requestAnimationFrame(tickZaps);
  }
  function elecZaps(parent, base) {
    const len = base.getTotalLength ? base.getTotalLength() : 0;
    if (!len || REDUCED) return null;
    const wrap = s("g", { class: "zaps off" }, parent);
    const streaks = Array.from({ length: len > ZAP_GAP ? 2 : 1 }, (_, i) => ({
      lines: ZAP_LAYERS.map((cls) => s("polyline", { class: cls }, wrap)),
      jit: Array.from({ length: 12 }, () => rnd(-1, 1)), jt: 0,
      active: false, pos: 0, wait: rnd(0, 1.2) + i * 0.7,
    }));
    const w = { base, len, L: Math.min(ZAP_LEN, len * 0.5), wrap, streaks, rate: 1, target: 1, on: false };
    zaps.push(w);
    if (!zapLoop) { zapLoop = true; requestAnimationFrame(tickZaps); }
    return w;
  }
  /** 배관 = 바탕선 + 흐름선. d는 흐름 방향으로 그린다. key 로 on/off 제어. 전력(elec)은 미니 지그재그 번개가 선을 따라 흐른다 */
  function pipe(parent, d, cls, key) {
    const g = s("g", { class: "pipe-g" }, parent);
    const base = s("path", { d, class: `pipe ${cls}` }, g);
    const item = { base, cls };
    if (cls === "elec") {
      item.core = s("path", { d, class: "elec-core" }, g);
      item.zaps = elecZaps(g, base);
    } else {
      item.fl = s("path", { d, class: `flow ${cls}` }, g);
    }
    if (key) (flows[key] = flows[key] || []).push(item);
    return g;
  }
  /** speed: 1 = 기본, 클수록 빠름. 점선 흐름은 0.25 단위로 끊어 튀지 않게 하고, 전력 번개는 출력이 클수록 자주·빠르게 흐른다 */
  function setFlow(key, on, speed = 1) {
    const q = Math.max(0.25, Math.round(speed * 4) / 4);
    (flows[key] || []).forEach((it) => {
      it.base.classList.toggle("off", !on);
      if (it.fl) it.fl.classList.toggle("off", !on);
      if (it.core) it.core.classList.toggle("off", !on);
      if (it.cls === "elec") {
        const w = it.zaps;
        if (w) {
          w.on = on;
          w.target = Math.min(1.5, Math.max(0.6, speed));
          w.wrap.classList.toggle("off", !on);
        }
        return;
      }
      if (it.q === q) return;
      it.q = q;
      it.fl.style.animationDuration = `${(1.2 / q).toFixed(2)}s`;
    });
  }
  function fan(parent, cx, cy, r) {
    const g = s("g", {}, parent);
    s("circle", { cx, cy, r, class: "icon-ring" }, g);
    const rot = s("g", { class: "spin" }, g);
    s("circle", { cx, cy, r: r * 0.9, fill: "none", stroke: "none" }, rot);
    for (let k = 0; k < 3; k++) {
      const a = (k * 120 * Math.PI) / 180;
      const x = cx + Math.cos(a) * r * 0.72, y = cy + Math.sin(a) * r * 0.72;
      s("path", { d: `M${cx} ${cy} Q${cx + Math.cos(a - 0.6) * r * 0.6} ${cy + Math.sin(a - 0.6) * r * 0.6} ${x} ${y} Q${cx + Math.cos(a + 0.35) * r * 0.45} ${cy + Math.sin(a + 0.35) * r * 0.45} ${cx} ${cy}Z`, fill: "#22b8cf", opacity: 0.9 }, rot);
    }
    s("circle", { cx, cy, r: r * 0.14, fill: "#e8f9fc" }, rot);
    return g;
  }
  /** 피스톤 펌프: 실린더 안 피스톤이 위아래로 눌러 액체를 밀어낸다. (cx, cy) = 실린더 중심, 배관 위에 올린다 */
  function pumpIcon(parent, cx, cy, r, color = "#4dabf7") {
    const g = s("g", { class: "pump" }, parent);
    const w = r * 1.5, h = r * 1.5, top = cy - h / 2;
    s("circle", { cx, cy, r: r + 9, class: "alarm-ring" }, g);
    s("rect", { x: cx - w / 2 - 3, y: cy + h / 2 - 1, width: w + 6, height: 4, rx: 1.5, fill: "#5c5c66" }, g);
    s("rect", { x: cx - w / 2, y: top, width: w, height: h, rx: 3, fill: "#141417", class: "icon-ring" }, g);
    s("rect", { x: cx - w / 2 + 2.5, y: top + r * 0.95, width: w - 5, height: h - r * 0.95 - 2.5, rx: 1.5, fill: color, class: "pump-fluid" }, g);
    const pst = s("g", { class: "pump-piston" }, g);
    pst.style.setProperty("--stroke", `${(r * 0.42).toFixed(1)}px`);
    s("rect", { x: cx - r * 0.17, y: top - r * 0.95, width: r * 0.34, height: r * 1.25, fill: "#8a8a94" }, pst);
    s("rect", { x: cx - w * 0.38, y: top - r * 1.1, width: w * 0.76, height: r * 0.28, rx: r * 0.14, fill: color }, pst);
    s("rect", { x: cx - w / 2 + 2.5, y: top + r * 0.18, width: w - 5, height: r * 0.32, rx: 1.5, fill: "#d6d6dc" }, pst);
    return g;
  }
  /** 발전기: 회전 프로펠러 */
  function genIcon(parent, cx, cy, r) {
    const g = s("g", {}, parent);
    s("circle", { cx, cy, r, class: "icon-ring", fill: "#141417" }, g);
    const rot = s("g", { class: "spin" }, g);
    s("circle", { cx, cy, r: r * 0.85, fill: "none", stroke: "none" }, rot);
    for (let k = 0; k < 6; k++) {
      const a = (k * 60 * Math.PI) / 180;
      s("path", { d: `M${cx} ${cy} L${cx + Math.cos(a) * r * 0.75} ${cy + Math.sin(a) * r * 0.75} L${cx + Math.cos(a + 0.45) * r * 0.6} ${cy + Math.sin(a + 0.45) * r * 0.6}Z`, fill: "#ffd43b", opacity: 0.85 }, rot);
    }
    s("circle", { cx, cy, r: r * 0.16, fill: "#fff" }, rot);
    return g;
  }
  /** 연료전지 외형 (건전지 모양): 본체 + 오른쪽 단자. 정보는 본체 안에 그린다. 운전 중이면 은은한 빛이 지나간다 */
  function battery(parent, x, y, w, h) {
    const g = s("g", {}, parent);
    const nubW = 11, nubH = h * 0.34, bw = w - nubW;
    const cid = `orc-clip-${++pathSeq}`;
    const cp = s("clipPath", { id: cid }, g);
    s("rect", { x, y, width: bw, height: h, rx: 14 }, cp);
    s("rect", { x: x + bw - 2, y: y + h / 2 - nubH / 2, width: nubW + 2, height: nubH, rx: 3, class: "fc-nub" }, g);
    s("rect", { x, y, width: bw, height: h, rx: 14, class: "frame" }, g);
    const inner = s("g", { "clip-path": `url(#${cid})` }, g);
    s("rect", { x, y, width: 7, height: h, class: "fc-band" }, inner);
    const sw = s("rect", { x: x - 140, y, width: 140, height: h, fill: "url(#orc-sweep)", class: "fc-sweep" }, inner);
    sw.style.setProperty("--travel", `${bw + 140}px`);
    return { g, right: x + w, cy: y + h / 2 };
  }
  function statePill(parent, x, y, w = 58) {
    const g = s("g", {}, parent);
    s("rect", { x, y, width: w, height: 20, rx: 10, class: "st-pill" }, g);
    const t = s("text", { x: x + w / 2, y: y + 14, "text-anchor": "middle", class: "st-text" }, g);
    return t;
  }
  function setState(el, st, pillText) {
    if (!el) return;
    el.setAttribute("data-state", st);
    if (pillText) pillText.textContent = STATE_LABEL[st];
  }

  // ---------- 텍스트 바인딩 ----------
  /** fn() 결과 문자열이 바뀌면 갱신 + 잠깐 반짝 */
  function bind(el, fn) { binders.push({ el, fn, last: null }); return el; }
  function runBinders() {
    for (const b of binders) {
      const t = fn2str(b.fn);
      if (t !== b.last) {
        b.el.textContent = t;
        if (b.last !== null) { b.el.classList.remove("bump"); void b.el.getBoundingClientRect(); b.el.classList.add("bump"); }
        b.last = t;
      }
    }
  }
  function fn2str(fn) { try { return String(fn()); } catch (e) { return "—"; } }

  // ---------- 툴팁 ----------
  let tipEl = null, tipFn = null, tipXY = [0, 0];
  function ensureTip() {
    if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "orc-tip"; document.body.appendChild(tipEl); }
    return tipEl;
  }
  /** fn() → { title, state, rows: [{ l, id, d } | { l, t }], note } */
  function tip(el, fn) {
    el.addEventListener("mouseenter", (e) => { tipFn = fn; drawTip(); moveTip(e); ensureTip().classList.add("show"); });
    el.addEventListener("mousemove", moveTip);
    el.addEventListener("mouseleave", () => { tipFn = null; ensureTip().classList.remove("show"); });
  }
  function moveTip(e) {
    const t = ensureTip();
    tipXY = [e.clientX, e.clientY];
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 16;
    if (y + h > window.innerHeight - 8) y = e.clientY - h - 16;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, y)}px`;
  }
  function rowValue(r) {
    if (r.t !== undefined) return { text: typeof r.t === "function" ? r.t() : r.t, na: false };
    const v = val(r.id);
    if (v === null) return { text: "—", na: true };
    if (r.map) return { text: r.map(v), na: false };
    return { text: `${fmt(v, r.d ?? 1)} ${unitOf(r.id)}`.trim(), na: false };
  }
  function drawTip() {
    if (!tipFn) return;
    const c = tipFn();
    const esc = (x) => String(x).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
    let latest = 0;
    let html = `<div class="tt-head"><span class="tt-title">${esc(c.title)}</span>`;
    if (c.state) html += `<span class="tt-st" style="background:${STATE_COLOR[c.state]}">${STATE_LABEL[c.state]}</span>`;
    html += "</div>";
    for (const r of c.rows || []) {
      const rv = rowValue(r);
      if (r.id && tsOf(r.id) && val(r.id) !== null) latest = Math.max(latest, tsOf(r.id));
      html += `<div class="tt-row"><span class="l">${esc(r.l)}</span><span class="v${rv.na ? " na" : ""}">${esc(rv.text)}</span></div>`;
    }
    if (c.note) html += `<div class="tt-note">${c.note}</div>`;
    if (latest) html += `<div class="tt-time">최근 수신 ${hhmm(latest)} (15분 주기)</div>`;
    ensureTip().innerHTML = html;
  }

  // ---------- 상태값 표시용 변환 ----------
  const VALUE_MAP = {
    state: (v, id) => (id.startsWith("orc.") ? STATE_LABEL[{ 0: "stop", 1: "start", 2: "run", 3: "stopping" }[v]] || v : v === 1 ? "운전" : "정지"),
    fault: (v) => (v === 1 ? "고장" : "정상"),
    lockout: (v) => (v === 1 ? "동작(트립)" : "정상"),
    running_units: (v) => `${fmt(v, 0)} 기`,
  };
  function pointText(id) {
    const v = val(id);
    if (v === null) return null;
    const m = VALUE_MAP[P[id] && P[id].code];
    if (m) return m(v, id);
    const un = unitOf(id);
    const d = Math.abs(v) >= 10000 ? 0 : un === "℃" || un === "%" || Math.abs(v) >= 100 ? 1 : 2;
    return `${fmt(v, d)} ${unitOf(id)}`.trim();
  }

  // ---------- 전체 포인트 표 ----------
  const GROUP_STATE = {
    ORC1: () => state.orc(1), ORC2: () => state.orc(2), ORC3: () => state.orc(3),
    ORC4: () => state.orc(4), ORC5: () => state.orc(5), ORC6: () => state.orc(6),
    CPA: () => state.coolPump(1), CPB: () => state.coolPump(2), CPC: () => state.coolPump(3),
    HP1: () => state.hotPump(1), HP2: () => state.hotPump(2),
    FC01: () => state.fc(1), FC02: () => state.fc(2),
  };
  // 고객용 짧은 이름 (설비 + 포인트 종류 기준). 없으면 포인트 표시명을 줄여 쓴다
  const FRIENDLY = {
    "orc.output_kw": "출력", "orc.elec_eff": "효율", "orc.energy_total": "누적 발전량", "orc.state": "운전 상태",
    "orc.hw_supply_temp": "중온수 입구 온도", "orc.hw_return_temp": "중온수 출구 온도", "orc.cw_supply_temp": "냉각수 공급 온도", "orc.cw_return_temp": "냉각수 환수 온도",
    "orc.energy_15m": "15분 발전량", "fc.heat_site": "15분 중온수열량", "meter.energy_15m": "15분 발전량",
    "cwpump.state": "운전 상태", "cwpump.fault": "고장 상태",
  };
  function shortLabel(id, groupTitle) {
    const f = FRIENDLY[id.split(".").slice(0, 2).join(".")];
    if (f) return f;
    let l = (P[id] && P[id].label) || id;
    l = l.replace(/\s*\[.*\]\s*$/, "").replace(groupTitle, "").replace(/^#\d\s*/, "").replace(/^\d호\s*연료전지\s*/, "")
      .replace(/^ACB\(LV(, 멀티미터)?\)\s*/, "").replace(/^통합 연료전지\s*/, "").trim();
    return l || P[id].name;
  }
  /** 모니터링 화면용: 현장에서 오는 값만 (EMS 계산 지표 제외) */
  const isSite = (id) => P[id] && P[id].source !== "ems";
  function mountPointTable(host) {
    const det = document.createElement("details");
    det.className = "all-points card";
    const shown = Object.keys(P).filter(isSite);
    const phys = shown.filter((id) => P[id].kind === "physical").length;
    det.innerHTML = `<summary>전체 포인트 보기 <span style="color:#999;font-weight:400;font-size:12px">(계측 ${phys} · 지표 ${shown.length - phys})</span></summary><div class="pt-grid"></div>`;
    const grid = det.querySelector(".pt-grid");
    const cells = [];
    for (const g of GROUPS) {
      const box = document.createElement("div");
      box.className = "pt-group";
      const h = document.createElement("h4");
      h.textContent = g.title;
      const st = document.createElement("span");
      st.className = "st";
      if (GROUP_STATE[g.key]) h.appendChild(st);
      box.appendChild(h);
      const ids = g.ids.filter(isSite).sort((a, b) => (P[a].kind === P[b].kind ? 0 : P[a].kind === "physical" ? -1 : 1));
      for (const id of ids) {
        const row = document.createElement("div");
        row.className = "pt-row";
        const ind = P[id].kind === "indicator" ? '<span class="ind">지표</span>' : "";
        row.innerHTML = `<span class="l" title="${P[id].label}">${ind}${shortLabel(id, g.title)}</span><span class="v"></span>`;
        box.appendChild(row);
        cells.push({ id, v: row.querySelector(".v") });
      }
      if (GROUP_STATE[g.key]) cells.push({ group: g.key, st });
      grid.appendChild(box);
    }
    host.appendChild(det);
    onRender(() => {
      if (!det.open) return;
      for (const c of cells) {
        if (c.group) {
          const sv = GROUP_STATE[c.group]();
          c.st.textContent = STATE_LABEL[sv];
          c.st.style.background = STATE_COLOR[sv];
          continue;
        }
        const t = pointText(c.id);
        c.v.textContent = t === null ? "—" : t;
        c.v.classList.toggle("na", t === null);
      }
    });
    det.addEventListener("toggle", () => renderAll());
  }

  // ---------- KPI 카드 ----------
  /** opts: { title, value: () => number|null, d, unit, sub: () => html, effBar: true, tip: () => tipContent } */
  function kpi(host, o) {
    const el = document.createElement("div");
    el.className = "kpi card";
    el.innerHTML = `<div class="k-title">${o.title}</div><div class="k-val"><span class="n">—</span><small>${o.unit || ""}</small></div>` +
      (o.effBar ? `<div class="effbar"><div class="fill"></div><div class="target" data-label="목표 ${config.contractEffPct}%"></div></div>` : "") +
      `<div class="k-sub"></div>`;
    host.appendChild(el);
    const n = el.querySelector(".n"), sub = el.querySelector(".k-sub");
    bind(n, () => fmt(o.value(), o.d ?? 1));
    if (o.effBar) el.querySelector(".target").style.left = `${(config.contractEffPct / config.effScaleMaxPct) * 100}%`;
    onRender(() => {
      const v = o.value();
      el.classList.toggle("is-nodata", v === null);
      if (o.sub) sub.innerHTML = o.sub();
      if (o.effBar) el.querySelector(".fill").style.width = `${Math.min(100, ((v || 0) / config.effScaleMaxPct) * 100)}%`;
    });
    if (o.tip) tip(el, o.tip);
    return el;
  }

  // ---------- 알람 수집 ----------
  function collectAlarms() {
    const list = [];
    for (let i = 1; i <= 6; i++) {
      const st = state.orc(i);
      if (st === "stop") list.push({ lv: "gray", t: `${ORC_NAME[i - 1]} 정지` });
      else if (st === "start") list.push({ lv: "info", t: `${ORC_NAME[i - 1]} 기동 중` });
      else if (st === "stopping") list.push({ lv: "warn", t: `${ORC_NAME[i - 1]} 정지 중` });
    }
    ["A", "B", "C"].forEach((c, k) => {
      const st = state.coolPump(k + 1);
      if (st === "fault") list.push({ lv: "fault", t: `냉각펌프 ${c} 고장` });
      else if (st === "stop") list.push({ lv: "warn", t: `냉각펌프 ${c} 정지` });
    });
    [1, 2].forEach((n) => { if (state.hotPump(n) === "stop") list.push({ lv: "gray", t: `중온수펌프 M${n} 정지` }); });
    if (state.lockout("vcb.lockout.01") === "fault") list.push({ lv: "fault", t: "VCB 록아웃 동작" });
    if (state.lockout("acb.lockout.01") === "fault") list.push({ lv: "fault", t: "ACB 록아웃 동작" });
    const lost = GROUPS.filter((g) => g.ids.some((id) => P[id].kind === "physical") && g.ids.filter((id) => P[id].kind === "physical").every((id) => val(id) === null));
    lost.forEach((g) => list.push({ lv: "gray", t: `${g.title} 통신 없음` }));
    const order = { fault: 0, warn: 1, info: 2, gray: 3 };
    return list.sort((a, b) => order[a.lv] - order[b.lv]);
  }
  function mountAlarmBar(host) {
    const bar = document.createElement("div");
    bar.className = "alarm-bar card";
    host.appendChild(bar);
    onRender(() => {
      const a = collectAlarms();
      bar.innerHTML = '<span class="ab-title">설비 알림</span>' + (a.length
        ? a.map((x) => `<span class="alarm-chip ${x.lv}"><span class="d"></span>${x.t}</span>`).join("")
        : '<span class="ok">● 모든 설비 정상 운전 중</span>');
    });
  }

  // ---------- 페이지 이동 ----------
  function mountNav(host, active) {
    const nav = document.createElement("nav");
    nav.className = "page-nav";
    [["overview", "전체 구성", "overview.html"], ["detail", "ORC 상세", "orc-detail.html?unit=1"], ["verify", "열량 검증", "verify.html"]]
      .forEach(([k, t, href]) => {
        const a = document.createElement("a");
        a.href = href; a.textContent = t;
        if (k === active) a.className = "on";
        nav.appendChild(a);
      });
    host.appendChild(nav);
  }

  // ---------- 이력 (일 · 월 · 연) ----------
  /**
   * fn({ ids, period, start }) → { 포인트ID: [{ t, v, n }] } (또는 Promise). 실연동 시 EMS 이력 조회로 교체
   *  period "day"   : start = 그날 00시, 15분 96칸 (v = 15분 값, n = 1)
   *  period "month" : start = 그달 1일 00시, 일 단위 칸
   *  period "year"  : start = 그해 1월 1일 00시, 월 단위 칸
   *  월·연 칸의 v = 열량·발전량은 합계, 온도·출력·효율 등 순시값은 평균. n = 칸에 들어간 15분 개수 (없으면 v = null)
   */
  let historyProvider = (req) => (window.OrcMock ? window.OrcMock.history(scenario(), req) : {});
  function setHistoryProvider(fn) { historyProvider = fn; }
  async function history(req) {
    const r = historyProvider(req);
    return r && typeof r.then === "function" ? await r : r;
  }

  // ---------- 시연 시나리오 ----------
  const SC_KEY = "orcviz.scenario";
  function scenario() { return localStorage.getItem(SC_KEY) || "normal"; }
  function mountDemoBar(host) {
    if (!window.OrcMock || provider !== mockProvider) return;
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = '<span class="tag">시연용</span>';
    for (const [k, sc] of Object.entries(window.OrcMock.SCENARIOS)) {
      const b = document.createElement("button");
      b.className = "pill-btn" + (k === scenario() ? " on" : "");
      b.textContent = sc.title;
      b.onclick = () => {
        localStorage.setItem(SC_KEY, k);
        bar.querySelectorAll(".pill-btn").forEach((x) => x.classList.toggle("on", x === b));
        refresh();
      };
      bar.appendChild(b);
    }
    host.appendChild(bar);
  }
  function mockProvider(t) { return window.OrcMock.snapshot(scenario(), t); }

  // ---------- 루프 ----------
  function onRender(fn) { renderers.push(fn); }
  function renderAll() {
    for (const fn of renderers) { try { fn(); } catch (e) { console.error(e); } }
    runBinders();
    if (tipFn && tipEl && tipEl.classList.contains("show")) drawTip();
  }
  async function refresh() {
    const r = provider(tick++);
    snap = r && typeof r.then === "function" ? await r : r;
    renderAll();
  }
  function start() {
    refresh();
    setInterval(refresh, config.refreshMs);
  }
  function setProvider(fn) { provider = fn; }
  provider = mockProvider;

  function latestTs() {
    let t = 0;
    for (const id in snap) if (val(id) !== null) t = Math.max(t, snap[id].ts);
    return t;
  }

  window.OrcViz = {
    config, P, STATE_LABEL, STATE_COLOR, ORC_NAME, CONTAINER,
    val, today, ratioPct, fmt, unitOf, sum, diffPct, hhmm, latestTs, nOp, u2,
    state, orcFlowing,
    s, defs, pipe, setFlow, fan, pumpIcon, genIcon, battery, statePill, setState, scenario,
    bind, tip, onRender, renderAll, kpi, pointText,
    mountPointTable, mountAlarmBar, mountDemoBar, mountNav, collectAlarms,
    setProvider, setHistoryProvider, history, start, refresh,
    MCAL_TO_KWH: 1.16222,
  };
})();
