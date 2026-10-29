/* 샘플 ③ 열량 검증: 연료전지 중온수 열량 현장 값 vs EMS 직접 계산 값 */
(function () {
  const V = window.OrcViz, val = V.val, fmt = V.fmt;
  const WARN = V.config.diffWarnPct;
  V.mountNav(document.getElementById("nav"), "verify");

  const diffChip = (d) => d === null ? '<span class="cmp na">비교 불가</span>'
    : `<span class="cmp${Math.abs(d) > WARN ? " warn" : ""}">${d > 0 ? "+" : ""}${fmt(d, 1)}%</span>`;
  const pctBar = (v, mx, color) => `<div class="hc-bar"><i style="width:${v === null ? 0 : Math.min(100, (v / mx) * 100)}%;background:${color}"></i></div>`;
  const tipBox = document.createElement("div");
  tipBox.className = "orc-tip";
  document.body.appendChild(tipBox);

  // ---------- 1. 열량 카드 ----------
  const FCS = [["01", "연료전지 #1"], ["02", "연료전지 #2"], ["00", "통합 (#1 + #2)"]];
  const heatHost = document.getElementById("heat-cards");
  const heatEls = FCS.map(([u, title]) => {
    const el = document.createElement("div");
    el.className = "heat-card card";
    heatHost.appendChild(el);
    V.tip(el, () => ({
      title: `${title} 15분 열량`,
      rows: [
        { l: "현장", id: `fc.heat_site.${u}` }, { l: "EMS", id: `fc.heat_ems_kcal.${u}` }, { l: "EMS (kWh)", id: `fc.heat_ems_kwh.${u}` },
        ...(u !== "00" ? [{ l: "현장 열량 순시", id: `fc.heat_rate.${u}`, d: 3 }, { l: "공급 / 환수 온도", t: () => `${fmt(val(`fc.hw_supply_temp.${u}`), 1)} / ${fmt(val(`fc.hw_return_temp.${u}`), 1)} ℃` }, { l: "유량", id: `fc.hw_flow.${u}` }] : []),
      ],
    }));
    return { el, u, title };
  });
  const dT = (u) => { const a = val(`fc.hw_supply_temp.${u}`), b = val(`fc.hw_return_temp.${u}`); return a === null || b === null ? null : a - b; };
  function renderHeat() {
    heatEls.forEach(({ el, u, title }) => {
      const site = val(`fc.heat_site.${u}`), ems = val(`fc.heat_ems_kcal.${u}`);
      const st = V.today(`fc.heat_site.${u}`), et = V.today(`fc.heat_ems_kcal.${u}`);
      const mx = Math.max(site || 0, ems || 0) || 1;
      el.innerHTML = `<h4>${title} ${diffChip(V.diffPct(site, ems))}</h4>
        <div class="hc-row"><span class="chip site">현장</span>${pctBar(site, mx, "#868e96")}<span class="hc-val">${fmt(site, 1)} <small style="color:#999">Mcal</small></span></div>
        <div class="hc-row"><span class="chip ems">EMS</span>${pctBar(ems, mx, "#9775fa")}<span class="hc-val" style="color:#d0bfff">${fmt(ems, 1)} <small style="color:#999">Mcal</small></span></div>
        <div class="hc-foot"><span>오늘 현장 <b>${fmt(st, 0)}</b> · EMS <b>${fmt(et, 0)}</b> Mcal</span>${diffChip(V.diffPct(st, et))}</div>` +
        (u !== "00" ? `<div class="hc-foot" style="border:0;margin-top:2px;padding-top:0"><span>순시 <b>${fmt(val(`fc.heat_rate.${u}`), 2)}</b> Gcal/h · 온도차 <b>${fmt(dT(u), 1)}</b> ℃ · 유량 <b>${fmt(val(`fc.hw_flow.${u}`), 1)}</b> ㎥/h</span></div>` : "");
    });
  }

  // ---------- 2. 기간별 비교 (일 · 월 · 연) ----------
  const bar = document.getElementById("tr-bar");
  const chart = document.getElementById("chart");
  const side = document.getElementById("tr-side");
  const legend = document.getElementById("tr-legend");
  const dateBox = document.getElementById("tr-date");
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const st = { unit: "00", period: "day", date: new Date() };
  const cache = new Map();
  let cur = null, sel = null, loading = 0;

  function periodStart(p, d) {
    if (p === "day") return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
    return new Date(d.getFullYear(), 0, 1);
  }
  function shift(p, d, dir) {
    const x = new Date(d);
    if (p === "day") x.setDate(x.getDate() + dir);
    else if (p === "month") x.setMonth(x.getMonth() + dir, 1);
    else x.setFullYear(x.getFullYear() + dir, 0, 1);
    return x;
  }
  const p2 = (v) => String(v).padStart(2, "0");
  function dateLabel(p, d) {
    if (p === "day") return `${d.getFullYear()}. ${p2(d.getMonth() + 1)}. ${p2(d.getDate())} (${WD[d.getDay()]})`;
    if (p === "month") return `${d.getFullYear()}. ${p2(d.getMonth() + 1)}`;
    return `${d.getFullYear()}`;
  }
  function bucketLabel(p, t) {
    const d = new Date(t);
    if (p === "day") return `${V.hhmm(t)} ~ ${V.hhmm(t + 900000)}`;
    if (p === "month") return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }

  async function load() {
    const start = periodStart(st.period, st.date).getTime();
    const u = st.unit;
    const ids = [`fc.heat_site.${u}`, `fc.heat_ems_kcal.${u}`];
    const key = [V.scenario(), u, st.period, start].join("|");
    const live = Date.now() < shift(st.period, new Date(start), 1).getTime();
    const hit = cache.get(key);
    const my = ++loading;
    if (!hit || (live && Date.now() - hit.at > 60000)) {
      const r = await V.history({ ids, period: st.period, start });
      cache.set(key, { at: Date.now(), r });
      if (my !== loading) return;
    }
    build(cache.get(key).r, ids, key);
  }

  function build(r, ids, key) {
    const keepSel = cur && cur.key === key ? sel : null;
    const day = st.period === "day";
    const scale = day ? 1 : 0.001;
    const pick = (p) => (p.v === null ? null : p.v * scale);
    const site = r[ids[0]].map(pick), ems = r[ids[1]].map(pick);
    const ts = r[ids[0]].map((p) => p.t);
    const both = site.map((v, i) => (v === null || ems[i] === null ? null : i)).filter((i) => i !== null);
    const sum = both.length
      ? { site: both.reduce((a, i) => a + site[i], 0), ems: both.reduce((a, i) => a + ems[i], 0) }
      : { site: null, ems: null };
    const unit = day ? "Mcal" : "Gcal";
    const dd = day ? 0 : 1;
    const last = both.length ? both[both.length - 1] : -1;
    cur = { key, site, ems, ts, unit, dd, sum, kind: day ? "line" : "bar" };
    sel = keepSel !== null ? keepSel : last >= 0 ? last : null;
    draw();
    drawSide();
  }

  // 차트 좌표
  const W = 1160, ML = 58, MR = 14, MT = 14, PB = 232, DY = 280, DH = 24, XL = 324;
  function niceStep(raw) {
    const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function draw() {
    const { site, ems, ts, kind } = cur;
    const n = ts.length, bw = (W - ML - MR) / n;
    const xc = (i) => ML + (i + 0.5) * bw;
    const vals = [...site, ...ems].filter((v) => v !== null);
    let lo, hi;
    if (!vals.length) { lo = 0; hi = 1; }
    else if (kind === "bar") { lo = 0; hi = Math.max(...vals) * 1.08; }
    else { const a = Math.min(...vals), b = Math.max(...vals), pad = (b - a) * 0.15 || 50; lo = a - pad; hi = b + pad; }
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const y = (v) => PB - ((v - lo) / (hi - lo)) * (PB - MT);
    let g = "";
    for (let v = lo; v <= hi + step / 2; v += step) {
      g += `<line x1="${ML}" x2="${W - MR}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${ML - 8}" y="${y(v) + 4}" text-anchor="end" class="ch-tick">${fmt(v, step < 1 ? 1 : 0)}</text>`;
    }
    ts.forEach((t, i) => {
      const d = new Date(t);
      let lab = null;
      if (st.period === "day") { if (i % 12 === 0) lab = `${p2(d.getHours())}:00`; }
      else if (st.period === "month") lab = `${d.getDate()}`;
      else lab = `${d.getMonth() + 1}월`;
      if (lab) g += `<text x="${st.period === "day" ? ML + i * bw : xc(i)}" y="${XL}" text-anchor="middle" class="ch-tick">${lab}</text>`;
    });
    g += `<rect id="ch-hl" x="0" y="${MT}" width="${bw}" height="${DY + DH - MT}" fill="#fff" fill-opacity=".05" visibility="hidden"/>`;
    if (sel !== null) g += `<rect x="${ML + sel * bw}" y="${MT}" width="${bw}" height="${DY + DH - MT}" fill="#8f7bff" fill-opacity=".1"/>`;
    // 차이 막대
    g += `<line x1="${ML}" x2="${W - MR}" y1="${DY}" y2="${DY}" class="ch-axis"/>`;
    [WARN, -WARN].forEach((w) => { g += `<line x1="${ML}" x2="${W - MR}" y1="${DY - (DH * w) / WARN}" y2="${DY - (DH * w) / WARN}" stroke="#f59f00" stroke-dasharray="3 4" opacity=".55"/>`; });
    g += `<text x="${ML - 8}" y="${DY + 4}" text-anchor="end" class="ch-tick">0%</text><text x="${ML - 8}" y="${DY - DH + 4}" text-anchor="end" class="ch-tick" style="fill:#f59f00">+${WARN}%</text><text x="${ML - 8}" y="${DY + DH + 4}" text-anchor="end" class="ch-tick" style="fill:#f59f00">−${WARN}%</text>`;
    ems.forEach((e, i) => {
      const d = V.diffPct(site[i], e);
      if (d === null) return;
      const h = Math.min(DH * 1.25, (Math.abs(d) * DH) / WARN);
      g += `<rect x="${ML + i * bw + bw * 0.18}" width="${Math.max(1.5, bw * 0.64)}" y="${d > 0 ? DY - h : DY}" height="${Math.max(0.8, h)}" rx="1" fill="${Math.abs(d) > WARN ? "#f59f00" : "#5f3dc4"}"/>`;
    });
    // 본 그래프
    if (kind === "bar") {
      site.forEach((v, i) => { if (v !== null) g += `<rect x="${ML + i * bw + bw * 0.16}" width="${bw * 0.32}" y="${y(v)}" height="${PB - y(v)}" rx="2" fill="#868e96"/>`; });
      ems.forEach((v, i) => { if (v !== null) g += `<rect x="${ML + i * bw + bw * 0.52}" width="${bw * 0.32}" y="${y(v)}" height="${PB - y(v)}" rx="2" fill="#9775fa"/>`; });
    } else {
      const line = (arr) => {
        let d = "", pen = false;
        arr.forEach((v, i) => { if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${xc(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
        return d;
      };
      g += `<path d="${line(site)}" fill="none" stroke="#adb5bd" stroke-width="2.2" stroke-linejoin="round"/>`;
      g += `<path d="${line(ems)}" fill="none" stroke="#9775fa" stroke-width="2.6" stroke-linejoin="round"/>`;
      if (st.period !== "day") {
        site.forEach((v, i) => { if (v !== null) g += `<circle cx="${xc(i)}" cy="${y(v)}" r="3.2" fill="#adb5bd"/>`; });
        ems.forEach((v, i) => { if (v !== null) g += `<circle cx="${xc(i)}" cy="${y(v)}" r="3.2" fill="#9775fa"/>`; });
      }
    }
    g += `<text x="${ML}" y="${MT - 2}" class="ch-tick">${cur.unit}</text>`;
    g += `<rect id="ch-hit" x="${ML}" y="0" width="${W - ML - MR}" height="${XL}" fill="transparent" style="cursor:${st.period === "day" ? "crosshair" : "pointer"}"/>`;
    chart.innerHTML = g;
    const hit = chart.querySelector("#ch-hit"), hl = chart.querySelector("#ch-hl");
    const idxAt = (e) => {
      const pt = chart.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(chart.getScreenCTM().inverse());
      return Math.max(0, Math.min(n - 1, Math.floor((p.x - ML) / bw)));
    };
    hit.addEventListener("mousemove", (e) => {
      const i = idxAt(e);
      hl.setAttribute("x", ML + i * bw); hl.setAttribute("visibility", "visible");
      const d = V.diffPct(site[i], ems[i]);
      tipBox.innerHTML = `<div class="tt-head"><span class="tt-title">${bucketLabel(st.period, ts[i])}</span></div>
        <div class="tt-row"><span class="l">현장</span><span class="v${site[i] === null ? " na" : ""}">${fmt(site[i], cur.dd)} ${cur.unit}</span></div>
        <div class="tt-row"><span class="l">EMS</span><span class="v${ems[i] === null ? " na" : ""}" style="color:#d0bfff">${fmt(ems[i], cur.dd)} ${cur.unit}</span></div>
        <div class="tt-row"><span class="l">차이</span><span class="v">${d === null ? "—" : `${d > 0 ? "+" : ""}${fmt(d, 2)}%`}</span></div>`;
      tipBox.classList.add("show");
      const x = e.clientX + 16 + tipBox.offsetWidth > window.innerWidth - 8 ? e.clientX - tipBox.offsetWidth - 16 : e.clientX + 16;
      tipBox.style.left = `${x}px`;
      tipBox.style.top = `${e.clientY + 16}px`;
    });
    hit.addEventListener("mouseleave", () => { hl.setAttribute("visibility", "hidden"); tipBox.classList.remove("show"); });
    hit.addEventListener("click", (e) => {
      const i = idxAt(e);
      if (st.period === "day") { sel = i; draw(); drawSide(); return; }
      if (site[i] === null && ems[i] === null) return;
      st.date = new Date(ts[i]);
      st.period = st.period === "year" ? "month" : "day";
      tipBox.classList.remove("show");
      refreshTrend();
    });

    const c = kind === "bar" ? [["sq", "#868e96", "현장"], ["sq", "#9775fa", "EMS"]] : [["ln", "#adb5bd", "현장"], ["ln", "#9775fa", "EMS"]];
    legend.innerHTML = c.map(([k, col, t]) => `<span><i style="background:${col}${k === "sq" ? ";width:10px;height:10px;border-radius:2px" : ""}"></i>${t}</span>`).join("") +
      `<span><i style="background:#5f3dc4;width:10px;height:10px;border-radius:2px"></i>차이 (EMS − 현장)</span><span><i style="background:#f59f00;width:10px;height:10px;border-radius:2px"></i>±${WARN}% 초과</span>`;
  }

  function drawSide() {
    const { sum, unit, dd } = cur;
    const pName = { day: "오늘", month: "이번 달", year: "올해" }[st.period];
    const isNow = periodStart(st.period, new Date()).getTime() === periodStart(st.period, st.date).getTime();
    const row = (chip, v, d, u, color) => `<div class="sp-row"><span class="chip ${chip}">${chip === "site" ? "현장" : "EMS"}</span><span class="sp-v"${color ? ` style="color:${color}"` : ""}>${fmt(v, d)} <small>${u}</small></span></div>`;
    let html = `<h4>${isNow ? pName : "기간"} 합계</h4>${row("site", sum.site, 0, unit)}${row("ems", sum.ems, 0, unit, "#d0bfff")}<div class="sp-diff">차이 ${diffChip(V.diffPct(sum.site, sum.ems))}</div>`;
    if (sel !== null) {
      const i = sel;
      html += `<h4 class="sp-sel">${bucketLabel(st.period, cur.ts[i])}</h4>${row("site", cur.site[i], dd, unit)}${row("ems", cur.ems[i], dd, unit, "#d0bfff")}<div class="sp-diff">차이 ${diffChip(V.diffPct(cur.site[i], cur.ems[i]))}</div>`;
    }
    side.innerHTML = html;
  }

  function syncBar() {
    bar.querySelectorAll(".seg").forEach((sg) => sg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === st[sg.dataset.g])));
    dateBox.textContent = dateLabel(st.period, st.date);
    const atNow = periodStart(st.period, st.date).getTime() >= periodStart(st.period, new Date()).getTime();
    bar.querySelector('[data-nav="1"]').disabled = atNow;
  }
  function refreshTrend() {
    syncBar();
    load();
  }
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const sg = b.closest(".seg");
    if (sg) st[sg.dataset.g] = b.dataset.v;
    else if (b.dataset.nav === "today") st.date = new Date();
    else if (b.dataset.nav) st.date = shift(st.period, periodStart(st.period, st.date), Number(b.dataset.nav));
    refreshTrend();
  });

  let lastSc = V.scenario();
  V.onRender(() => {
    document.getElementById("recv").textContent = `최근 수신 ${V.hhmm(V.latestTs())} · 15분 주기`;
    renderHeat();
    if (V.scenario() !== lastSc) { lastSc = V.scenario(); load(); }
  });
  V.mountDemoBar(document.getElementById("demo"));
  refreshTrend();
  setInterval(() => { if (Date.now() < shift(st.period, periodStart(st.period, st.date), 1).getTime()) load(); }, 60000);
  V.start();
})();
