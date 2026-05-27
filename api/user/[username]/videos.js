// Helper: CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Fetch profile HTML to get secUid AND cookies
async function getSecUidAndCookies(username) {
  const url = `https://www.tiktok.com/@${username}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });
  if (!response.ok) throw new Error(`Profile fetch failed: ${response.status}`);
  const html = await response.text();
  
  // Extract secUid from the embedded JSON
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new Error('Profile JSON not found');
  const data = JSON.parse(match[1]);
  const userInfo = data['__DEFAULT_SCOPE__']['webapp.user-detail']?.userInfo;
  if (!userInfo) throw new Error('User data missing');
  const secUid = userInfo.user.secUid;
  
  // Get cookies from the response headers (set-cookie)
  const cookies = response.headers.get('set-cookie');
  let cookieString = '';
  if (cookies) {
    // Extract important cookies: tt_webid_v2, sessionid, etc.
    const cookiePairs = cookies.split(',').map(c => c.split(';')[0]);
    cookieString = cookiePairs.join('; ');
  }
  
  return { secUid, cookies: cookieString };
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

  let { username, secUid, limit = 12, cursor = 0 } = req.query;
  if (!username && !secUid) {
    return res.status(400).json({ error: 'Missing username or secUid' });
  }

  try {
    let cookies = '';
    // If we only have username, fetch secUid and cookies
    if (username && !secUid) {
      const result = await getSecUidAndCookies(username);
      secUid = result.secUid;
      cookies = result.cookies;
    } else {
      // For secUid-only requests, we still need a cookie – fetch a dummy cookie from TikTok home
      const homeRes = await fetch('https://www.tiktok.com', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }
      });
      const setCookie = homeRes.headers.get('set-cookie');
      if (setCookie) {
        cookies = setCookie.split(',').map(c => c.split(';')[0]).join('; ');
      }
    }

    const maxLimit = Math.min(parseInt(limit), 50);
    const apiUrl = `https://www.tiktok.com/api/user/item_list/?secUid=${encodeURIComponent(secUid)}&count=${maxLimit}&cursor=${parseInt(cursor)}&cookie_enabled=true`;
    
    const response = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': username ? `https://www.tiktok.com/@${username}` : 'https://www.tiktok.com/',
        'Cookie': cookies,
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`TikTok API returned ${response.status}`);
    }

    const data = await response.json();
    const items = data.itemList || [];
    const hasMore = data.hasMore === true;
    const nextCursor = data.cursor || 0;

    const formatted = items.map(v => ({
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
      cursor: parseInt(cursor),
      nextCursor: nextCursor,
      hasMore: hasMore,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Videos API error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch videos' });
  }
}
