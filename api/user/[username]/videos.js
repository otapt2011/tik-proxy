// Helper: CORS headers
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

  let { username, limit = 30 } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    // Fetch profile page exactly like your working profile backend
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();

    // Extract the main JSON data
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile data not found');
    const data = JSON.parse(match[1]);
    const userDetail = data['__DEFAULT_SCOPE__']?.['webapp.user-detail'];
    if (!userDetail) throw new Error('User detail missing');

    // Get user info
    const userInfo = userDetail.userInfo;
    const secUid = userInfo?.user?.secUid;

    // Extract video list from the same JSON (it's already there)
    // The key is typically "itemList" or "postList"
    let items = userDetail?.itemList || userDetail?.postList || [];
    
    // Limit the number of videos
    const maxLimit = Math.min(parseInt(limit), 50);
    items = items.slice(0, maxLimit);

    const formatted = items.map(v => ({
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
    }));

    res.status(200).json({
      success: true,
      username: username,
      secUid: secUid,
      videos: formatted,
      count: formatted.length,
      hasMore: false,  // The HTML page only includes the first batch – no pagination
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Videos API error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch videos' });
  }
}
