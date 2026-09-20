const stations = require('../../web/data/estacions.json');
const { xemaStats } = require('../_xema');

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  const st = stations.find((s) => s.id === id);
  if (!st) return res.status(404).json({});
  try {
    let data;
    if (st.src === 'xema') {
      data = await xemaStats(id);
    } else {
      const r = await fetch(`https://app.weathercloud.net/device/stats?code=${id}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (PROJECTE-METEO)', 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(8000),
      });
      data = r.ok ? await r.json() : {};
    }
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch {
    res.status(200).json({});
  }
};
