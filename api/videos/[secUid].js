// /api/videos/[secUid].js

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

  const { secUid } = req.query;    // secUid from query string
  if (!secUid) return res.status(400).json({ error: 'Missing secUid' });

  try {
    // Step 1 – find a public username that belongs to this secUid.
    // We can use TikTok's user/detail API to get the uniqueId (username) from secUid.
    // That endpoint is less blocked, so it's a safe first step.
    const userApiUrl = `https://www.tiktok.com/api/user/detail/?secUid=${encodeURIComponent(secUid)}`;
    const userRes = await fetch(userApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.tiktok.com/',
      }
    });
    if (!userRes.ok) throw new Error(`User API returned ${userRes.status}`);
    const userData = await userRes.json();
    const username = userData?.userInfo?.user?.uniqueId || userData?.user?.uniqueId;
    if (!username) throw new Error('Could not determine username from secUid');

    // Step 2 – fetch the profile HTML (same way as your /api/full.js)
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const profileRes = await fetch(profileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!profileRes.ok) throw new Error(`Profile page returned ${profileRes.status}`);
    const html = await profileRes.text();

    // Step 3 – extract the hydration script
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Hydration script not found');
    const universalData = JSON.parse(match[1]);

    // Step 4 – get the user-detail object, which contains the video list
    const userDetail = universalData['__DEFAULT_SCOPE__']?.['webapp.user-detail'];
    if (!userDetail) throw new Error('User detail not found in hydration data');

    // The video list is typically under userDetail.postItemList (or sometimes userDetail.itemList)
    const itemList = userDetail.postItemList || userDetail.itemList || [];
    const cursor = userDetail.cursor || '0';
    const hasMore = userDetail.hasMore ?? false;

    const videos = itemList.map(item => ({
      videoId: item.aweme_id,
      desc: item.desc,
      createTime: item.createTime,
      duration: item.video?.duration,
      downloadAddr: item.video?.download_addr?.url_list?.[0] || null,
      playAddr: item.video?.play_addr?.url_list?.[0] || null,
      cover: item.video?.cover?.url_list?.[0] || null,
      stats: {
        diggCount: item.stats?.diggCount,
        shareCount: item.stats?.shareCount,
        commentCount: item.stats?.commentCount,
        playCount: item.stats?.playCount
      }
    }));

    res.status(200).json({
      success: true,
      secUid,
      username,
      cursor,
      hasMore,
      videoCount: videos.length,
      videos,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(200).json({
      success: false,
      error: err.message
    });
  }
}
