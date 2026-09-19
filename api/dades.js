const stations = require('../web/data/estacions.json');

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (PROJECTE-METEO)', 'X-Requested-With': 'XMLHttpRequest' };

module.exports = async (req, res) => {
  const results = await Promise.all(stations.map(async (s) => {
    try {
      const r = await fetch(`https://app.weathercloud.net/device/values?code=${s.id}`, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return [s.id, null];
      return [s.id, await r.json()];
    } catch {
      return [s.id, null];
    }
  }));
  const values = Object.fromEntries(results.filter(([, v]) => v));
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  res.status(200).json({ generated: Math.floor(Date.now() / 1000), ok: Object.keys(values).length, total: stations.length, values });
};
