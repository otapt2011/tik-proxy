// /api/video/[username]/[videoId].js

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

  const { username, videoId } = req.query;
  if (!username || !videoId) {
    return res.status(400).json({ error: 'Missing username or videoId' });
  }

  try {
    const url = `https://www.tiktok.com/@${username}/video/${videoId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();

    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Video data not found');
    const data = JSON.parse(match[1]);

    const videoData = data['__DEFAULT_SCOPE__']?.['webapp.video-detail'];
    if (!videoData) throw new Error('Video detail missing');
    const v = videoData.itemInfo?.itemStruct || videoData.itemInfo || {};

    const formatted = {
      id: v.id,
      videoUrl: v.video?.playAddr || v.video?.downloadAddr,
      cover: v.video?.cover || v.video?.dynamicCover,
      width: v.video?.width,
      height: v.video?.height,
      duration: v.video?.duration,
      playCount: v.stats?.playCount,
      diggCount: v.stats?.diggCount,
      commentCount: v.stats?.commentCount,
      shareCount: v.stats?.shareCount,
      downloadCount: v.stats?.downloadCount,
      description: v.desc,
      createTime: v.createTime,
      hashtags: v.textExtra?.filter(t => t.hashtagName).map(t => t.hashtagName) || []
    };

    res.status(200).json({
      success: true,
      video: formatted,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Single video API error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch video' });
  }
}
