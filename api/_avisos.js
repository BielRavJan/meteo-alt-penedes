const COMARQUES = { 3: 'alt-penedes', 6: 'anoia', 12: 'baix-penedes', 17: 'garraf' };

function extractArray(html, from) {
  const re = /[^A-Za-z]avisos:\s*\[/g;
  re.lastIndex = from;
  const m = re.exec(html);
  if (!m) return null;
  const start = m.index + m[0].length - 1;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
  }
  return null;
}

function affected(list) {
  const com = {};
  for (const x of list || []) {
    const id = COMARQUES[x.idComarca];
    if (id && x.perill > 0) com[id] = Math.max(com[id] || 0, x.perill);
  }
  return Object.keys(com).length ? com : null;
}

function normalize(raw) {
  const seen = new Set();
  const out = [];
  for (const day of raw || []) {
    for (const ep of day || []) {
      for (const a of ep.avisos || []) {
        if (a.estat !== 'Vigent' || a.tipus === 'Preavís') continue;
        const meteor = (ep.meteor && ep.meteor.nom) || 'Avís';
        const key = `${meteor}|${a.dataEmisio}|${a.tipus}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const dies = [];
        for (const ev of a.evolucions || []) {
          const periodes = [];
          for (const p of ev.periodes || []) {
            const comarques = affected(p.afectacions);
            if (comarques) periodes.push({ nom: p.nom, comarques });
          }
          if (periodes.length) {
            dies.push({
              dia: String(ev.dia).slice(0, 10),
              comentari: ev.comentari || '',
              llindars: [ev.llindar1, ev.llindar2].filter(Boolean),
              periodes,
            });
          }
        }
        const vigilancia = a.evolucions ? null : affected(a.afectacions);
        if (!dies.length && !vigilancia) continue;
        out.push({ meteor, tipus: a.tipus, emissio: a.dataEmisio, inici: a.dataInici, fi: a.dataFi, comentari: a.comentari || '', dies, vigilancia });
      }
    }
  }
  return out;
}

async function getAvisos() {
  const r = await fetch('https://www.meteo.cat/', {
    headers: { 'User-Agent': 'Mozilla/5.0 (PROJECTE-METEO)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const widget = html.indexOf("dom: 'mapaWidget'");
  const pre = html.indexOf('episodisPreavisos', widget < 0 ? 0 : widget);
  if (pre < 0) throw new Error('format');
  const raw = extractArray(html, pre + 'episodisPreavisos'.length);
  if (!raw) throw new Error('format');
  return normalize(raw);
}

module.exports = { getAvisos, normalize };
