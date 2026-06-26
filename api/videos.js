// /api/videos.js

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

  const username = req.query.username;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    // Fetch the profile HTML (same method as your /api/full.js)
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const profileRes = await fetch(profileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!profileRes.ok) throw new Error(`Profile page returned ${profileRes.status}`);
    const html = await profileRes.text();

    // Extract the hydration script
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Hydration data not found');
    const universalData = JSON.parse(match[1]);

    const userDetail = universalData['__DEFAULT_SCOPE__']?.['webapp.user-detail'];
    if (!userDetail) throw new Error('User detail not found');

    const itemList = userDetail.postItemList || userDetail.itemList || [];
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
      username,
      videoCount: videos.length,
      videos,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
}
