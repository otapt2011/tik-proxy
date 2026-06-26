// /api/videos.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Deep search for any array that contains objects with an "aweme_id" field
function findVideoList(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 10) return null;
  if (Array.isArray(obj)) {
    // Check if this array looks like a video list
    if (obj.length > 0 && obj[0].aweme_id) {
      return obj;
    }
  }
  // Recurse into object values
  const keys = Object.keys(obj);
  for (const key of keys) {
    const result = findVideoList(obj[key], depth + 1);
    if (result) return result;
  }
  return null;
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
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const profileRes = await fetch(profileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!profileRes.ok) throw new Error(`Profile page returned ${profileRes.status}`);
    const html = await profileRes.text();

    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Hydration data not found');
    const universalData = JSON.parse(match[1]);

    // Find the video list anywhere inside the data
    const itemList = findVideoList(universalData);
    if (!itemList || itemList.length === 0) {
      return res.status(200).json({
        success: false,
        error: 'No video list found in the page data',
        // Include a small part of the data for debugging (you can remove this later)
        sampleData: JSON.stringify(universalData).substring(0, 500)
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
      username,
      videoCount: videos.length,
      videos,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(200).json({ success: false, error: err.message });
  }
}
