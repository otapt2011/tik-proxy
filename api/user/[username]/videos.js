// Helper: CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Fetch profile HTML to get secUid
async function getSecUidFromUsername(username) {
  const url = `https://www.tiktok.com/@${username}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await response.text();
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new Error('Profile not found');
  const data = JSON.parse(match[1]);
  const userInfo = data['__DEFAULT_SCOPE__']['webapp.user-detail']?.userInfo;
  if (!userInfo) throw new Error('User data missing');
  return userInfo.user.secUid;
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

  let { username, secUid, limit = 12 } = req.query;
  if (!username && !secUid) {
    return res.status(400).json({ error: 'Missing username or secUid' });
  }

  try {
    // If we only have username, fetch secUid first
    if (username && !secUid) {
      secUid = await getSecUidFromUsername(username);
    }

    // Use secUid to call TikTok's internal API
    const apiUrl = `https://www.tiktok.com/api/user/item_list/?secUid=${encodeURIComponent(secUid)}&count=${Math.min(parseInt(limit), 50)}&cookie_enabled=true`;
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': username ? `https://www.tiktok.com/@${username}` : 'https://www.tiktok.com/',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`TikTok API returned ${response.status}`);
    }

    const data = await response.json();
    const items = data.itemList || [];

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
      username: username || 'unknown',
      secUid,
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
