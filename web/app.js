'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nfs = {};
  const fmt = (v, d = 0) => {
    if (v == null || Number.isNaN(v)) return '–';
    return (nfs[d] ||= new Intl.NumberFormat('ca-ES', { minimumFractionDigits: d, maximumFractionDigits: d })).format(v);
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const store = {
    get(k, def) { try { return localStorage.getItem(k) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sense emmagatzematge */ } },
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ICONS = {
    temp: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
    hum: '<path d="M12 2.7s7 7.2 7 12.1a7 7 0 0 1-14 0C5 9.9 12 2.7 12 2.7z"/>',
    wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
    rain: '<path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/><path d="M8 19v2M8 13v2M16 19v2M16 13v2M12 21v2M12 15v2"/>',
    bar: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
    xaf: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  const humidex = (t, h) => {
    if (typeof t !== 'number' || typeof h !== 'number' || t <= -3000 || h <= -3000 || h < 0 || h > 100) return null;
    const e = 6.112 * Math.exp((17.62 * t) / (243.12 + t)) * (h / 100);
    return t + 0.5555 * (e - 10);
  };
  const xafLevel = (x) => (x < 24 ? 'Sense xafogor' : x < 30 ? 'Xafogor lleugera' : x < 35 ? 'Xafogós' : x < 40 ? 'Molt xafogós' : x < 46 ? 'Sufocant' : 'Perillós');

  const VARS = {
    temp: {
      label: 'Temperatura', tab: 'Temp.', unit: '°C', dec: 1, mdec: 0,
      get: (d) => d.temp,
      stops: [[-5, '#3b4cc0'], [0, '#4f7cf0'], [8, '#4fb4e8'], [14, '#5ed0b0'], [19, '#9ad65c'], [24, '#f2d94a'], [29, '#f6a13a'], [34, '#ec5b2f'], [39, '#c2271f'], [44, '#7a0f3a']],
      ticks: [0, 10, 20, 30, 40],
    },
    hum: {
      label: 'Humitat', tab: 'Humitat', unit: '%', dec: 0, mdec: 0,
      get: (d) => d.hum,
      stops: [[10, '#f0d9a0'], [40, '#c9e3cf'], [65, '#6cbcd8'], [85, '#2f78c4'], [100, '#1c3f91']],
      ticks: [10, 30, 50, 70, 90],
    },
    wind: {
      label: 'Vent', tab: 'Vent', unit: 'km/h', dec: 0, mdec: 0,
      get: (d) => (d.wspd == null ? null : d.wspd * 3.6),
      stops: [[0, '#5b6c8f'], [8, '#4fb4e8'], [16, '#5ed0b0'], [26, '#f2d94a'], [40, '#f6a13a'], [60, '#e5462f'], [80, '#8e1a5b']],
      ticks: [0, 20, 40, 60, 80],
    },
    rain: {
      label: 'Pluja avui', tab: 'Pluja', unit: 'mm', dec: 1, mdec: 1,
      get: (d) => d.rain,
      stops: [[0, '#6b7a93'], [0.2, '#a8d8f0'], [2, '#5aa9e6'], [8, '#2f6fd0'], [20, '#5b3fc4'], [50, '#a12ea8']],
      ticks: [0, 10, 20, 30, 40, 50],
    },
    bar: {
      label: 'Pressió', tab: 'Pressió', unit: 'hPa', dec: 0, mdec: 0,
      get: (d) => d.bar,
      stops: [[995, '#7b4fc9'], [1008, '#5b8def'], [1013, '#cfd8dc'], [1018, '#f3b45a'], [1030, '#d9542f']],
      ticks: [995, 1005, 1015, 1025],
    },
    xaf: {
      label: 'Xafogor (humidex)', tab: 'Xafogor', unit: 'humidex', dec: 1, mdec: 0,
      get: (d) => humidex(d.temp, d.hum),
      stops: [[15, '#9ad6e8'], [22, '#7fcf9a'], [27, '#d9e36a'], [30, '#f2c94c'], [35, '#f28c38'], [40, '#d9453a'], [46, '#8e1a5b']],
      ticks: [20, 25, 30, 35, 40, 45],
      note: xafLevel,
    },
  };
  const REL = { temp: [[2, 38], 6], hum: [[20, 100], 20], wind: [[0, 40], 10], rain: [[0, 20], 2], bar: [[1000, 1030], 4], xaf: [[18, 44], 4] };
  for (const [k, v] of Object.entries(VARS)) {
    [v.rel, v.minSpan] = REL[k];
    v.stops = v.stops.map(([x, hex]) => [x, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))]);
    v.min = v.stops[0][0];
    v.max = v.stops[v.stops.length - 1][0];
  }
  const rgbAt = (vr, x) => {
    const s = vr.stops;
    if (x <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (x <= s[i][0]) {
        const t = (x - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
        const a = s[i - 1][1], b = s[i][1];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
    return s[s.length - 1][1];
  };
  let scale = { lo: 0, hi: 1, map: (x) => x };
  function computeScale() {
    const vr = VARS[S.varKey];
    if (!S.relative) { scale = { lo: vr.min, hi: vr.max, map: (x) => x }; return; }
    const vals = S.stations.map((st) => valOf(st)).filter((x) => x != null);
    if (!vals.length) { scale = { lo: vr.min, hi: vr.max, map: (x) => x }; return; }
    const mid = (Math.min(...vals) + Math.max(...vals)) / 2;
    const span = Math.max(Math.max(...vals) - Math.min(...vals), vr.minSpan);
    const lo = mid - span / 2, hi = mid + span / 2;
    scale = { lo, hi, map: (x) => vr.rel[0] + ((x - lo) / (hi - lo)) * (vr.rel[1] - vr.rel[0]) };
  }
  const colorFor = (v) => rgbAt(VARS[S.varKey], scale.map(v));
  const hexOf = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
  const inkOn = (rgb) => ((0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6 ? '#0b1220' : '#ffffff');

  const LIVE_MAX = 45 * 60, OLD_MAX = 3 * 3600;
  const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  const compassName = (deg) => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

  const S = {
    stations: [], comarca: null, live: {}, generated: 0, lastFetch: 0, fetchError: false,
    varKey: store.get('var', 'temp'), base: store.get('base', 'dark'), surface: store.get('surface', '1') === '1',
    sort: 'value', query: '', selected: null, relative: store.get('relative', '0') === '1',
  };
  if (!VARS[S.varKey]) S.varKey = 'temp';
  if (!['dark', 'light', 'sat'].includes(S.base)) S.base = 'dark';

  const nowSec = () => Date.now() / 1000;
  const validNum = (x) => typeof x === 'number' && Number.isFinite(x) && x > -3000;
  const ageOf = (st) => { const d = S.live[st.id]; return d && d.epoch ? nowSec() - d.epoch : Infinity; };
  const stateOf = (st) => { const a = ageOf(st); return a <= LIVE_MAX ? 'live' : a <= OLD_MAX ? 'old' : 'off'; };
  const valOf = (st, key = S.varKey) => {
    const d = S.live[st.id];
    if (!d || stateOf(st) === 'off') return null;
    const x = VARS[key].get(d);
    return validNum(x) ? x : null;
  };
  const agoText = (sec) => {
    if (!Number.isFinite(sec)) return 'sense dades';
    if (sec < 90) return 'ara mateix';
    if (sec < 3600) return `fa ${Math.round(sec / 60)} min`;
    if (sec < 86400) return `fa ${Math.round(sec / 3600)} h`;
    if (sec < 86400 * 60) return `fa ${Math.round(sec / 86400)} d`;
    if (sec < 86400 * 730) return `fa ${Math.round(sec / 86400 / 30)} mesos`;
    return `fa ${Math.round(sec / 86400 / 365)} anys`;
  };

  /* ------------------------------------------------------------------ mapa */
  const map = L.map('map', { zoomControl: false, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 9, maxZoom: 17, zoomAnimation: true, attributionControl: true });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.setView([41.39, 1.75], 11);
  new ResizeObserver(() => map.invalidateSize()).observe($('#map'));

  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  const BASES = {
    dark: { url: ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: ESRI + 'Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', native: 16, attr: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ', theme: 'dark' },
    light: { url: ESRI + 'Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: ESRI + 'Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', native: 16, attr: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ', theme: 'light' },
    sat: { url: ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', ref: ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', native: 18, attr: 'Imatges &copy; Esri, Maxar, Earthstar Geographics', theme: 'dark' },
  };
  let baseLayer = null, labelLayer = null;
  function setBase(key) {
    S.base = key; store.set('base', key);
    const b = BASES[key];
    if (baseLayer) map.removeLayer(baseLayer);
    if (labelLayer) { map.removeLayer(labelLayer); labelLayer = null; }
    baseLayer = L.tileLayer(b.url, { attribution: b.attr, maxZoom: 17, maxNativeZoom: b.native }).addTo(map);
    baseLayer.bringToBack();
    labelLayer = L.tileLayer(b.ref, { maxZoom: 17, maxNativeZoom: b.native, pane: 'shadowPane', opacity: key === 'sat' ? 0.9 : 0.55 }).addTo(map);
    document.documentElement.dataset.theme = b.theme;
    document.querySelectorAll('#baseSeg button').forEach((el) => el.classList.toggle('on', el.dataset.base === key));
    scheduleDraw();
  }

  const surfPane = map.createPane('surface'); surfPane.style.zIndex = 250; surfPane.style.pointerEvents = 'none';
  const flowPane = map.createPane('flow'); flowPane.style.zIndex = 260; flowPane.style.pointerEvents = 'none';
  const surfCanvas = document.createElement('canvas'); surfPane.appendChild(surfCanvas);
  const flowCanvas = document.createElement('canvas'); flowPane.appendChild(flowCanvas);
  for (const c of [surfCanvas, flowCanvas]) { c.style.position = 'absolute'; c.style.left = '0'; c.style.top = '0'; c.style.transition = 'opacity .2s'; }
  const sctx = surfCanvas.getContext('2d');
  const fctx = flowCanvas.getContext('2d');
  const offscreen = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  let geom = { w: 0, h: 0, path: null, rings: [], pts: [] };

  function comarcaRings() {
    const g = S.comarca && S.comarca.geometry;
    if (!g) return [];
    return g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
  }

  function updateGeom() {
    const size = map.getSize();
    geom.w = size.x; geom.h = size.y;
    const tl = map.containerPointToLayerPoint([0, 0]);
    for (const c of [surfCanvas, flowCanvas]) L.DomUtil.setPosition(c, tl);
    surfCanvas.width = geom.w; surfCanvas.height = geom.h;
    surfCanvas.style.width = geom.w + 'px'; surfCanvas.style.height = geom.h + 'px';
    if (flowCanvas.width !== Math.round(geom.w * dpr) || flowCanvas.height !== Math.round(geom.h * dpr)) {
      flowCanvas.width = Math.round(geom.w * dpr); flowCanvas.height = Math.round(geom.h * dpr);
      flowCanvas.style.width = geom.w + 'px'; flowCanvas.style.height = geom.h + 'px';
    }
    const path = new Path2D();
    geom.rings = comarcaRings().map((ring) => ring.map(([lon, lat]) => map.latLngToContainerPoint([lat, lon])));
    for (const r of geom.rings) {
      r.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
      path.closePath();
    }
    geom.path = path;
    geom.pts = [];
    for (const st of S.stations) {
      const v = valOf(st);
      if (v == null) continue;
      const p = map.latLngToContainerPoint([st.lat, st.lon]);
      const d = S.live[st.id];
      const spd = d.wspd ?? 0, dir = d.wdir ?? 0;
      geom.pts.push({ x: p.x, y: p.y, v, u: -spd * 3.6 * Math.sin((dir * Math.PI) / 180), vv: -spd * 3.6 * Math.cos((dir * Math.PI) / 180) });
    }
  }

  function drawSurface() {
    const { w, h, pts } = geom;
    if (w < 2 || h < 2) return;
    sctx.clearRect(0, 0, w, h);
    if (!geom.path) return;
    const vr = VARS[S.varKey];
    if (S.surface && pts.length >= 3) {
      const cell = 8, gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
      offscreen.width = gw; offscreen.height = gh;
      const octx = offscreen.getContext('2d');
      const img = octx.createImageData(gw, gh);
      const alpha = S.base === 'light' ? 190 : 165;
      const EPS = 350;
      for (let gy = 0; gy < gh; gy++) {
        const y = gy * cell + cell / 2;
        for (let gx = 0; gx < gw; gx++) {
          const x = gx * cell + cell / 2;
          let sw = 0, sv = 0;
          for (let i = 0; i < pts.length; i++) {
            const dx = x - pts[i].x, dy = y - pts[i].y;
            const wgt = 1 / (dx * dx + dy * dy + EPS);
            sw += wgt; sv += wgt * pts[i].v;
          }
          const c = colorFor(sv / sw);
          const o = (gy * gw + gx) * 4;
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = alpha;
        }
      }
      octx.putImageData(img, 0, 0);
      sctx.save();
      sctx.clip(geom.path);
      sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(offscreen, 0, 0, gw * cell, gh * cell);
      sctx.restore();
    }
    // atenua l'exterior de la comarca
    sctx.save();
    const outer = new Path2D(); outer.rect(-10, -10, w + 20, h + 20); outer.addPath(geom.path);
    sctx.fillStyle = S.base === 'light' ? 'rgba(232,237,244,.55)' : 'rgba(6,10,20,.5)';
    sctx.fill(outer, 'evenodd');
    sctx.restore();
    sctx.save();
    sctx.setLineDash([6, 5]); sctx.lineWidth = 1.6; sctx.lineJoin = 'round';
    sctx.strokeStyle = S.base === 'light' ? 'rgba(15,23,42,.55)' : 'rgba(255,255,255,.6)';
    sctx.stroke(geom.path);
    sctx.restore();
  }

  /* --------------------------------------------------------- partícules de vent */
  const flow = { parts: [], raf: 0, running: false };
  function windAt(x, y) {
    const pts = geom.pts;
    let sw = 0, su = 0, sv = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x, dy = y - pts[i].y;
      const wgt = 1 / (dx * dx + dy * dy + 350);
      sw += wgt; su += wgt * pts[i].u; sv += wgt * pts[i].vv;
    }
    return sw ? [su / sw, sv / sw] : [0, 0];
  }
  const newPart = (spread = true) => ({ x: Math.random() * geom.w, y: Math.random() * geom.h, age: spread ? Math.random() * 90 : 0, max: 50 + Math.random() * 60 });
  function seedFlow() {
    const n = clamp(Math.round((geom.w * geom.h) / 1100), 250, 1500);
    flow.parts = Array.from({ length: n }, () => newPart());
  }
  function flowFrame() {
    flow.raf = 0;
    if (!flow.running) return;
    const { w, h } = geom;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.globalCompositeOperation = 'destination-out';
    fctx.fillStyle = 'rgba(0,0,0,.07)';
    fctx.fillRect(0, 0, w, h);
    fctx.globalCompositeOperation = 'source-over';
    fctx.save();
    fctx.clip(geom.path);
    fctx.lineWidth = 1.3; fctx.lineCap = 'round';
    fctx.strokeStyle = S.base === 'light' ? 'rgba(16,30,70,.75)' : 'rgba(255,255,255,.8)';
    fctx.beginPath();
    for (const p of flow.parts) {
      const [u, v] = windAt(p.x, p.y);
      const spd = Math.hypot(u, v);
      const k = spd > 0.01 ? (0.25 + spd * 0.05) / spd : 0;
      const nx = p.x + u * k, ny = p.y - v * k;
      fctx.moveTo(p.x, p.y); fctx.lineTo(nx, ny);
      p.x = nx; p.y = ny; p.age++;
      if (p.age > p.max || nx < 0 || ny < 0 || nx > w || ny > h) Object.assign(p, newPart(false));
    }
    fctx.stroke();
    fctx.restore();
    flow.raf = requestAnimationFrame(flowFrame);
  }
  function syncFlow() {
    const want = S.varKey === 'wind' && S.surface && !reducedMotion && geom.pts.length >= 3;
    if (want && !flow.running) { flow.running = true; seedFlow(); flow.raf = requestAnimationFrame(flowFrame); }
    if (!want && flow.running) { flow.running = false; cancelAnimationFrame(flow.raf); }
    if (!want) fctx.clearRect(0, 0, flowCanvas.width, flowCanvas.height);
  }

  let drawQueued = false;
  function scheduleDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      updateGeom(); drawSurface();
      if (flow.running) { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, flowCanvas.width, flowCanvas.height); }
      syncFlow();
    });
  }
  const applyScale = () => { const z = map.getZoom(); $('#map').style.setProperty('--s', z < 11.5 ? 0.72 : z < 12.5 ? 0.86 : 1); };
  map.on('zoom', applyScale);
  map.on('move resize', scheduleDraw);
  map.on('zoomstart', () => { surfCanvas.style.opacity = 0; flowCanvas.style.opacity = 0; });
  map.on('zoomend', () => { scheduleDraw(); surfCanvas.style.opacity = 1; flowCanvas.style.opacity = 1; });

  /* ---------------------------------------------------------------- marcadors */
  const markers = new Map();
  function markerHtml(st) {
    const vr = VARS[S.varKey];
    const state = stateOf(st), v = valOf(st);
    const sel = S.selected === st.id ? ' sel' : '';
    if (v == null) return `<div class="mkw${sel}"><div class="mk off" style="width:24px;height:24px;margin:-12px 0 0 -12px" aria-label="${esc(st.nom)}: sense dades"></div></div>`;
    const rgb = colorFor(v);
    const txt = fmt(v, vr.mdec);
    const cls = 'mk' + (txt.length >= 4 ? ' small' : '') + (state === 'old' ? ' old' : '');
    let arrow = '';
    if (S.varKey === 'wind') {
      const dir = S.live[st.id].wdir;
      if (validNum(dir) && v >= 1) arrow = `<div class="arr" style="transform:rotate(${Math.round(dir + 180)}deg)"></div>`;
    }
    return `<div class="mkw${sel}">${arrow}<div class="${cls}" style="--c:${hexOf(rgb)};--t:${inkOn(rgb)}">${txt}</div></div>`;
  }
  function tipHtml(st) {
    const vr = VARS[S.varKey], v = valOf(st);
    const val = v == null ? 'Sense dades' : `${fmt(v, vr.dec)} ${vr.unit}${vr.note ? ' · ' + vr.note(v) : ''}`;
    return `<b>${esc(st.nom)}</b><span>${esc(st.municipi)} · ${val}</span>`;
  }
  function initMarkers() {
    for (const st of S.stations) {
      const m = L.marker([st.lat, st.lon], { icon: L.divIcon({ className: 'mkicon', html: '', iconSize: [60, 60] }), keyboard: true, title: st.nom, riseOnHover: true });
      m.bindTooltip('', { direction: 'top', offset: [0, -22], className: 'tip', opacity: 1 });
      m.on('click', () => select(st.id, { fly: false }));
      m.addTo(map);
      markers.set(st.id, m);
    }
  }
  function renderMarkers() {
    for (const st of S.stations) {
      const m = markers.get(st.id);
      m.setIcon(L.divIcon({ className: 'mkicon', html: markerHtml(st), iconSize: [60, 60] }));
      m.setTooltipContent(tipHtml(st));
      m.setZIndexOffset(S.selected === st.id ? 1000 : Math.round((valOf(st) ?? -1e3) * 0));
    }
  }

  /* -------------------------------------------------------------------- panell */
  function renderTabs() {
    $('#tabs').innerHTML = Object.entries(VARS).map(([k, v]) =>
      `<button class="tab" role="tab" data-var="${k}" aria-selected="${k === S.varKey}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>${v.tab}</button>`).join('');
  }
  function renderLegend() {
    const vr = VARS[S.varKey];
    const N = 24;
    const grad = Array.from({ length: N + 1 }, (_, i) => `${hexOf(colorFor(scale.lo + ((scale.hi - scale.lo) * i) / N))} ${((i / N) * 100).toFixed(1)}%`).join(',');
    const tickVals = S.relative ? Array.from({ length: 5 }, (_, i) => scale.lo + ((scale.hi - scale.lo) * i) / 4) : vr.ticks;
    const ticks = tickVals.map((t) => `<span>${fmt(t, S.relative ? vr.dec : 0)}</span>`).join('');
    $('#legend').innerHTML = `<div class="bar" style="background:linear-gradient(90deg,${grad})"></div><div class="ticks">${ticks}<span class="u">${vr.unit}</span></div>`;
  }
  function renderSummary() {
    const vr = VARS[S.varKey];
    const items = S.stations.map((st) => ({ st, v: valOf(st) })).filter((x) => x.v != null);
    if (!items.length) { $('#summary').innerHTML = '<div class="stat" style="grid-column:1/-1"><div class="n">Sense dades disponibles</div></div>'; return; }
    const mean = items.reduce((a, x) => a + x.v, 0) / items.length;
    const max = items.reduce((a, x) => (x.v > a.v ? x : a));
    const min = items.reduce((a, x) => (x.v < a.v ? x : a));
    const cell = (k, x, sub) => `<div class="stat"${x ? ` data-id="${x.st.id}"` : ''}><div class="k">${k}</div><div class="v">${fmt(x ? x.v : mean, vr.dec)}<small>${vr.unit}</small></div><div class="n">${sub}</div></div>`;
    $('#summary').innerHTML =
      cell('Mitjana', null, vr.note ? vr.note(mean) : `${items.length} estacions`) + cell('Màxim', max, esc(max.st.nom)) + cell('Mínim', min, esc(min.st.nom));
  }
  function renderList() {
    const vr = VARS[S.varKey];
    const q = S.query.trim().toLowerCase();
    let rows = S.stations.map((st) => ({ st, v: valOf(st), age: ageOf(st) }));
    if (q) rows = rows.filter((r) => (r.st.nom + ' ' + r.st.municipi).toLowerCase().includes(q));
    if (S.sort === 'value') rows.sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9));
    else rows.sort((a, b) => a.st.municipi.localeCompare(b.st.municipi, 'ca') || a.st.nom.localeCompare(b.st.nom, 'ca'));
    $('#sortBtn').textContent = S.sort === 'value' ? 'Per valor' : 'Per municipi';
    if (!rows.length) { $('#list').innerHTML = '<li class="empty">Cap estació coincideix amb la cerca.</li>'; return; }
    $('#list').innerHTML = rows.map((r) => {
      const badge = r.v == null
        ? '<div class="badge off">–</div>'
        : (() => { const c = colorFor(r.v); return `<div class="badge" style="background:${hexOf(c)};color:${inkOn(c)}">${fmt(r.v, vr.mdec === 0 && vr.dec > 0 ? 1 : vr.dec)}</div>`; })();
      return `<li class="row${S.selected === r.st.id ? ' sel' : ''}" role="option" tabindex="0" data-id="${r.st.id}" aria-selected="${S.selected === r.st.id}">${badge}<div class="txt"><div class="nm">${esc(r.st.nom)}</div><div class="mu">${esc(r.st.municipi)}${vr.note && r.v != null ? ' · ' + vr.note(r.v) : ''}</div></div><div class="ag">${r.v == null ? agoText(r.age) : ''}</div></li>`;
    }).join('');
  }
  function renderLive() {
    const el = $('#live');
    const online = S.stations.filter((st) => stateOf(st) !== 'off').length;
    $('#countOnline').textContent = `${online} de ${S.stations.length}`;
    let cls = '', txt;
    if (!S.lastFetch) txt = 'Carregant…';
    else if (S.fetchError) { cls = 'error'; txt = 'Sense connexió amb el servidor'; }
    else {
      const s = Math.round(nowSec() - S.lastFetch);
      txt = s < 5 ? 'Actualitzat ara' : `Actualitzat fa ${s < 90 ? s + ' s' : Math.round(s / 60) + ' min'}`;
      if (s > 180) cls = 'stale';
    }
    el.className = 'live ' + cls;
    $('#liveText').textContent = txt;
  }

  function renderAll() {
    computeScale();
    renderLegend(); renderSummary(); renderList(); renderMarkers();
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.var === S.varKey));
    scheduleDraw();
    if (S.selected) renderDetail();
    renderLive();
  }

  /* ---------------------------------------------------------------- detall */
  const statCache = new Map();
  function compassSvg(dir, on) {
    const a = validNum(dir) ? dir : null;
    const needle = a == null ? '' : `<g transform="rotate(${Math.round(a + 180)} 40 40)"><path d="M40 10 L47 42 L40 37 L33 42 Z" fill="${on ? '#f6a13a' : '#7b8799'}"/></g>`;
    return `<svg class="compass" width="80" height="80" viewBox="0 0 80 80" role="img" aria-label="${a == null ? 'Sense direcció' : 'Vent de ' + compassName(a)}"><circle cx="40" cy="40" r="35" fill="none" stroke="var(--border)" stroke-width="1.5"/><circle cx="40" cy="40" r="2.5" fill="var(--ink-3)"/><text x="40" y="9" text-anchor="middle">N</text><text x="73" y="43" text-anchor="middle">E</text><text x="40" y="76" text-anchor="middle">S</text><text x="7" y="43" text-anchor="middle">O</text>${needle}</svg>`;
  }
  const stat = (o, k) => { const x = o && o[k]; const n = Array.isArray(x) ? x[x.length - 1] : x; return validNum(Number(n)) && n !== null ? Number(n) : null; };
  const statTime = (o, k) => { const x = o && o[k]; return Array.isArray(x) && x[0] ? new Date(x[0] * 1000).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' }) : ''; };

  function renderDetail() {
    const st = S.stations.find((s) => s.id === S.selected);
    const box = $('#detail');
    document.body.classList.toggle('has-detail', !!st);
    if (!st) { box.classList.add('hidden'); return; }
    const d = S.live[st.id] || {};
    const state = stateOf(st), age = ageOf(st);
    const tv = validNum(d.temp) ? d.temp : null;
    const tc = tv != null && state !== 'off' ? rgbAt(VARS.temp, tv) : null;
    const stats = statCache.get(st.id)?.data;
    const hi = stat(stats, 'temp_day_max'), lo = stat(stats, 'temp_day_min');
    const cell = (k, v, unit, sub = '') => `<div class="cell"><div class="k">${k}</div><div class="v">${v}${v === '–' ? '' : `<small> ${unit}</small>`}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const off = state === 'off';
    const hx = humidex(d.temp, d.hum);
    const spdKmh = validNum(d.wspd) ? d.wspd * 3.6 : null, gust = validNum(d.wspdhi) ? d.wspdhi * 3.6 : null;
    const rainDay = stat(stats, 'rain_day_total'), rainMonth = stat(stats, 'rain_month_total');
    box.innerHTML = `
      <div class="d-head"><div><h2>${esc(st.nom)}</h2><p>${esc(st.municipi)}${st.alt ? ` · ${st.alt} m` : ''}</p></div><button class="d-close" aria-label="Tanca">×</button></div>
      ${off ? `<div class="d-warn">Aquesta estació no envia dades (última lectura ${agoText(age)}).</div>` : ''}
      <div class="d-hero">
        <div class="d-temp" style="${tc ? `color:${hexOf(tc)}` : ''}">${off ? '–' : fmt(tv, 1)}<small>${off ? '' : ' °C'}</small></div>
        <div class="d-range">${hi != null ? `Màx. avui <b>${fmt(hi, 1)}°</b> ${statTime(stats, 'temp_day_max')}<br>` : ''}${lo != null ? `Mín. avui <b>${fmt(lo, 1)}°</b> ${statTime(stats, 'temp_day_min')}` : ''}</div>
        ${compassSvg(off ? null : d.wdir, !off && spdKmh >= 1)}
      </div>
      <div class="grid2">
        ${cell('Sensació', off || !validNum(d.heat ?? d.chill) ? '–' : fmt(tv != null && tv < 15 ? d.chill : d.heat ?? d.chill, 1), '°C')}
        ${cell('Humitat', off || !validNum(d.hum) ? '–' : fmt(d.hum), '%', validNum(d.dew) && !off ? `Punt de rosada ${fmt(d.dew, 1)}°` : '')}
        ${cell('Vent', off || spdKmh == null ? '–' : fmt(spdKmh), 'km/h', !off && validNum(d.wdir) ? `de ${compassName(d.wdir)} (${Math.round(d.wdir)}°)` : '')}
        ${cell('Ratxa', off || gust == null ? '–' : fmt(gust), 'km/h')}
        ${cell('Pressió', off || !validNum(d.bar) ? '–' : fmt(d.bar, 1), 'hPa')}
        ${cell('Pluja avui', off || !validNum(d.rain) ? '–' : fmt(d.rain, 1), 'mm', rainMonth != null ? `Aquest mes ${fmt(rainMonth, 1)} mm` : '')}
        ${cell('Xafogor', off || hx == null ? '–' : fmt(hx, 1), 'humidex', off || hx == null ? '' : xafLevel(hx))}
        ${cell('Radiació solar', off || !validNum(d.solarrad) ? '–' : fmt(d.solarrad), 'W/m²', !off && validNum(d.uvi) ? `Índex UV ${fmt(d.uvi)}` : '')}
      </div>
      <div class="d-foot"><span>${off ? '' : 'Lectura ' + agoText(age)}</span><a class="btn-link" href="https://app.weathercloud.net/d${esc(st.id)}" target="_blank" rel="noopener">Veure a Weathercloud</a></div>`;
    box.classList.remove('hidden');
    box.querySelector('.d-close').addEventListener('click', () => select(null));
  }
  async function loadStats(id) {
    const hit = statCache.get(id);
    if (hit && Date.now() - hit.t < 300000) return;
    try {
      const r = await fetch(`/api/estadistiques/${id}`);
      if (!r.ok) throw new Error(r.status);
      statCache.set(id, { t: Date.now(), data: await r.json() });
    } catch { statCache.set(id, { t: Date.now(), data: null }); }
    if (S.selected === id) renderDetail();
  }

  function select(id, { fly = true } = {}) {
    S.selected = id;
    if (id) {
      const st = S.stations.find((s) => s.id === id);
      renderDetail();
      loadStats(id);
      if (fly && st) {
        const mobile = innerWidth <= 860;
        const z = Math.max(map.getZoom(), 13);
        let c = map.project([st.lat, st.lon], z);
        if (mobile) c = c.add([0, innerHeight * 0.2]);
        map.flyTo(map.unproject(c, z), z, { duration: reducedMotion ? 0 : 0.8 });
      }
    } else { $('#detail').classList.add('hidden'); document.body.classList.remove('has-detail'); }
    renderMarkers();
    renderList();
    const row = document.querySelector(`.row[data-id="${id}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }

  /* --------------------------------------------------------------- dades */
  let inflight = false;
  async function refresh(manual = false) {
    if (inflight) return;
    inflight = true;
    const btn = $('#refreshBtn'); btn.classList.add('spin');
    try {
      const r = await fetch('/api/dades', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      S.live = j.values || {}; S.generated = j.generated; S.lastFetch = nowSec(); S.fetchError = false;
      renderAll();
      if (manual) toast(`Dades actualitzades (${j.ok}/${j.total} estacions responen)`);
    } catch (e) {
      S.fetchError = true; renderLive();
      if (manual || !S.lastFetch) toast('No s\'han pogut carregar les dades. Comprova que el servidor està en marxa.');
    } finally { inflight = false; btn.classList.remove('spin'); }
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  /* ------------------------------------------------------------------ radar */
  const radarPane = map.createPane('radar'); radarPane.style.zIndex = 255; radarPane.style.pointerEvents = 'none';
  const radar = { on: false, layers: [], times: [], idx: 0, playing: false, timer: 0, refresh: 0 };
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  const hhmm = (t) => new Date(t * 1000).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' });

  function radarShow(i) {
    radar.idx = i;
    radar.layers.forEach((l, k) => l.setOpacity(k === i ? 0.8 : 0));
    $('#radarRange').value = i;
    $('#radarTime').textContent = radar.times.length ? hhmm(radar.times[i]) : '–';
    $('#radarAgo').textContent = radar.times.length ? agoText(nowSec() - radar.times[i]) : '';
  }
  function radarTick() {
    clearTimeout(radar.timer);
    if (!radar.on || !radar.playing) return;
    const next = (radar.idx + 1) % radar.layers.length;
    radarShow(next);
    radar.timer = setTimeout(radarTick, next === radar.layers.length - 1 ? 1800 : 600);
  }
  function radarPlay(play) {
    radar.playing = play;
    $('#radarPlay').innerHTML = play ? ICON_PAUSE : ICON_PLAY;
    $('#radarPlay').setAttribute('aria-label', play ? 'Pausa' : 'Reprodueix');
    clearTimeout(radar.timer);
    if (play) radar.timer = setTimeout(radarTick, 600);
  }
  async function radarLoad() {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const frames = (j.radar && j.radar.past) || [];
    if (!frames.length) throw new Error('sense imatges');
    radar.layers.forEach((l) => map.removeLayer(l));
    radar.times = frames.map((f) => f.time);
    radar.layers = frames.map((f) => L.tileLayer(`${j.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      pane: 'radar', opacity: 0, maxNativeZoom: 7, maxZoom: 17, attribution: 'Radar &copy; RainViewer',
    }).addTo(map));
    const range = $('#radarRange');
    range.max = frames.length - 1;
    radarShow(frames.length - 1);
  }
  async function setRadar(on) {
    radar.on = on; store.set('radar', on ? '1' : '0');
    $('#radarBtn').classList.toggle('on', on); $('#radarBtn').setAttribute('aria-pressed', on);
    $('#radarBar').classList.toggle('hidden', !on);
    clearInterval(radar.refresh); clearTimeout(radar.timer);
    if (!on) { radar.layers.forEach((l) => map.removeLayer(l)); radar.layers = []; radar.times = []; return; }
    try {
      await radarLoad();
      radarPlay(!reducedMotion);
      radar.refresh = setInterval(() => radarLoad().catch(() => {}), 5 * 60000);
    } catch (e) {
      toast('No s\'ha pogut carregar el radar de pluja.');
      setRadar(false);
    }
  }

  /* ---------------------------------------------------------------- events */
  $('#radarBtn').addEventListener('click', () => setRadar(!radar.on));
  $('#radarPlay').addEventListener('click', () => radarPlay(!radar.playing));
  $('#radarRange').addEventListener('input', (e) => { radarPlay(false); radarShow(Number(e.target.value)); });
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    S.varKey = b.dataset.var; store.set('var', S.varKey); renderAll();
  });
  $('#list').addEventListener('click', (e) => { const r = e.target.closest('.row'); if (r) select(r.dataset.id); });
  $('#list').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const r = e.target.closest('.row'); if (r) { e.preventDefault(); select(r.dataset.id); } } });
  $('#summary').addEventListener('click', (e) => { const s = e.target.closest('.stat[data-id]'); if (s) select(s.dataset.id); });
  $('#search').addEventListener('input', (e) => { S.query = e.target.value; renderList(); });
  $('#sortBtn').addEventListener('click', () => { S.sort = S.sort === 'value' ? 'name' : 'value'; renderList(); });
  $('#refreshBtn').addEventListener('click', () => refresh(true));
  $('#baseSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setBase(b.dataset.base); });
  $('#surfaceBtn').addEventListener('click', () => {
    S.surface = !S.surface; store.set('surface', S.surface ? '1' : '0');
    $('#surfaceBtn').classList.toggle('on', S.surface); $('#surfaceBtn').setAttribute('aria-pressed', S.surface);
    scheduleDraw();
  });
  $('#scaleBtn').addEventListener('click', () => {
    S.relative = !S.relative; store.set('relative', S.relative ? '1' : '0');
    $('#scaleBtn').classList.toggle('on', S.relative); $('#scaleBtn').setAttribute('aria-pressed', S.relative);
    renderAll();
  });
  $('#sheetHandle').addEventListener('click', () => $('#panel').classList.toggle('expanded'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.selected) select(null); });
  map.on('click', () => { if (S.selected) select(null); });
  addEventListener('resize', () => map.invalidateSize());

  /* ------------------------------------------------------------------ init */
  async function init() {
    renderTabs();
    $('#surfaceBtn').classList.toggle('on', S.surface);
    $('#scaleBtn').classList.toggle('on', S.relative); $('#scaleBtn').setAttribute('aria-pressed', S.relative);
    applyScale();
    try {
      const [st, co] = await Promise.all([fetch('data/estacions.json').then((r) => r.json()), fetch('data/comarca.json').then((r) => r.json())]);
      S.stations = st; S.comarca = co;
    } catch (e) { toast('No s\'han pogut carregar les dades de les estacions.'); return; }
    const ll = comarcaRings().flat().map(([lon, lat]) => [lat, lon]);
    const bounds = L.latLngBounds(ll);
    map.setMaxBounds(bounds.pad(2));
    map.invalidateSize();
    const { x: mw, y: mh } = map.getSize();
    const mobile = mw <= 860;
    map.fitBounds(bounds, mobile ? { paddingTopLeft: [10, 70], paddingBottomRight: [10, mh * 0.48] } : { paddingTopLeft: [Math.min(420, mw * 0.42), 30], paddingBottomRight: [30, 30] });
    map.setMinZoom(Math.max(9, Math.floor(map.getZoom()) - 1));
    setBase(S.base);
    initMarkers();
    renderAll();
    if (store.get('radar', '0') === '1') setRadar(true);
    await refresh();
    setInterval(() => refresh(), 60000);
    setInterval(renderLive, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && nowSec() - S.lastFetch > 60) refresh(); });
  }
  init();
})();
