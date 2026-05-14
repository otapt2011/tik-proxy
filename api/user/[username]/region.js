// /api/user/[username]/region.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Recursively search any object for a region-like property
function findRegionDeep(obj, depth = 0, path = '') {
  if (!obj || typeof obj !== 'object') return null;
  if (depth > 20) return null;

  // Direct match for various possible region field names (case-insensitive)
  const possibleKeys = ['region', 'accountRegion', 'regionCode', 'country', 'countryCode', 'locale', 'geo', 'location'];
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

  // Recursively search nested objects
  for (const key in obj) {
    if (obj[key] && typeof obj[key] === 'object') {
      const found = findRegionDeep(obj[key], depth + 1, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

// Extract all JSON data from any <script> tag that looks like a data blob
function extractAllJsonFromHtml(html) {
  const jsonData = [];
  
  // 1. The known __UNIVERSAL_DATA_FOR_REHYDRATION__ (already in userDetail)
  const mainMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (mainMatch) {
    try {
      jsonData.push(JSON.parse(mainMatch[1]));
    } catch(e) {}
  }
  
  // 2. Other script tags with type="application/json" or id containing "data"
  const allScripts = html.match(/<script[^>]*id="([^"]*)"[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gis);
  if (allScripts) {
    for (const script of allScripts) {
      const match = script.match(/>([\s\S]*?)<\/script>/);
      if (match) {
        try {
          jsonData.push(JSON.parse(match[1]));
        } catch(e) {}
      }
    }
  }
  
  // 3. Look for __NEXT_DATA__ or other global variables embedded in inline scripts
  const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (inlineScripts) {
    for (const script of inlineScripts) {
      // Try to find __NEXT_DATA__ = {...};
      const nextDataMatch = script.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?});/);
      if (nextDataMatch) {
        try {
          jsonData.push(JSON.parse(nextDataMatch[1]));
        } catch(e) {}
      }
      // Try to find window.__INITIAL_STATE__ or similar
      const initStateMatch = script.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (initStateMatch) {
        try {
          jsonData.push(JSON.parse(initStateMatch[1]));
        } catch(e) {}
      }
    }
  }
  
  return jsonData;
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
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const html = await response.text();
    
    // 1. First try the known userDetail object (already deep-searched)
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    let userDetail = null;
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        userDetail = data['__DEFAULT_SCOPE__']?.['webapp.user-detail'];
      } catch(e) {}
    }
    
    let regionInfo = null;
    if (userDetail) {
      regionInfo = findRegionDeep(userDetail);
      if (regionInfo && regionInfo.value) {
        return res.status(200).json({
          success: true,
          username: username,
          region: regionInfo.value,
          source: `userDetail.${regionInfo.source}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // 2. Search all other JSON blobs in the page
    const allJsonData = extractAllJsonFromHtml(html);
    for (const jsonObj of allJsonData) {
      regionInfo = findRegionDeep(jsonObj);
      if (regionInfo && regionInfo.value) {
        return res.status(200).json({
          success: true,
          username: username,
          region: regionInfo.value,
          source: `other_script.${regionInfo.source}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // 3. Final fallback: scan raw HTML for two-letter country codes in common patterns
    const htmlRegionMatch = html.match(/"region":"([A-Z]{2})"/i) || html.match(/"accountRegion":"([A-Z]{2})"/i);
    if (htmlRegionMatch) {
      return res.status(200).json({
        success: true,
        username: username,
        region: htmlRegionMatch[1],
        source: 'html_regex',
        timestamp: new Date().toISOString()
      });
    }
    
    throw new Error('Region not found in any script tag or HTML');
    
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
