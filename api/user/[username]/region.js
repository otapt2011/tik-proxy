// /api/user/[username]/region.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Search for any of the known region field names, or a two‑letter uppercase string
function findRegionValue(obj, depth = 0, path = '') {
  if (!obj || typeof obj !== 'object') return null;
  if (depth > 15) return null;

  // Priority list of possible keys (case‑insensitive)
  const regionKeys = ['accountRegion', 'region', 'regionCode', 'country', 'countryCode', 'locale', 'geo'];
  for (const key of regionKeys) {
    for (const actualKey in obj) {
      if (actualKey.toLowerCase() === key.toLowerCase() && typeof obj[actualKey] === 'string') {
        const val = obj[actualKey];
        if (val.length === 2 && /^[A-Z]{2}$/.test(val)) {
          return { value: val, foundAt: `${path}.${actualKey}` };
        }
        // Also accept if it's a longer string but contains a common country code
        if (val && val.length >= 2) return { value: val.substring(0, 2).toUpperCase(), foundAt: `${path}.${actualKey}` };
      }
    }
  }

  // Scan for any two‑letter uppercase string as a fallback
  for (const key in obj) {
    if (typeof obj[key] === 'string' && obj[key].length === 2 && /^[A-Z]{2}$/.test(obj[key])) {
      return { value: obj[key], foundAt: `${path}.${key}` };
    }
  }

  // Recursively search nested objects
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const found = findRegionValue(obj[key], depth + 1, path ? `${path}.${key}` : key);
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
    if (!userDetail) throw new Error('User detail not found');

    const found = findRegionValue(userDetail);
    
    if (found && found.value) {
      return res.status(200).json({
        success: true,
        username: username,
        region: found.value,
        path: found.foundAt,
        timestamp: new Date().toISOString()
      });
    }
    
    // If still nothing, return helpful debug info
    const debug = {
      topKeys: Object.keys(userDetail),
      userInfoKeys: userDetail.userInfo ? Object.keys(userDetail.userInfo) : null,
      userInfoUserKeys: userDetail.userInfo?.user ? Object.keys(userDetail.userInfo.user) : null,
      statsKeys: userDetail.userInfo?.stats ? Object.keys(userDetail.userInfo.stats) : null,
      sampleUserInfo: userDetail.userInfo ? JSON.stringify(userDetail.userInfo).slice(0, 800) : null
    };
    throw new Error(`Region not found after deep search. Debug: ${JSON.stringify(debug)}`);
    
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
