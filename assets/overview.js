/* 샘플 ① 전체 구성: 연료전지 2기 → 중온수 헤더 → 컨테이너 A/B/C (ORC 6) → ACB → VCB → 계통. 현장 수신값만 표시 */
(function () {
  const V = window.OrcViz, s = V.s, val = V.val, fmt = V.fmt, u2 = V.u2;
  const CX = [400, 790, 1180];               // 컨테이너 A/B/C 왼쪽 x
  const CNAME = ["A", "B", "C"];
  const UNITS = [1, 2, 3, 4, 5, 6];
  const orcX = (i) => CX[Math.floor(i / 2)] + 20 + (i % 2) * 170;
  const outerX = (i) => CX[Math.floor(i / 2)] + (i % 2 === 0 ? 35 : 325);
  const elecX = (i) => CX[Math.floor(i / 2)] + (i % 2 === 0 ? 90 : 270);

  V.mountNav(document.getElementById("nav"), "overview");

  // ---------- KPI ----------
  const kpis = document.getElementById("kpis");
  const orcKwIds = UNITS.map((n) => `orc.output_kw.${u2(n)}`);
  const orcTodayIds = UNITS.map((n) => `orc.energy_15m.${u2(n)}@today`);
  const todayOrc = () => V.sum(orcTodayIds);
  const todayAcb = () => V.today("meter.energy_15m.01");
  /** ORC 효율 (현장 계측값)을 현재 출력으로 가중 평균 */
  const orcEff = () => {
    let w = 0, t = 0;
    UNITS.forEach((n) => {
      const e = val(`orc.elec_eff.${u2(n)}`), kw = val(`orc.output_kw.${u2(n)}`);
      if (e > 0 && kw > 0) { w += kw; t += e * kw; }
    });
    return w > 0 ? t / w : null;
  };
  const fcTot = () => {
    const v = [val("fc.total_eff.01"), val("fc.total_eff.02")].filter((x) => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const heatNow = () => V.sum(["fc.heat_rate.01", "fc.heat_rate.02"]);

  V.kpi(kpis, {
    title: "ORC 발전량 (오늘)", unit: "kWh", d: 0, value: todayOrc,
    sub: () => `현재 출력 <b>${fmt(V.sum(orcKwIds), 0)}</b> kW · 운전 <b>${V.nOp()}</b> / 6대`,
    tip: () => ({ title: "ORC 오늘 발전량", rows: orcTodayIds.map((id, i) => ({ l: V.ORC_NAME[i], id, d: 0 })) }),
  });
  V.kpi(kpis, {
    title: "송전량 (오늘)", unit: "kWh", d: 0, value: todayAcb,
    sub: () => `현재 송전 <b>${fmt(val("meter.active_power.01"), 0)}</b> kW`,
    tip: () => ({ title: "ACB 송전량", rows: [{ l: "오늘 송전량", id: "meter.energy_15m.01@today", d: 0 }, { l: "최근 15분", id: "meter.energy_15m.01", d: 1 }, { l: "현재 유효전력", id: "meter.active_power.01" }, { l: "누적 발전량", id: "meter.energy_total.01", d: 0 }] }),
  });
  V.kpi(kpis, {
    title: "ORC 효율", unit: "%", d: 1, value: orcEff, effBar: true,
    sub: () => `운전 중 ${V.nOp()}대 출력 가중 평균`,
    tip: () => ({ title: "ORC 효율", rows: UNITS.map((n, i) => ({ l: V.ORC_NAME[i], id: `orc.elec_eff.${u2(n)}` })) }),
  });
  V.kpi(kpis, {
    title: "연료전지 종합효율", unit: "%", d: 1, value: fcTot,
    sub: () => `#1 <b>${fmt(val("fc.total_eff.01"), 1)}</b>% · #2 <b>${fmt(val("fc.total_eff.02"), 1)}</b>%`,
    tip: () => ({
      title: "연료전지 효율",
      rows: [1, 2].map((n) => ({ l: `#${n} 발전 / 열 / 종합`, t: () => `${fmt(val(`fc.elec_eff.0${n}`), 1)} / ${fmt(val(`fc.heat_eff.0${n}`), 1)} / ${fmt(val(`fc.total_eff.0${n}`), 1)} %` })),
    }),
  });
  V.kpi(kpis, {
    title: "중온수 열량 (오늘)", unit: "Gcal", d: 1, value: () => { const v = V.today("fc.heat_site.00"); return v === null ? null : v / 1000; },
    sub: () => `현재 <b>${fmt(heatNow(), 2)}</b> Gcal/h`,
    tip: () => ({
      title: "중온수 열량",
      rows: [
        { l: "#1 오늘", id: "fc.heat_site.01@today", d: 0 }, { l: "#2 오늘", id: "fc.heat_site.02@today", d: 0 },
        { l: "#1 순시", id: "fc.heat_rate.01", d: 3 }, { l: "#2 순시", id: "fc.heat_rate.02", d: 3 },
      ],
    }),
  });
  V.kpi(kpis, {
    title: "외기 온도", unit: "℃", d: 1, value: () => val("env.outdoor_temp.01"),
    sub: () => `연료전지 가동 <b>${fmt(V.sum(["fc.running_units.01", "fc.running_units.02"]), 0)}</b>기`,
    tip: () => ({ title: "외기", rows: [{ l: "외기 온도", id: "env.outdoor_temp.01" }, { l: "연료전지 #1 가동", id: "fc.running_units.01", d: 0 }, { l: "연료전지 #2 가동", id: "fc.running_units.02", d: 0 }] }),
  });

  // ---------- SVG ----------
  const svg = document.getElementById("ov-svg");
  V.defs(svg);
  const gPipe = s("g", {}, svg);
  const gEq = s("g", {}, svg);

  CX.forEach((L, c) => {
    s("rect", { x: L, y: 105, width: 360, height: 495, rx: 12, class: "zone" }, gPipe);
    s("text", { x: L + 180, y: 126, "text-anchor": "middle", class: "t-label", text: `컨테이너 ${CNAME[c]}` }, gPipe);
  });

  // 중온수 공급: 연료전지 단자 → 공급 헤더 → ORC
  V.pipe(gPipe, "M330 120 H355 V70", "hot", "hs-fc1");
  V.pipe(gPipe, "M330 300 H355 V120", "hot", "hs-fc2");
  V.pipe(gPipe, "M355 70 H1505", "hot", "hs-hdr");
  for (let i = 0; i < 6; i++) {
    V.pipe(gPipe, `M${outerX(i)} 70 V245`, "hot", `hs-${i}`);
    V.pipe(gPipe, `M${outerX(i)} 405 V660`, "hot-r", `hr-${i}`);
  }
  // 중온수 환수 → 펌프 M1/M2 (병렬) → 연료전지
  V.pipe(gPipe, "M1505 660 H380", "hot-r", "hr-hdr");
  V.pipe(gPipe, "M380 660 V640 H120 V660", "hot-r", "hp-1");
  V.pipe(gPipe, "M380 660 V690 H120 V660", "hot-r", "hp-2");
  V.pipe(gPipe, "M120 660 H12 V120 H30", "hot-r", "hr-riser");
  V.pipe(gPipe, "M12 300 H30", "hot-r", "hr-fc2");
  s("text", { x: 560, y: 58, class: "t-small t-hot", text: "중온수 공급" }, gPipe);
  s("text", { x: 1000, y: 684, class: "t-small t-hot-r", text: "중온수 환수" }, gPipe);

  // 냉각 루프: 드라이쿨러 → ORC 응축기 (공급) / ORC → 냉각펌프 → 드라이쿨러 (환수)
  CX.forEach((L, c) => {
    const k = `cw-${c}`;
    V.pipe(gPipe, `M${L + 80} 205 V245`, "cool", k);
    V.pipe(gPipe, `M${L + 280} 205 V245`, "cool", k);
    V.pipe(gPipe, `M${L + 140} 405 V480`, "cool-r", k);
    V.pipe(gPipe, `M${L + 220} 405 V480`, "cool-r", k);
    V.pipe(gPipe, `M${L + 180} 480 V222 H${L + 135} V205`, "cool-r", k);
    V.pipe(gPipe, `M${L + 180} 222 H${L + 225} V205`, "cool-r", k);
  });

  // 전력
  for (let i = 0; i < 6; i++) {
    const L = CX[Math.floor(i / 2)];
    V.pipe(gPipe, `M${elecX(i)} 405 V565 H${L + 180}`, "elec", `el-o${i}`);
  }
  CX.forEach((L, c) => V.pipe(gPipe, `M${L + 180} 565 V730`, "elec", `el-c${c}`));
  V.pipe(gPipe, "M580 730 H970", "elec", "el-bus-l");
  V.pipe(gPipe, "M1360 730 H970", "elec", "el-bus-r");
  V.pipe(gPipe, "M970 730 V770", "elec", "el-acb");
  V.pipe(gPipe, "M1040 792 H1110", "elec", "el-out");
  V.pipe(gPipe, "M1230 792 H1330", "elec", "el-out");
  s("text", { x: 600, y: 722, class: "t-small t-elec", text: "전력" }, gPipe);

  // ---------- 설비 ----------
  const kv = (g, x, y, label, fn, cls = "t-val", gap = 30) => {
    s("text", { x, y, class: "t-small", text: label }, g);
    return V.bind(s("text", { x: x + gap, y, class: cls }, g), fn);
  };

  // 연료전지 #1, #2 (건전지 외형 안에 정보)
  const fcEls = [1, 2].map((n) => {
    const y0 = n === 1 ? 40 : 220;
    const u = u2(n);
    const g = s("g", { class: "eq", style: "cursor:default" }, gEq);
    V.battery(g, 30, y0, 300, 160);
    s("text", { x: 52, y: y0 + 30, class: "t-title", text: `연료전지 #${n}` }, g);
    const pill = V.statePill(g, 244, y0 + 15, 60);
    kv(g, 52, y0 + 62, "가동", () => `${fmt(val(`fc.running_units.${u}`), 0)} 기`);
    kv(g, 176, y0 + 62, "발전", () => `${fmt(val(`fc.output_kw.${u}`), 0)} kW`);
    kv(g, 52, y0 + 86, "공급", () => `${fmt(val(`fc.hw_supply_temp.${u}`), 1)} ℃`, "t-val t-hot");
    kv(g, 176, y0 + 86, "환수", () => `${fmt(val(`fc.hw_return_temp.${u}`), 1)} ℃`, "t-val t-hot-r");
    kv(g, 52, y0 + 110, "유량", () => `${fmt(val(`fc.hw_flow.${u}`), 1)} ㎥/h`);
    kv(g, 176, y0 + 110, "열량", () => `${fmt(val(`fc.heat_rate.${u}`), 2)} Gcal/h`);
    s("line", { x1: 52, x2: 304, y1: y0 + 122, y2: y0 + 122, stroke: "#2c2c31" }, g);
    kv(g, 52, y0 + 144, "15분 열량", () => `${fmt(val(`fc.heat_site.${u}`), 0)} Mcal`, "t-val", 58);
    kv(g, 186, y0 + 144, "종합효율", () => `${fmt(val(`fc.total_eff.${u}`), 1)} %`, "t-val", 54);
    V.tip(g, () => ({
      title: `연료전지 #${n}`, state: V.state.fc(n),
      rows: [
        { l: "가동 대수", id: `fc.running_units.${u}`, map: (v) => `${fmt(v, 0)} 기` },
        { l: "발전 출력", id: `fc.output_kw.${u}`, d: 0 },
        { l: "중온수 공급 / 환수", t: () => `${fmt(val(`fc.hw_supply_temp.${u}`), 1)} / ${fmt(val(`fc.hw_return_temp.${u}`), 1)} ℃` },
        { l: "중온수 유량", id: `fc.hw_flow.${u}` },
        { l: "열량 순시", id: `fc.heat_rate.${u}`, d: 3 },
        { l: "15분 열량", id: `fc.heat_site.${u}` },
        { l: "열량 적산", id: `fc.heat_total.${u}`, d: 0 },
        { l: "발전 / 열 / 종합 효율", t: () => `${fmt(val(`fc.elec_eff.${u}`), 1)} / ${fmt(val(`fc.heat_eff.${u}`), 1)} / ${fmt(val(`fc.total_eff.${u}`), 1)} %` },
      ],
    }));
    return { g, pill };
  });

  // 중온수 순환 계통 계측
  {
    const g = s("g", { class: "eq", style: "cursor:default" }, gEq);
    s("rect", { x: 30, y: 400, width: 300, height: 190, rx: 10, class: "frame", style: "stroke:#3a3a40" }, g);
    s("text", { x: 46, y: 425, class: "t-title", text: "중온수 순환 계통" }, g);
    const rows = [
      ["공급 압력", "hwpump.hw_supply_press.01", 2, "t-val"], ["펌프 흡입 압력", "hwpump.suction_press.01", 2, "t-val"], ["펌프 토출 압력", "hwpump.discharge_press.01", 2, "t-val"],
      ["펌프 출구 환수 온도", "hwpump.hw_return_temp.01", 1, "t-val t-hot-r"], ["연료전지 유입 환수 온도", "fc.hw_return_temp.00", 1, "t-val t-hot-r"],
    ];
    rows.forEach(([l, id, d, cls], k) => {
      s("text", { x: 46, y: 455 + k * 26, class: "t-small", text: l }, g);
      V.bind(s("text", { x: 314, y: 455 + k * 26, "text-anchor": "end", class: cls }, g), () => `${fmt(val(id), d)} ${V.unitOf(id)}`);
    });
    V.tip(g, () => ({ title: "중온수 순환 계통", rows: rows.map(([l, id, d]) => ({ l, id, d })) }));
  }

  // 중온수펌프 M1, M2
  const hpEls = [1, 2].map((n) => {
    const y = n === 1 ? 640 : 690;
    const g = s("g", { class: "eq" }, gEq);
    V.pumpIcon(g, 300, y, 15, "#ffc145");
    V.bind(s("text", { x: 132, y: n === 1 ? y - 9 : y + 24, class: "t-small" }, g), () => `중온수펌프 M${n} · ${fmt(val(`hwpump.pump_current.0${n}`), 1)} A`);
    V.tip(g, () => ({ title: `중온수펌프 M${n}`, state: V.state.hotPump(n), rows: [{ l: "전류", id: `hwpump.pump_current.0${n}` }] }));
    return { g };
  });

  // 드라이쿨러, ORC, 냉각펌프
  const dcEls = [], orcEls = [], cpEls = [];
  CX.forEach((L, c) => {
    for (let j = 0; j < 2; j++) {
      const i = c * 2 + j, x = L + 55 + j * 140, y = 140, u = u2(i + 1);
      const g = s("g", { class: "eq" }, gEq);
      s("rect", { x, y, width: 115, height: 65, rx: 8, class: "frame" }, g);
      V.fan(g, x + 22, y + 32, 14);
      s("text", { x: x + 40, y: y + 37, class: "t-label", style: "font-size:11.5px;letter-spacing:-.3px", text: `드라이쿨러 ${i + 1}` }, g);
      V.tip(g, () => ({
        title: `드라이쿨러 ${i + 1}`, state: dcState(c),
        rows: [{ l: "냉각수 공급", id: `orc.cw_supply_temp.${u}` }, { l: "냉각수 환수", id: `orc.cw_return_temp.${u}` }, { l: `냉각펌프 ${CNAME[c]}`, t: () => V.STATE_LABEL[V.state.coolPump(c + 1)] }],
      }));
      dcEls.push({ g, c });
    }
    for (let j = 0; j < 2; j++) {
      const i = c * 2 + j, x = orcX(i), y = 245, u = u2(i + 1);
      const g = s("g", { class: "eq" }, gEq);
      s("rect", { x, y, width: 150, height: 160, rx: 10, class: "frame" }, g);
      s("text", { x: x + 12, y: y + 24, class: "t-title", text: `ORC${i + 1}` }, g);
      s("text", { x: x + 12, y: y + 40, class: "t-small", text: V.ORC_NAME[i].replace("ORC", "") }, g);
      const pill = V.statePill(g, x + 84, y + 10, 56);
      V.genIcon(g, x + 30, y + 68, 17);
      const big = s("text", { x: x + 54, y: y + 72 }, g);
      V.bind(s("tspan", { class: "t-big", style: "font-size:21px" }, big), () => fmt(V.today(`orc.energy_15m.${u}`), 0));
      s("tspan", { class: "t-unit", dx: 2, text: "kWh" }, big);
      s("text", { x: x + 55, y: y + 88, class: "t-small", style: "font-size:10.5px", text: "오늘 발전량" }, g);
      V.bind(s("text", { x: x + 12, y: y + 110, class: "t-small" }, g), () => `현재 ${fmt(val(`orc.output_kw.${u}`), 0)} kW`);
      V.bind(s("text", { x: x + 138, y: y + 110, "text-anchor": "end", class: "t-small" }, g), () => `${fmt(loadPct(i), 0)}%`);
      s("rect", { x: x + 12, y: y + 116, width: 126, height: 6, rx: 3, fill: "#2a2a2f" }, g);
      const bar = s("rect", { x: x + 12, y: y + 116, width: 0, height: 6, rx: 3, fill: "#2fbf71" }, g);
      s("text", { x: x + 12, y: y + 143, class: "t-small", text: "효율" }, g);
      V.bind(s("text", { x: x + 138, y: y + 143, "text-anchor": "end", class: "t-val" }, g), () => `${fmt(val(`orc.elec_eff.${u}`), 1)} %`);
      g.addEventListener("click", () => { location.href = `orc-detail.html?unit=${i + 1}`; });
      V.tip(g, () => ({
        title: `${V.ORC_NAME[i]} · 컨테이너 ${CNAME[c]}`, state: V.state.orc(i + 1),
        rows: [
          { l: "오늘 발전량", id: `orc.energy_15m.${u}@today`, d: 0 }, { l: "15분 발전량", id: `orc.energy_15m.${u}`, d: 2 }, { l: "누적 발전량", id: `orc.energy_total.${u}`, d: 0 },
          { l: "현재 출력", id: `orc.output_kw.${u}` },
          { l: "효율", id: `orc.elec_eff.${u}` },
          { l: "중온수 입구 / 출구", t: () => `${fmt(val(`orc.hw_supply_temp.${u}`), 1)} / ${fmt(val(`orc.hw_return_temp.${u}`), 1)} ℃` },
          { l: "냉각수 공급 / 환수", t: () => `${fmt(val(`orc.cw_supply_temp.${u}`), 1)} / ${fmt(val(`orc.cw_return_temp.${u}`), 1)} ℃` },
        ],
      }));
      orcEls.push({ g, pill, bar, i });
    }
    {
      const x = L + 105, y = 480, k = c + 1;
      const g = s("g", { class: "eq" }, gEq);
      s("rect", { x, y, width: 150, height: 60, rx: 8, class: "frame" }, g);
      V.pumpIcon(g, x + 26, y + 36, 14, "#20c997");
      s("text", { x: x + 52, y: y + 26, class: "t-label", text: `냉각펌프 ${CNAME[c]}` }, g);
      const st = s("text", { x: x + 52, y: y + 45, class: "t-small" }, g);
      V.tip(g, () => ({
        title: `냉각펌프 ${CNAME[c]}`, state: V.state.coolPump(k),
        rows: [{ l: "운전 상태", id: `cwpump.state.0${k}`, map: (v) => (v === 1 ? "운전" : "정지") }, { l: "고장 상태", id: `cwpump.fault.0${k}`, map: (v) => (v === 1 ? "고장" : "정상") }],
      }));
      cpEls.push({ g, st, k });
    }
  });

  // ACB / VCB / 계통
  const acb = s("g", { class: "eq" }, gEq);
  s("rect", { x: 900, y: 770, width: 140, height: 46, rx: 8, class: "frame" }, acb);
  s("text", { x: 914, y: 789, class: "t-label", text: "ACB" }, acb);
  V.bind(s("text", { x: 1028, y: 789, "text-anchor": "end", class: "t-val t-elec" }, acb), () => `${fmt(val("meter.active_power.01"), 0)} kW`);
  V.bind(s("text", { x: 914, y: 807, class: "t-small" }, acb), () => `오늘 ${fmt(todayAcb(), 0)} kWh`);
  V.tip(acb, () => ({
    title: "ACB (LV)", state: V.state.lockout("acb.lockout.01") === "fault" ? "fault" : val("meter.active_power.01") > 0 ? "run" : "stop",
    rows: [
      { l: "유효전력", id: "meter.active_power.01" }, { l: "오늘 송전량", id: "meter.energy_15m.01@today", d: 0 }, { l: "15분 발전량", id: "meter.energy_15m.01", d: 2 }, { l: "누적 발전량", id: "meter.energy_total.01", d: 0 }, { l: "역률", id: "meter.power_factor.01" },
      { l: "선간전압 RS / ST / TR", t: () => `${fmt(val("meter.volt_rs.01"), 1)} / ${fmt(val("meter.volt_st.01"), 1)} / ${fmt(val("meter.volt_tr.01"), 1)} V` },
      { l: "전류 R / S / T", t: () => `${fmt(val("meter.current_r.01"), 0)} / ${fmt(val("meter.current_s.01"), 0)} / ${fmt(val("meter.current_t.01"), 0)} A` },
      { l: "ACB 록아웃 릴레이", id: "acb.lockout.01", map: (v) => (v === 1 ? "동작(트립)" : "정상") },
    ],
  }));
  const vcb = s("g", { class: "eq" }, gEq);
  s("rect", { x: 1110, y: 770, width: 120, height: 46, rx: 8, class: "frame" }, vcb);
  s("text", { x: 1124, y: 789, class: "t-label", text: "VCB" }, vcb);
  V.bind(s("text", { x: 1124, y: 807, class: "t-small" }, vcb), () => `록아웃 ${V.state.lockout("vcb.lockout.01") === "fault" ? "동작" : "정상"}`);
  V.tip(vcb, () => ({ title: "VCB (HV-01)", state: V.state.lockout("vcb.lockout.01"), rows: [{ l: "록아웃 릴레이 (86)", id: "vcb.lockout.01", map: (v) => (v === 1 ? "동작(트립)" : "정상") }] }));
  s("text", { x: 1340, y: 797, class: "t-label", text: "한전 계통" }, gEq);

  // ---------- 상태 계산 ----------
  function dcState(c) {
    const st = V.state.coolPump(c + 1);
    return st === "run" ? "run" : st === "nodata" ? "nodata" : "stop";
  }
  function loadPct(i) {
    const kw = val(`orc.output_kw.${u2(i + 1)}`);
    return kw === null ? null : (kw / V.config.ratedKw) * 100;
  }

  V.onRender(() => {
    document.getElementById("recv").textContent = `최근 수신 ${V.hhmm(V.latestTs())} · 15분 주기`;

    const f1 = val("fc.hw_flow.01") || 0, f2 = val("fc.hw_flow.02") || 0;
    fcEls.forEach((f, k) => V.setState(f.g, V.state.fc(k + 1), f.pill));
    V.setFlow("hs-fc1", f1 + f2 > 0, (f1 + f2) / 300);
    V.setFlow("hs-fc2", f2 > 0, f2 / 150);
    V.setFlow("hs-hdr", f1 + f2 > 0, (f1 + f2) / 300);

    const hp = [1, 2].map((n) => V.state.hotPump(n));
    hpEls.forEach((h, k) => V.setState(h.g, hp[k]));
    V.setFlow("hp-1", hp[0] === "run");
    V.setFlow("hp-2", hp[1] === "run");
    const anyHp = hp.includes("run");
    V.setFlow("hr-hdr", anyHp && f1 + f2 > 0);
    V.setFlow("hr-riser", anyHp);
    V.setFlow("hr-fc2", anyHp && f2 > 0);

    orcEls.forEach((o) => {
      const st = V.state.orc(o.i + 1);
      V.setState(o.g, st, o.pill);
      const sp = { run: 1, start: 0.5, stopping: 0.4 }[st] || 1;
      V.setFlow(`hs-${o.i}`, V.orcFlowing(st), sp);
      V.setFlow(`hr-${o.i}`, V.orcFlowing(st), sp);
      const lp = loadPct(o.i) || 0;
      o.bar.setAttribute("width", (126 * Math.min(lp, 100)) / 100);
      o.bar.setAttribute("fill", { run: "#2fbf71", start: "#4dabf7", stopping: "#f59f00" }[st] || "#4a4a52");
      const kw = val(`orc.output_kw.${u2(o.i + 1)}`) || 0;
      V.setFlow(`el-o${o.i}`, kw > 0, Math.max(kw / 130, 0.5));
    });

    cpEls.forEach((p) => {
      const st = V.state.coolPump(p.k);
      V.setState(p.g, st);
      p.st.textContent = V.STATE_LABEL[st];
      V.setFlow(`cw-${p.k - 1}`, st === "run");
    });
    dcEls.forEach((d) => V.setState(d.g, dcState(d.c)));

    const ckw = [0, 1, 2].map((c) => (val(`orc.output_kw.${u2(c * 2 + 1)}`) || 0) + (val(`orc.output_kw.${u2(c * 2 + 2)}`) || 0));
    ckw.forEach((kw, c) => V.setFlow(`el-c${c}`, kw > 0, Math.max(kw / 260, 0.5)));
    V.setFlow("el-bus-l", ckw[0] > 0, Math.max(ckw[0] / 260, 0.5));
    V.setFlow("el-bus-r", ckw[2] > 0, Math.max(ckw[2] / 260, 0.5));
    const acbKw = val("meter.active_power.01") || 0;
    V.setFlow("el-acb", acbKw > 0, Math.max(acbKw / 780, 0.5));
    V.setFlow("el-out", acbKw > 0, Math.max(acbKw / 780, 0.5));
    V.setState(acb, V.state.lockout("acb.lockout.01") === "fault" ? "fault" : acbKw > 0 ? "run" : "stop");
    V.setState(vcb, V.state.lockout("vcb.lockout.01"));
  });

  V.mountAlarmBar(document.getElementById("alarm"));
  V.mountPointTable(document.getElementById("points"));
  V.mountDemoBar(document.getElementById("demo"));
  V.start();
})();
