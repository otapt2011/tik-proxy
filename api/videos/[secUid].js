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

  const { secUid } = req.query;   // ← changed from path to query? No, keep as is – but wait, you're using [secUid].js so it's req.query.secUid. That's actually correct for dynamic routes in Vercel: req.query.secUid works. I'll keep it as is.
  const cursor = req.query.cursor || '0';
  if (!secUid) return res.status(400).json({ error: 'Missing secUid' });

  try {
    const tiktokUrl = `https://www.tiktok.com/api/post/item_list/?secUid=${encodeURIComponent(secUid)}&cursor=${cursor}&count=30`;
    const response = await fetch(tiktokUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.tiktok.com/',
        'Accept': 'application/json, text/plain, */*',
        // Uncomment and set TIKTOK_COOKIES in env if blocked
        // 'Cookie': process.env.TIKTOK_COOKIES || ''
      }
    });

    const rawText = await response.text();
    if (!response.ok) {
      return res.status(200).json({
        success: false,
        error: `TikTok returned ${response.status}`,
        details: rawText.substring(0, 1000)
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      return res.status(200).json({
        success: false,
        error: 'Failed to parse TikTok JSON',
        details: rawText.substring(0, 1000)
      });
    }

    const itemList = data.itemList;
    if (!itemList) {
      return res.status(200).json({
        success: false,
        error: 'TikTok response did not contain itemList',
        data   // send full data for inspection
      });
    }

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
      cursor: data.cursor,
      hasMore: data.hasMore,
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
