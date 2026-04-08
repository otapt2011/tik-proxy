// Helper: CORS headers for every response
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  // Authentication
  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (authHeader !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username, limit = 12 } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    // TikTok internal API endpoint for user videos
    const apiUrl = `https://www.tiktok.com/api/user/item_list/?unique_id=${encodeURIComponent(username)}&count=${Math.min(parseInt(limit), 50)}&cookie_enabled=true`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `https://www.tiktok.com/@${username}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`TikTok API returned ${response.status}`);
    }

    const data = await response.json();
    const items = data.itemList || [];

    // Format videos consistently with your previous structure
    const formatted = items.slice(0, parseInt(limit)).map(v => ({
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
      hasMore: items.length > parseInt(limit),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Videos API error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch videos' });
  }
}
