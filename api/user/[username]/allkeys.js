// /api/user/[username]/allkeys.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Extract all JSON data from the HTML (same as region.js)
function extractAllJsonFromHtml(html) {
  const jsonData = [];
  
  const mainMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (mainMatch) {
    try { jsonData.push(JSON.parse(mainMatch[1])); } catch(e) {}
  }
  
  const allScripts = html.match(/<script[^>]*id="([^"]*)"[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gis);
  if (allScripts) {
    for (const script of allScripts) {
      const match = script.match(/>([\s\S]*?)<\/script>/);
      if (match) {
        try { jsonData.push(JSON.parse(match[1])); } catch(e) {}
      }
    }
  }
  
  const inlineScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
  if (inlineScripts) {
    for (const script of inlineScripts) {
      const nextDataMatch = script.match(/__NEXT_DATA__\s*=\s*({[\s\S]*?});/);
      if (nextDataMatch) {
        try { jsonData.push(JSON.parse(nextDataMatch[1])); } catch(e) {}
      }
      const initStateMatch = script.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
      if (initStateMatch) {
        try { jsonData.push(JSON.parse(initStateMatch[1])); } catch(e) {}
      }
    }
  }
  return jsonData;
}

// Recursively walk an object to find a path like __DEFAULT_SCOPE__.webapp["app-context"]
function getValueByPath(obj, pathSegments) {
  if (!obj || typeof obj !== 'object') return null;
  let current = obj;
  for (const segment of pathSegments) {
    if (current === null || typeof current !== 'object') return null;
    if (Array.isArray(current) && !isNaN(segment)) {
      current = current[parseInt(segment)];
    } else {
      current = current[segment];
    }
    if (current === undefined) return null;
  }
  return current;
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
    const allJsonData = extractAllJsonFromHtml(html);

    const targetPath = ['__DEFAULT_SCOPE__', 'webapp', 'app-context']; // note: hyphen in key
    let appContextObj = null;
    let source = null;

    // Search each JSON blob for the target path
    for (const jsonObj of allJsonData) {
      const found = getValueByPath(jsonObj, targetPath);
      if (found !== null) {
        appContextObj = found;
        source = 'found in JSON blob';
        break;
      }
    }

    // Also try without hyphen (just in case)
    if (!appContextObj) {
      const altPath = ['__DEFAULT_SCOPE__', 'webapp', 'appContext'];
      for (const jsonObj of allJsonData) {
        const found = getValueByPath(jsonObj, altPath);
        if (found !== null) {
          appContextObj = found;
          source = 'found as appContext (no hyphen)';
          break;
        }
      }
    }

    if (!appContextObj || typeof appContextObj !== 'object') {
      return res.status(404).json({ error: 'app-context not found in any script' });
    }

    const topLevelKeys = Object.keys(appContextObj);
    res.status(200).json({
      success: true,
      username: username,
      topLevelKeys: topLevelKeys,
      keyCount: topLevelKeys.length,
      source: source,
      // optional: include the full object if needed (comment out for large responses)
      // fullObject: appContextObj,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
