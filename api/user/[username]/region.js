// /api/user/[username]/region.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Deep search for a property named 'region' (case‑insensitive)
function findRegion(obj, depth = 0) {
  if (!obj || typeof obj !== 'object') return null;
  if (depth > 10) return null; // prevent infinite recursion
  
  // Check current level for region
  for (const key in obj) {
    if (key.toLowerCase() === 'region' && typeof obj[key] === 'string') {
      return obj[key];
    }
  }
  // Recursively search nested objects
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const found = findRegion(obj[key], depth + 1);
      if (found) return found;
    }
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

  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Missing username in URL path' });
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

    // Deep search for any property named 'region'
    let region = findRegion(userDetail);
    
    if (!region) {
      // Fallback: common known paths
      if (userDetail.userInfo?.user?.region) region = userDetail.userInfo.user.region;
      else if (userDetail.userInfo?.region) region = userDetail.userInfo.region;
      else if (userDetail.region) region = userDetail.region;
    }

    if (!region) {
      // For debugging: return the first few keys of the object to help locate region manually
      const topKeys = Object.keys(userDetail).slice(0, 10);
      throw new Error(`Region not found. Top-level keys: ${topKeys.join(', ')}. Check the full userDetail JSON to locate region field.`);
    }

    res.status(200).json({
      success: true,
      username: username,
      region: region,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
