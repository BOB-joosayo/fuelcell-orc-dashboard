/* 샘플 ② ORC 1대 상세: 중온수 → 증발기 → 터빈·발전기 → 응축기 → 사이클 펌프, 냉각수 ↔ 드라이쿨러. 현장 수신값만 표시 */
(function () {
  const V = window.OrcViz, s = V.s, val = V.val, fmt = V.fmt, u2 = V.u2;
  const q = new URLSearchParams(location.search);
  const n = Math.min(6, Math.max(1, parseInt(q.get("unit") || "1", 10) || 1));
  const u = u2(n);
  const c = Math.floor((n - 1) / 2);
  const CN = V.CONTAINER[n - 1];
  const id = (code) => `orc.${code}.${u}`;

  V.mountNav(document.getElementById("nav"), "detail");
  document.title = `${V.ORC_NAME[n - 1]} 상세 · 연료전지 폐열 ORC`;
  document.getElementById("title").textContent = `ORC${n} 상세`;
  document.getElementById("sub").textContent = `${V.ORC_NAME[n - 1]} · 컨테이너 ${CN} · 정격 ${V.config.ratedKw} kW`;

  // ---------- 호기 탭 ----------
  const tabs = document.getElementById("tabs");
  const tabEls = [];
  for (let k = 1; k <= 6; k++) {
    const a = document.createElement("a");
    a.className = "pill-btn unit-tab" + (k === n ? " on" : "");
    a.href = `orc-detail.html?unit=${k}`;
    a.style.textDecoration = "none";
    a.innerHTML = `<span class="d"></span>ORC${k}`;
    tabs.appendChild(a);
    tabEls.push(a);
  }
  const headPill = document.getElementById("state-pill");

  // ---------- KPI ----------
  const kpis = document.getElementById("kpis");
  const dHot = () => { const a = val(id("hw_supply_temp")), b = val(id("hw_return_temp")); return a === null || b === null ? null : a - b; };
  const dCool = () => { const a = val(id("cw_return_temp")), b = val(id("cw_supply_temp")); return a === null || b === null ? null : a - b; };
  const loadPct = () => { const kw = val(id("output_kw")); return kw === null ? null : (kw / V.config.ratedKw) * 100; };

  V.kpi(kpis, {
    title: "오늘 발전량", unit: "kWh", d: 0, value: () => V.today(id("energy_15m")),
    sub: () => `현재 출력 <b>${fmt(val(id("output_kw")), 1)}</b> kW · 부하율 <b>${fmt(loadPct(), 0)}%</b>`,
    tip: () => ({ title: "발전량", rows: [{ l: "오늘 발전량", id: `${id("energy_15m")}@today`, d: 0 }, { l: "현재 출력", id: id("output_kw") }] }),
  });
  V.kpi(kpis, {
    title: "발전량 (최근 15분)", unit: "kWh", d: 1, value: () => val(id("energy_15m")),
    sub: () => `누적 <b>${fmt(val(id("energy_total")), 0)}</b> kWh`,
    tip: () => ({ title: "발전량", rows: [{ l: "15분 발전량", id: id("energy_15m"), d: 2 }, { l: "누적 발전량", id: id("energy_total"), d: 0 }] }),
  });
  V.kpi(kpis, {
    title: "효율", unit: "%", d: 1, value: () => val(id("elec_eff")), effBar: true,
    sub: () => `정격 ${V.config.ratedKw} kW`,
    tip: () => ({ title: "효율", rows: [{ l: "효율", id: id("elec_eff") }, { l: "현재 출력", id: id("output_kw") }] }),
  });
  V.kpi(kpis, {
    title: "중온수 온도차", unit: "℃", d: 1, value: dHot,
    sub: () => `입구 <b style="color:#ff5722">${fmt(val(id("hw_supply_temp")), 1)}</b> → 출구 <b style="color:#ffc145">${fmt(val(id("hw_return_temp")), 1)}</b> ℃`,
    tip: () => ({ title: "중온수", rows: [{ l: "ORC 입구 온도", id: id("hw_supply_temp") }, { l: "ORC 출구 온도", id: id("hw_return_temp") }] }),
  });
  V.kpi(kpis, {
    title: "냉각수 온도차", unit: "℃", d: 1, value: dCool,
    sub: () => `공급 <b style="color:#4dabf7">${fmt(val(id("cw_supply_temp")), 1)}</b> → 환수 <b style="color:#20c997">${fmt(val(id("cw_return_temp")), 1)}</b> ℃`,
    tip: () => ({ title: "냉각수", rows: [{ l: "냉각수 공급 온도", id: id("cw_supply_temp") }, { l: "냉각수 환수 온도", id: id("cw_return_temp") }, { l: `냉각펌프 ${CN}`, t: () => V.STATE_LABEL[V.state.coolPump(c + 1)] }] }),
  });

  // ---------- SVG ----------
  const svg = document.getElementById("dt-svg");
  const defs = V.defs(svg);
  const grad = (gid, y1, y2, c1, c2) => {
    const g = s("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1, y2 }, defs);
    s("stop", { offset: "0%", "stop-color": c1 }, g);
    s("stop", { offset: "100%", "stop-color": c2 }, g);
  };
  // 코일 냉매: 증발기는 아래(액체) → 위(고압 증기), 응축기는 위(저압 증기) → 아래(액체)
  grad("g-evap", 430, 170, "#5c7cfa", "#e64980");
  grad("g-cond", 170, 430, "#fcc2d7", "#5c7cfa");
  // 셸 쪽 유체: 중온수는 위에서 들어와 식으며 아래로, 냉각수는 아래에서 들어와 데워지며 위로
  grad("g-evap-shell", 200, 400, "#ff5722", "#ffc145");
  grad("g-cond-shell", 400, 200, "#4dabf7", "#20c997");
  const gPipe = s("g", {}, svg);
  const gEq = s("g", {}, svg);

  s("rect", { x: 430, y: 20, width: 760, height: 560, rx: 14, class: "zone" }, gPipe);
  s("text", { x: 450, y: 46, class: "t-label", text: V.ORC_NAME[n - 1] }, gPipe);

  V.pipe(gPipe, "M290 220 H480", "hot", "h-in");
  V.pipe(gPipe, "M480 380 H290", "hot-r", "h-out");
  V.pipe(gPipe, "M525 150 V100 H720", "vap", "rf");
  V.pipe(gPipe, "M860 130 H1095 V150", "vap-lp", "rf");
  V.pipe(gPipe, "M1095 450 V530 H660", "liq", "rf");
  V.pipe(gPipe, "M660 530 H525 V450", "liq", "rf");
  V.pipe(gPipe, "M1140 220 H1320", "cool-r", "cw");
  V.pipe(gPipe, "M1320 380 H1140", "cool", "cw");

  s("text", { x: 560, y: 90, class: "t-small t-vap", style: "font-weight:700", text: "고압 증기" }, gPipe);
  s("text", { x: 960, y: 120, class: "t-small", style: "fill:#fcc2d7;font-weight:700", text: "저압 증기" }, gPipe);
  s("text", { x: 820, y: 520, class: "t-small", style: "fill:#91a7ff;font-weight:700", text: "액체 냉매" }, gPipe);

  // 배관 값 라벨
  const tag = (x, y, label, fn, cls, color) => {
    s("text", { x, y, class: "t-small", style: `fill:${color};font-weight:700`, text: label }, gEq);
    return V.bind(s("text", { x, y: y + 24, class: `t-val ${cls || ""}`, style: "font-size:20px" }, gEq), fn);
  };
  tag(305, 180, "중온수 입구", () => `${fmt(val(id("hw_supply_temp")), 1)} ℃`, "t-hot", "#ff5722");
  tag(305, 405, "중온수 출구", () => `${fmt(val(id("hw_return_temp")), 1)} ℃`, "t-hot-r", "#ffc145");
  V.bind(s("text", { x: 385, y: 306, "text-anchor": "middle", class: "t-label" }, gEq), () => `ΔT ${fmt(dHot(), 1)}℃`);
  tag(1160, 180, "냉각수 환수", () => `${fmt(val(id("cw_return_temp")), 1)} ℃`, "t-cool-r", "#20c997");
  tag(1160, 405, "냉각수 공급", () => `${fmt(val(id("cw_supply_temp")), 1)} ℃`, "t-cool", "#4dabf7");
  V.bind(s("text", { x: 1230, y: 306, "text-anchor": "middle", class: "t-label" }, gEq), () => `ΔT ${fmt(dCool(), 1)}℃`);

  // 열원 (연료전지)
  const src = s("g", { class: "eq", style: "cursor:default" }, gEq);
  s("rect", { x: 30, y: 150, width: 260, height: 300, rx: 12, class: "frame", style: "stroke:#3a3a40" }, src);
  s("text", { x: 50, y: 182, class: "t-title", text: "수소연료전지" }, src);
  s("text", { x: 50, y: 200, class: "t-small", text: "#1 + #2 중온수" }, src);
  const srcRows = [
    ["#1 공급 온도", () => `${fmt(val("fc.hw_supply_temp.01"), 1)} ℃`, "t-hot"],
    ["#2 공급 온도", () => `${fmt(val("fc.hw_supply_temp.02"), 1)} ℃`, "t-hot"],
    ["통합 환수 온도", () => `${fmt(val("fc.hw_return_temp.00"), 1)} ℃`, "t-hot-r"],
    ["열량 순시", () => `${fmt(V.sum(["fc.heat_rate.01", "fc.heat_rate.02"]), 2)} Gcal/h`, ""],
    ["15분 열량", () => `${fmt(val("fc.heat_site.00"), 0)} Mcal`, ""],
  ];
  srcRows.forEach(([l, fn, cls], k) => {
    s("text", { x: 50, y: 240 + k * 40, class: "t-small", text: l }, src);
    V.bind(s("text", { x: 274, y: 240 + k * 40, "text-anchor": "end", class: `t-val ${cls}` }, src), fn);
  });
  V.tip(src, () => ({
    title: "수소연료전지 중온수",
    rows: [
      { l: "#1 공급 온도", id: "fc.hw_supply_temp.01" }, { l: "#2 공급 온도", id: "fc.hw_supply_temp.02" }, { l: "통합 환수 온도", id: "fc.hw_return_temp.00" },
      { l: "#1 유량", id: "fc.hw_flow.01" }, { l: "#2 유량", id: "fc.hw_flow.02" },
      { l: "#1 열량 순시", id: "fc.heat_rate.01", d: 3 }, { l: "#2 열량 순시", id: "fc.heat_rate.02", d: 3 },
      { l: "통합 15분 열량", id: "fc.heat_site.00" },
    ],
  }));

  // ---------- ORC 내부 ----------
  const core = s("g", { class: "eq", style: "cursor:default" }, gEq);

  /**
   * 셸·코일 열교환기 (세로형, x ~ x+90, y 150 ~ 450)
   *  셸 쪽: 중온수(증발기) 위→아래 / 냉각수(응축기) 아래→위, 색이 식거나 데워지는 방향으로 변함
   *  코일: 냉매 나선 코일. 증발기 아래→위(액체→증기), 응축기 위→아래(증기→액체)
   */
  function heatExchanger(x, kind) {
    const evap = kind === "evap";
    const cx = x + 45, R = 31, E = 7, TURNS = 7, yA = 178, yB = 422;
    s("rect", { x, y: 150, width: 90, height: 300, rx: 12, class: "frame" }, core);
    s("rect", { x: x + 3, y: 153, width: 84, height: 294, rx: 10, fill: `url(#g-${kind}-shell)`, class: "hx-shell" }, core);
    [9, 24, 45, 66, 81].forEach((dx, k) => {
      const sx = x + dx;
      let d = "";
      const y0 = evap ? 160 : 440, dir = evap ? 1 : -1;
      for (let t = 0; t <= 28; t++) {
        const yy = y0 + dir * t * 10;
        const xx = sx + Math.sin(t * 0.9 + k) * 2.2;
        d += `${t ? "L" : "M"}${xx.toFixed(1)} ${yy}`;
      }
      const p = s("path", { d, class: "hx-stream", stroke: `url(#g-${kind}-shell)` }, core);
      p.style.animationDelay = `${(-k * 0.37).toFixed(2)}s`;
    });
    // 나선 코일: 냉매 흐름 방향(증발기 아래→위, 응축기 위→아래)으로 샘플링해 앞·뒤 반바퀴로 나눔
    const N = TURNS * 36, front = [], back = [];
    let seg = null, segFront = null;
    for (let k = 0; k <= N; k++) {
      const t = Math.PI / 2 + (k / N) * TURNS * 2 * Math.PI;
      const f = k / N;
      const ty = evap ? yB - f * (yB - yA) : yA + f * (yB - yA);
      const px = cx + R * Math.cos(t), py = ty + E * Math.sin(t);
      const isFront = Math.sin(t) >= 0;
      const pt = `${px.toFixed(1)} ${py.toFixed(1)}`;
      if (isFront !== segFront) {
        if (seg) (segFront ? front : back).push(seg + `L${pt}`);
        seg = `M${pt}`;
        segFront = isFront;
      } else seg += ` L${pt}`;
    }
    (segFront ? front : back).push(seg);
    const stroke = `url(#g-${kind})`;
    const yIn = evap ? 450 : 150, yOut = evap ? 150 : 450;
    const lead = `M${cx} ${yIn} L${cx} ${evap ? yB + E : yA + E}`;
    const tail = `M${cx} ${evap ? yA + E : yB + E} L${cx} ${yOut}`;
    const frontD = `${lead} ${front.join(" ")} ${tail}`;
    s("path", { d: back.join(" "), class: "hx-coil-back", stroke }, core);
    s("path", { d: frontD, class: "hx-coil", stroke }, core);
    s("path", { d: frontD, class: "hx-coil-flow" }, core);
    const lx = evap ? x + 36 : x + 56, anchor = evap ? "end" : "start";
    s("text", { x: lx, y: 474, "text-anchor": anchor, class: "t-label", text: evap ? "증발기" : "응축기" }, core);
  }
  heatExchanger(480, "evap");
  heatExchanger(1050, "cond");

  // 터빈 · 발전기
  s("path", { d: "M720 80 L860 45 L860 155 L720 120 Z", class: "frame" }, core);
  s("text", { x: 790, y: 105, "text-anchor": "middle", class: "t-label", text: "터빈" }, core);
  s("line", { x1: 860, y1: 80, x2: 888, y2: 80, stroke: "#888", "stroke-width": 4 }, core);
  V.genIcon(core, 920, 80, 32);
  s("text", { x: 920, y: 38, "text-anchor": "middle", class: "t-small", text: "발전기" }, core);
  const kwT = s("text", { x: 966, y: 76 }, core);
  V.bind(s("tspan", { class: "t-big", style: "font-size:28px" }, kwT), () => fmt(V.today(id("energy_15m")), 0));
  s("tspan", { class: "t-unit", dx: 4, text: "kWh" }, kwT);
  V.bind(s("text", { x: 968, y: 98, class: "t-small" }, core), () => `오늘 발전량 · 현재 ${fmt(val(id("output_kw")), 1)} kW`);
  V.pumpIcon(core, 660, 530, 22, "#5c7cfa");
  s("text", { x: 660, y: 575, "text-anchor": "middle", class: "t-label", text: "사이클 펌프" }, core);
  const corePill = V.statePill(core, 1100, 32, 70);
  V.tip(core, () => ({
    title: V.ORC_NAME[n - 1], state: V.state.orc(n),
    rows: [
      { l: "운전 상태", id: id("state"), map: (v) => V.STATE_LABEL[{ 0: "stop", 1: "start", 2: "run", 3: "stopping" }[v]] },
      { l: "오늘 발전량", id: `${id("energy_15m")}@today`, d: 0 }, { l: "15분 발전량", id: id("energy_15m"), d: 2 }, { l: "누적 발전량", id: id("energy_total"), d: 0 },
      { l: "현재 출력", id: id("output_kw") },
      { l: "효율", id: id("elec_eff") },
    ],
  }));

  // 드라이쿨러
  const dc = s("g", { class: "eq" }, gEq);
  s("rect", { x: 1320, y: 150, width: 210, height: 300, rx: 12, class: "frame" }, dc);
  s("text", { x: 1425, y: 182, "text-anchor": "middle", class: "t-title", text: `드라이쿨러 ${n}` }, dc);
  V.fan(dc, 1425, 280, 58);
  const dcSt = s("text", { x: 1425, y: 385, "text-anchor": "middle", class: "t-label" }, dc);
  V.tip(dc, () => ({
    title: `드라이쿨러 ${n}`, state: V.state.coolPump(c + 1),
    rows: [
      { l: `냉각펌프 ${CN} 운전`, id: `cwpump.state.0${c + 1}`, map: (v) => (v === 1 ? "운전" : "정지") },
      { l: `냉각펌프 ${CN} 고장`, id: `cwpump.fault.0${c + 1}`, map: (v) => (v === 1 ? "고장" : "정상") },
      { l: "냉각수 공급 온도", id: id("cw_supply_temp") }, { l: "냉각수 환수 온도", id: id("cw_return_temp") },
    ],
  }));

  // ---------- 렌더 ----------
  V.onRender(() => {
    document.getElementById("recv").textContent = `최근 수신 ${V.hhmm(V.latestTs())} · 15분 주기`;
    const st = V.state.orc(n);
    V.setState(core, st, corePill);
    headPill.textContent = V.STATE_LABEL[st];
    headPill.style.background = V.STATE_COLOR[st];
    tabEls.forEach((t, k) => t.setAttribute("data-state", V.state.orc(k + 1)));

    const sp = { run: 1, start: 0.45, stopping: 0.35 }[st] || 1;
    V.setFlow("h-in", V.orcFlowing(st), sp);
    V.setFlow("h-out", V.orcFlowing(st), sp);
    V.setFlow("rf", V.orcFlowing(st), sp);

    const cp = V.state.coolPump(c + 1);
    V.setFlow("cw", cp === "run");
    V.setState(dc, cp === "run" ? "run" : cp === "nodata" ? "nodata" : cp === "fault" ? "fault" : "stop");
    dcSt.textContent = `냉각펌프 ${CN} · ${V.STATE_LABEL[cp]}`;
  });

  V.mountAlarmBar(document.getElementById("alarm"));
  V.mountDemoBar(document.getElementById("demo"));
  V.start();
})();
