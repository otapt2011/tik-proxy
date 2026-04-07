function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (authHeader !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username, limit = 12 } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await response.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');
    const data = JSON.parse(match[1]);
    const itemModule = data['__DEFAULT_SCOPE__']['webapp.user-detail']?.itemModule || {};
    const videos = Object.values(itemModule).slice(0, parseInt(limit));
    const formatted = videos.map(v => ({
      id: v.id,
      videoUrl: v.video.playAddr,
      cover: v.video.cover,
      width: v.video.width,
      height: v.video.height,
      duration: v.video.duration,
      playCount: v.stats.playCount,
      diggCount: v.stats.diggCount,
      commentCount: v.stats.commentCount,
      shareCount: v.stats.shareCount,
      downloadCount: v.stats.downloadCount,
      description: v.desc,
      createTime: v.createTime,
      hashtags: v.textExtra?.filter(t => t.hashtagName).map(t => t.hashtagName) || []
    }));
    res.status(200).json({
      success: true,
      username,
      videos: formatted,
      count: formatted.length,
      hasMore: formatted.length >= parseInt(limit),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
