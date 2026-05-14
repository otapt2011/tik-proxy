// /api/user/[username]/allkeys.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Extract all JSON data from the HTML (same as before)
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

// Recursively get all top-level keys from an object (limited depth)
function getAllTopLevelKeys(obj, prefix = '', maxDepth = 3) {
  if (maxDepth <= 0) return [];
  const keys = [];
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(fullKey);
      if (maxDepth > 1 && obj[key] && typeof obj[key] === 'object') {
        keys.push(...getAllTopLevelKeys(obj[key], fullKey, maxDepth - 1));
      }
    }
  }
  return keys;
}

// Find an object by a path (array of segments)
function getValueByPath(obj, pathSegments) {
  let current = obj;
  for (const seg of pathSegments) {
    if (current === null || typeof current !== 'object') return null;
    if (Array.isArray(current) && !isNaN(seg)) {
      current = current[parseInt(seg)];
    } else {
      current = current[seg];
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

  const { username, search, path: customPath, full } = req.query;
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

    // If a custom path is provided (e.g., "SIGI_STATE.webapp"), try to get that object
    let targetObject = null;
    let targetSource = null;
    if (customPath) {
      const segments = customPath.split('.');
      for (const jsonObj of allJsonData) {
        const found = getValueByPath(jsonObj, segments);
        if (found !== null) {
          targetObject = found;
          targetSource = `custom_path:${customPath}`;
          break;
        }
      }
    }

    // If no custom path or not found, try common variations of app-context
    if (!targetObject) {
      const variations = [
        ['__DEFAULT_SCOPE__', 'webapp', 'app-context'],
        ['__DEFAULT_SCOPE__', 'webapp', 'appContext'],
        ['SIGI_STATE', 'webapp', 'appContext'],
        ['SIGI_STATE', 'webapp', 'app-context'],
        ['__NEXT_DATA__', 'props', 'pageProps', 'webapp', 'appContext'],
        ['__INITIAL_STATE__', 'webapp', 'appContext']
      ];
      for (const segments of variations) {
        for (const jsonObj of allJsonData) {
          const found = getValueByPath(jsonObj, segments);
          if (found !== null) {
            targetObject = found;
            targetSource = segments.join('.');
            break;
          }
        }
        if (targetObject) break;
      }
    }

    // If still not found, gather all top-level keys for debugging
    let debugKeys = [];
    if (!targetObject) {
      for (const jsonObj of allJsonData) {
        debugKeys.push(...getAllTopLevelKeys(jsonObj, '', 2));
      }
      // Remove duplicates
      debugKeys = [...new Set(debugKeys)];
    }

    if (!targetObject) {
      // Also allow searching for a keyword
      if (search) {
        const matching = debugKeys.filter(k => k.toLowerCase().includes(search.toLowerCase()));
        return res.status(404).json({
          error: `No object found containing "${search}".`,
          debugKeys: debugKeys.slice(0, 100),
          matchingKeys: matching.slice(0, 20)
        });
      }
      return res.status(404).json({
        error: 'app-context (or similar) not found. Use ?search=keyword to find keys.',
        debugKeys: debugKeys.slice(0, 100)
      });
    }

    const topLevelKeys = Object.keys(targetObject);
    res.status(200).json({
      success: true,
      username: username,
      topLevelKeys: topLevelKeys,
      keyCount: topLevelKeys.length,
      source: targetSource,
      fullObject: full === '1' ? targetObject : undefined,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
