// /api/user/[username].js

// Helper to set CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Recursively search any object for a region-like property (deep search)
function findRegionDeep(obj, depth = 0, path = '') {
  if (!obj || typeof obj !== 'object') return null;
  if (depth > 20) return null; // prevent infinite recursion

  // Possible keys for region (case-insensitive)
  const possibleKeys = ['region', 'accountRegion', 'regionCode', 'country', 'countryCode', 'locale', 'geo', 'location'];
  
  // Check current level for region keys
  for (const key of possibleKeys) {
    for (const actualKey in obj) {
      if (actualKey.toLowerCase() === key.toLowerCase() && typeof obj[actualKey] === 'string') {
        const val = obj[actualKey];
        // Accept two-letter uppercase codes or longer strings that start with a country code
        if (val.length === 2 && /^[A-Z]{2}$/.test(val)) {
          return { value: val, source: `${path}.${actualKey}` };
        }
        if (val && val.length >= 2 && /^[A-Z]{2}/.test(val)) {
          return { value: val.substring(0, 2).toUpperCase(), source: `${path}.${actualKey}` };
        }
      }
    }
  }

  // Also capture any two-letter uppercase string that might be a country code
  for (const key in obj) {
    if (typeof obj[key] === 'string' && obj[key].length === 2 && /^[A-Z]{2}$/.test(obj[key])) {
      return { value: obj[key], source: `${path}.${key}` };
    }
  }

  // Recursively search nested objects and arrays
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const found = findRegionDeep(obj[key], depth + 1, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
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

  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await response.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');

    const data = JSON.parse(match[1]);
    const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];

    // Extract region using deep recursive search (entire JSON)
    let regionInfo = null;
    if (userDetail) {
      regionInfo = findRegionDeep(userDetail);
    }

    res.status(200).json({
      success: true,
      data: userDetail,
      region: regionInfo ? regionInfo.value : null,
      regionSource: regionInfo ? regionInfo.source : null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message === 'Profile not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
