const SODA = 'https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json';

async function getJson(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

function madridMidnightUtc(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const wallAsUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset);
}

const iso = (d) => d.toISOString().slice(0, 19);
const query = (where) => `${SODA}?$limit=20000&$where=${encodeURIComponent(where)}`;
const num = (x) => { const n = parseFloat(x); return Number.isFinite(n) ? n : null; };
const epochOf = (s) => Date.parse(s + 'Z') / 1000;

async function xemaValues(stations) {
  const out = {};
  if (!stations.length) return out;
  const now = new Date();
  const codes = stations.map((s) => `'${s.id}'`).join(',');
  const since = iso(new Date(now.getTime() - 3 * 3600e3));
  const mid = iso(madridMidnightUtc(now));
  const [rows, rainRows] = await Promise.all([
    getJson(query(`codi_estacio in(${codes}) AND codi_variable in('30','31','32','33','34','35','36','50') AND data_lectura >= '${since}'`)),
    getJson(query(`codi_estacio in(${codes}) AND codi_variable='35' AND data_lectura >= '${mid}'`)),
  ]);
  const rain = {};
  for (const r of rainRows) {
    const v = num(r.valor_lectura);
    if (v !== null) rain[r.codi_estacio] = (rain[r.codi_estacio] || 0) + v;
  }
  const byStation = {};
  for (const r of rows) (byStation[r.codi_estacio] ||= []).push(r);
  const alt = Object.fromEntries(stations.map((s) => [s.id, s.alt || 0]));
  for (const [id, list] of Object.entries(byStation)) {
    list.sort((a, b) => (a.data_lectura < b.data_lectura ? 1 : -1));
    const latest = {};
    for (const r of list) {
      const k = String(r.codi_variable);
      const v = num(r.valor_lectura);
      if (!(k in latest) && v !== null) latest[k] = v;
    }
    const o = { epoch: Math.min(now.getTime() / 1000, epochOf(list[0].data_lectura) + 1800) };
    if ('32' in latest) o.temp = latest['32'];
    if ('33' in latest) o.hum = latest['33'];
    if ('30' in latest) o.wspd = latest['30'];
    if ('31' in latest) o.wdir = latest['31'];
    if ('34' in latest) {
      const h = alt[id], t = '32' in latest ? latest['32'] : 15;
      o.bar = Math.round(latest['34'] * Math.pow(1 - (0.0065 * h) / (t + 0.0065 * h + 273.15), -5.257) * 10) / 10;
    }
    if ('36' in latest) o.solarrad = latest['36'];
    if ('50' in latest) o.wspdhi = latest['50'];
    if (id in rain) o.rain = Math.round(rain[id] * 10) / 10;
    if ('35' in latest) o.rainrate = Math.round(latest['35'] * 20) / 10;
    if ('temp' in o && 'hum' in o && o.hum > 0) {
      const t = o.temp, h = o.hum;
      const gm = Math.log(h / 100) + (17.62 * t) / (243.12 + t);
      o.dew = Math.round(((243.12 * gm) / (17.62 - gm)) * 10) / 10;
      const e = (h / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
      o.feels = Math.round((t + 0.33 * e - 0.7 * (o.wspd || 0) - 4) * 10) / 10;
    }
    out[id] = o;
  }
  return out;
}

async function xemaStats(id) {
  const mid = iso(madridMidnightUtc(new Date()));
  const rows = await getJson(query(`codi_estacio='${id}' AND codi_variable in('35','40','42') AND data_lectura >= '${mid}'`));
  const res = {};
  let rain = 0, hasRain = false;
  for (const r of rows) {
    const v = num(r.valor_lectura);
    if (v === null) continue;
    const ep = epochOf(r.data_extrem || r.data_lectura);
    const k = String(r.codi_variable);
    if (k === '35') { rain += v; hasRain = true; }
    if (k === '40' && (!res.temp_day_max || v > res.temp_day_max[1])) res.temp_day_max = [ep, v];
    if (k === '42' && (!res.temp_day_min || v < res.temp_day_min[1])) res.temp_day_min = [ep, v];
  }
  if (hasRain) res.rain_day_total = Math.round(rain * 10) / 10;
  return res;
}

module.exports = { xemaValues, xemaStats };
