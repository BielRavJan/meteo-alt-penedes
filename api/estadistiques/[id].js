const stations = require('../../web/data/estacions.json');

module.exports = async (req, res) => {
  const id = String(req.query.id || '');
  if (!stations.some((s) => s.id === id)) return res.status(404).json({});
  try {
    const r = await fetch(`https://app.weathercloud.net/device/stats?code=${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (PROJECTE-METEO)', 'X-Requested-With': 'XMLHttpRequest' },
      signal: AbortSignal.timeout(8000),
    });
    const data = r.ok ? await r.json() : {};
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch {
    res.status(200).json({});
  }
};
