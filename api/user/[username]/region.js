// /api/user/region.js  or  /api/user/region/[username].js depending on your routing

// Helper to set CORS headers on every response
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  // Apply CORS headers to actual response
  setCorsHeaders(res);

  // Authentication
  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (authHeader !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Extract username from query parameter (for flexible routing)
  // Supports both /api/user/region?username=xxx and /api/user/region/xxx
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const html = await response.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');
    
    const data = JSON.parse(match[1]);
    const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];
    if (!userDetail) throw new Error('User detail not found in scraped data');

    // Extract region – try multiple possible paths
    let region = null;
    if (userDetail.userInfo?.user?.region) {
      region = userDetail.userInfo.user.region;
    } else if (userDetail.userInfo?.region) {
      region = userDetail.userInfo.region;
    } else if (userDetail.region) {
      region = userDetail.region;
    } else {
      // fallback: check if any nested object contains a 'region' field
      const findRegion = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.region && typeof obj.region === 'string') return obj.region;
        for (const key in obj) {
          if (obj[key] && typeof obj[key] === 'object') {
            const found = findRegion(obj[key]);
            if (found) return found;
          }
        }
        return null;
      };
      region = findRegion(userDetail);
    }

    if (!region) {
      throw new Error('Region not found for this user');
    }

    res.status(200).json({
      success: true,
      username: username,
      region: region,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message === 'Profile not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
