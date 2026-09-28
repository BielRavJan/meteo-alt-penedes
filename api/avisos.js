const { getAvisos } = require('./_avisos');

module.exports = async (req, res) => {
  try {
    const avisos = await getAvisos();
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ generated: Math.floor(Date.now() / 1000), ok: true, avisos });
  } catch {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(200).json({ generated: Math.floor(Date.now() / 1000), ok: false, avisos: [] });
  }
};
