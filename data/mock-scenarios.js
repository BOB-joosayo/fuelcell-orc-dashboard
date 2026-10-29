/*
 * 시연용 가짜 데이터. 실제 연동 시 이 파일 대신 EMS 조회 결과를
 * { 포인트ID: { v: 화면단위 값, ts: epoch ms } } 형태로 OrcViz.setProvider()에 넘긴다.
 * 지표는 운영 화면과 같은 수식으로 계산한다.
 */
(function () {
  const ORC_IDS = ["01", "02", "03", "04", "05", "06"];
  const BASE_KW = [138, 134, 141, 129, 136, 132];
  const MAKER_EFF = [10.9, 10.6, 11.2, 10.3, 10.8, 10.5];
  const CONTAINER_OF = [0, 0, 1, 1, 2, 2];
  const ORC_LOAD = { 0: 0, 1: 0.28, 2: 1, 3: 0.22 };   // 상태별 정격 대비 출력

  const SCENARIOS = {
    normal: {
      title: "정상 운전",
      orc: [2, 2, 2, 2, 2, 2],
      coolPump: [{ run: 1, fault: 0 }, { run: 1, fault: 0 }, { run: 1, fault: 0 }],
      lost: [],
    },
    partial: {
      title: "부분 운전",
      orc: [2, 2, 2, 0, 1, 2],
      coolPump: [{ run: 1, fault: 0 }, { run: 1, fault: 0 }, { run: 1, fault: 0 }],
      lost: [],
    },
    fault: {
      title: "이상 발생",
      orc: [2, 2, 3, 3, 2, 2],
      coolPump: [{ run: 1, fault: 0 }, { run: 0, fault: 1 }, { run: 1, fault: 0 }],
      lost: [],
    },
    comm: {
      title: "통신 끊김",
      orc: [2, 2, 2, 2, 2, 2],
      coolPump: [{ run: 1, fault: 0 }, { run: 1, fault: 0 }, { run: 1, fault: 0 }],
      lost: ["fc.", "02"],
    },
  };

  const wobble = (tick, seed, pct) => 1 + Math.sin(tick * 0.9 + seed * 1.7) * pct + Math.sin(tick * 0.37 + seed) * pct * 0.5;
  const r = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

  function snapshot(key, tick) {
    const sc = SCENARIOS[key] || SCENARIOS.normal;
    const now = Date.now();
    const ts = Math.floor(now / 900000) * 900000;
    const out = {};
    const put = (id, v) => { out[id] = { v, ts }; };

    // 외기
    put("env.outdoor_temp.01", r(18.4 * wobble(tick, 1, 0.01), 1));

    // 연료전지 #1, #2
    const fc = [
      { id: "01", flow: 176, sup: 92.4, ret: 72.1, cnt: 9, kw: 3960, siteBias: 1.012, effE: 45.2 },
      { id: "02", flow: 152, sup: 91.6, ret: 71.8, cnt: 8, kw: 3520, siteBias: 0.991, effE: 44.8 },
    ];
    const fcHeatKw = [];
    // ORC가 덜 돌면 중온수 열을 덜 가져가 환수 온도가 오른다
    const orcLoad = sc.orc.reduce((a, s) => a + ORC_LOAD[s], 0) / 6;
    fc.forEach((f, i) => {
      const flow = f.flow * wobble(tick, 10 + i, 0.012);
      const sup = f.sup * wobble(tick, 20 + i, 0.002);
      const ret = (sup - (f.sup - f.ret) * orcLoad) * wobble(tick, 30 + i, 0.003);
      const heatKw = (flow * 1000 * 4.19 * (sup - ret)) / 3600;
      fcHeatKw.push(heatKw);
      const kw = f.kw * wobble(tick, 40 + i, 0.006);
      put(`fc.hw_flow.${f.id}`, r(flow, 1));
      put(`fc.hw_flow_total.${f.id}`, r(1234560 + i * 210000 + tick * flow / 1200, 0));
      put(`fc.hw_supply_temp.${f.id}`, r(sup, 1));
      put(`fc.hw_return_temp.${f.id}`, r(ret, 1));
      put(`fc.running_units.${f.id}`, f.cnt);
      put(`fc.output_kw.${f.id}`, r(kw, 0));
      put(`fc.heat_rate.${f.id}`, r(heatKw * 860 / 1e6 * f.siteBias, 3));
      put(`fc.heat_total.${f.id}`, r(18452.3 + i * 2310 + tick * 0.001, 1));
      const effT = ((heatKw * f.siteBias) / (kw / (f.effE / 100))) * 100;   // 현장 열효율 = 현장 열량 ÷ 연료 투입
      put(`fc.elec_eff.${f.id}`, r(f.effE, 1));
      put(`fc.heat_eff.${f.id}`, r(effT, 1));
      put(`fc.total_eff.${f.id}`, r(f.effE + effT, 1));
      put(`fc.heat_ems_kcal.${f.id}`, r(heatKw * 0.25 * 0.86, 1));            // Mcal / 15분
      put(`fc.heat_ems_kwh.${f.id}`, r(heatKw * 0.25, 1));                   // kWh / 15분
      put(`fc.heat_site.${f.id}`, r(heatKw * 0.25 * 0.86 * f.siteBias, 1)); // 현장 열량계 기준
    });

    // 온수 순환 계통
    put("hwpump.hw_supply_press.01", r(3.2 * wobble(tick, 50, 0.01), 2));
    put("hwpump.suction_press.01", r(2.1 * wobble(tick, 51, 0.01), 2));
    put("hwpump.discharge_press.01", r(4.4 * wobble(tick, 52, 0.01), 2));
    put("hwpump.hw_return_temp.01", r(72.0 * wobble(tick, 53, 0.002), 1));
    put("fc.hw_return_temp.00", r(71.9 * wobble(tick, 54, 0.002), 1));
    put("hwpump.pump_current.01", r(45.2 * wobble(tick, 55, 0.01), 1));
    put("hwpump.pump_current.02", r(44.6 * wobble(tick, 56, 0.01), 1));

    // 냉각펌프
    sc.coolPump.forEach((p, i) => {
      put(`cwpump.state.0${i + 1}`, p.run);
      put(`cwpump.fault.0${i + 1}`, p.fault);
    });

    // ORC
    const nOp = sc.orc.filter((s) => s === 2).length;
    let sumZ152 = 0;
    let sumKw = 0;
    ORC_IDS.forEach((u, i) => {
      const st = sc.orc[i];
      const factor = ORC_LOAD[st];
      const kw = BASE_KW[i] * factor * wobble(tick, 60 + i, 0.015);
      const cp = sc.coolPump[CONTAINER_OF[i]];
      const hotIn = 91.8 * wobble(tick, 70 + i, 0.002);
      const drop = { 0: 0.8, 1: 8.5, 2: 19.4 + i * 0.3, 3: 9.6 }[st];
      const coldSup = (cp.run ? 25.3 + CONTAINER_OF[i] * 0.4 : 33.8) * wobble(tick, 80 + i, 0.003);
      const coldRise = st === 0 ? 0.4 : cp.run ? 6.2 * factor + 0.3 : 1.1;
      sumKw += kw;
      const z152 = kw * 0.25;
      sumZ152 += z152;
      put(`orc.state.${u}`, st);
      put(`orc.output_kw.${u}`, r(kw, 1));
      put(`orc.elec_eff.${u}`, st === 2 ? r(MAKER_EFF[i] * wobble(tick, 90 + i, 0.01), 1) : 0);
      put(`orc.energy_total.${u}`, r(1186400 + i * 23170 + tick * kw / 1200, 0));
      put(`orc.energy_15m.${u}`, r(z152, 2));
      put(`orc.hw_supply_temp.${u}`, r(hotIn, 1));
      put(`orc.hw_return_temp.${u}`, r(hotIn - drop, 1));
      put(`orc.cw_supply_temp.${u}`, r(coldSup, 1));
      put(`orc.cw_return_temp.${u}`, r(coldSup + coldRise, 1));
    });

    // 통합 연료전지 (00)
    const totHeatKwh = (fcHeatKw[0] + fcHeatKw[1]) * 0.25;
    put("fc.heat_ems_kcal.00", r(out["fc.heat_ems_kcal.01"].v + out["fc.heat_ems_kcal.02"].v, 1));
    put("fc.heat_ems_kwh.00", r(out["fc.heat_ems_kwh.01"].v + out["fc.heat_ems_kwh.02"].v, 1));
    put("fc.heat_site.00", r(out["fc.heat_site.01"].v + out["fc.heat_site.02"].v, 1));

    // 호기별 효율(열량기준) = EMS 열량 기준, Gross·Net = 현장 열량 기준
    ORC_IDS.forEach((u) => {
      const z152 = out[`orc.energy_15m.${u}`].v;
      put(`orc.orc_eff.${u}`, totHeatKwh > 0 && nOp > 0 ? r((z152 * nOp) / totHeatKwh * 100, 2) : 0);
    });
    const siteHeatKwh = out["fc.heat_site.00"].v * 1.16222;
    put("fc.orc_eff.00", siteHeatKwh > 0 ? r(sumZ152 / siteHeatKwh * 100, 2) : 0);

    // ACB / 보호계전
    const acbKw = sumKw * 0.935;
    const v = [380.6, 381.2, 379.9].map((x, k) => x * wobble(tick, 100 + k, 0.002));
    const pf = 98.2;
    const amp = acbKw > 0 ? (acbKw * 1000) / (Math.sqrt(3) * v[0] * pf / 100) : 0;
    put("meter.active_power.01", r(acbKw, 1));
    put("meter.energy_total.01", r(6852100 + tick * acbKw / 1200, 0));
    put("meter.power_factor.01", acbKw > 0 ? pf : 0);
    put("meter.volt_rs.01", r(v[0], 1));
    put("meter.volt_st.01", r(v[1], 1));
    put("meter.volt_tr.01", r(v[2], 1));
    put("meter.current_r.01", r(amp * wobble(tick, 110, 0.004), 1));
    put("meter.current_s.01", r(amp * wobble(tick, 111, 0.004), 1));
    put("meter.current_t.01", r(amp * wobble(tick, 112, 0.004), 1));
    put("meter.energy_15m.01", r(acbKw * 0.25, 2));
    put("meter.orc_eff.01", siteHeatKwh > 0 ? r((acbKw * 0.25) / siteHeatKwh * 100, 2) : 0);
    put("vcb.lockout.01", 0);
    put("acb.lockout.01", 0);

    // 오늘(00시~현재) 누적: ID@today
    const h = Math.max(0.5, (now - new Date().setHours(0, 0, 0, 0)) / 3600000);
    const dayFactor = { 0: 0.55, 1: 0.5, 2: 0.97, 3: 0.85 };
    let todayOrc = 0;
    ORC_IDS.forEach((u, i) => {
      const e = BASE_KW[i] * h * dayFactor[sc.orc[i]];
      todayOrc += e;
      put(`orc.energy_15m.${u}@today`, r(e, 1));
    });
    put("meter.energy_15m.01@today", r(todayOrc * 0.935, 1));
    fc.forEach((f, i) => {
      const q = fcHeatKw[i] * h * 0.99;
      put(`fc.heat_ems_kwh.${f.id}@today`, r(q, 1));
      put(`fc.heat_ems_kcal.${f.id}@today`, r(q * 0.86, 1));
      put(`fc.heat_site.${f.id}@today`, r(q * 0.86 * f.siteBias, 1));
    });
    ["fc.heat_ems_kcal.", "fc.heat_ems_kwh.", "fc.heat_site."].forEach((c) => put(`${c}00@today`, r(out[`${c}01@today`].v + out[`${c}02@today`].v, 1)));

    // 통신 끊김: 해당 설비·호기 + 그 값을 쓰는 지표는 미수신
    if (sc.lost.length) {
      const [eq, unit] = sc.lost;
      const stale = ts - 2 * 3600 * 1000;
      Object.keys(out).forEach((id) => {
        const base = id.split("@")[0];
        if (base.startsWith(eq) && base.endsWith(unit)) out[id] = { v: null, ts: stale };
      });
      ["fc.heat_ems_kcal.00", "fc.heat_ems_kwh.00", "fc.heat_site.00", "fc.orc_eff.00", "meter.orc_eff.01",
        "fc.heat_ems_kcal.00@today", "fc.heat_ems_kwh.00@today", "fc.heat_site.00@today"].forEach((id) => { out[id] = { v: null, ts: stale }; });
      ORC_IDS.forEach((u) => { out[`orc.orc_eff.${u}`] = { v: null, ts: stale }; });
    }
    return out;
  }

  // ---------- 이력 (일 · 월 · 연) ----------
  const FC_HIST = {
    "01": { heat: 1040, bias: 1.012, kw: 3960, effE: 45.2 },
    "02": { heat: 876, bias: 0.991, kw: 3520, effE: 44.8 },
  };
  const SUM_CODES = new Set(["heat_ems_kcal", "heat_ems_kwh", "heat_site"]);
  const dayCache = new Map();

  /** 하루 96칸 15분 값 (연료전지 1기). 아직 안 온 칸·통신 끊김 칸은 null */
  function dayData(key, u, dayStart) {
    const ck = `${key}|${u}|${dayStart}`;
    const now = Date.now();
    const isToday = now - dayStart < 86400000;
    if (!isToday && dayCache.has(ck)) return dayCache.get(ck);
    const sc = SCENARIOS[key] || SCENARIOS.normal;
    const f = FC_HIST[u], un = Number(u);
    const di = Math.round(dayStart / 86400000);
    let dF = 1 + 0.025 * Math.sin(di / 6.3 + un) + 0.015 * Math.sin(di / 2.2 + 2 * un);
    if ((di * 7 + un * 13) % 53 === 0) dF = 0.35;   // 가끔 저부하 일
    const avail = Math.min(96, Math.floor((now - dayStart) / 900000));
    const out = { heat_ems_kwh: [], heat_ems_kcal: [], heat_site: [], output_kw: [], elec_eff: [], total_eff: [] };
    for (let k = 0; k < 96; k++) {
      const lost = isToday && sc.lost.length && u === sc.lost[1] && k >= avail - 8;
      if (k >= avail || lost) { for (const c in out) out[c].push(null); continue; }
      const load = 1 + 0.05 * Math.sin(k / 9 + un) + 0.02 * Math.sin(k / 2.3 + un * 3);
      const z204 = f.heat * load * dF;
      const z203 = z204 * 0.86;
      const drift = 1 + 0.006 * Math.sin(k / 5 + un) + 0.005 * Math.sin(di / 3.1 + un);
      const z056 = z203 * f.bias * drift;
      const e040 = f.kw * (0.985 + 0.015 * Math.sin(k / 7 + un)) * (dF < 0.5 ? 0.35 : 1);
      const h004 = f.effE + 0.25 * Math.sin(k / 11 + un) + 0.15 * Math.sin(di / 4 + un);
      const fuel = e040 / (h004 / 100);
      const h006 = h004 + ((z056 / 0.86) * 4 / fuel) * 100;
      out.heat_ems_kwh.push(z204); out.heat_ems_kcal.push(z203); out.heat_site.push(z056);
      out.output_kw.push(e040); out.elec_eff.push(h004); out.total_eff.push(h006);
    }
    if (!isToday) dayCache.set(ck, out);
    return out;
  }

  function slotsOf(key, code, unit, dayStart) {
    if (unit !== "00") return dayData(key, unit, dayStart)[code];
    if (!SUM_CODES.has(code)) return new Array(96).fill(null);
    const a = dayData(key, "01", dayStart)[code], b = dayData(key, "02", dayStart)[code];
    return a.map((x, k) => (x === null || b[k] === null ? null : x + b[k]));
  }
  function agg(code, arrs) {
    let s = 0, n = 0;
    for (const arr of arrs) for (const v of arr) if (v !== null) { s += v; n++; }
    if (!n) return { v: null, n: 0 };
    return { v: SUM_CODES.has(code) ? s : s / n, n };
  }
  const rd = (v) => (v === null ? null : Math.round(v * 100) / 100);

  /** req = { ids, period: "day"|"month"|"year", start } → { ID: [{ t, v, n }] } */
  function history(key, req) {
    const { ids, period, start } = req;
    const d0 = new Date(start);
    const now = Date.now();
    const days = (y, m) => new Date(y, m + 1, 0).getDate();
    const dayStarts = (y, m) => Array.from({ length: days(y, m) }, (_, i) => new Date(y, m, i + 1).getTime());
    const out = {};
    for (const id of ids) {
      const [, code, unit] = id.split(".");
      if (period === "day") {
        out[id] = slotsOf(key, code, unit, start).map((v, k) => ({ t: start + k * 900000, v: rd(v), n: v === null ? 0 : 1 }));
      } else if (period === "month") {
        out[id] = dayStarts(d0.getFullYear(), d0.getMonth()).map((t) => {
          if (t > now) return { t, v: null, n: 0 };
          const a = agg(code, [slotsOf(key, code, unit, t)]);
          return { t, v: rd(a.v), n: a.n };
        });
      } else {
        out[id] = Array.from({ length: 12 }, (_, m) => {
          const t = new Date(d0.getFullYear(), m, 1).getTime();
          if (t > now) return { t, v: null, n: 0 };
          const a = agg(code, dayStarts(d0.getFullYear(), m).filter((x) => x <= now).map((x) => slotsOf(key, code, unit, x)));
          return { t, v: rd(a.v), n: a.n };
        });
      }
    }
    return out;
  }

  window.OrcMock = { SCENARIOS, snapshot, history };
})();
