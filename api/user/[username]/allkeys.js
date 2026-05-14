// /api/user/[username]/allkeys.js

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

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

// Access nested property with support for hyphenated keys (e.g., "app-context")
function getValueByPath(obj, pathSegments) {
  let current = obj;
  for (const seg of pathSegments) {
    if (current === null || typeof current !== 'object') return null;
    // Handle array indices
    if (Array.isArray(current) && /^\d+$/.test(seg)) {
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

  const { username, path, full } = req.query;
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

    // If a custom path is provided (dot-separated), use it
    let targetObject = null;
    let targetSource = null;
    if (path) {
      const segments = path.split('.');
      for (const jsonObj of allJsonData) {
        const found = getValueByPath(jsonObj, segments);
        if (found !== null) {
          targetObject = found;
          targetSource = `custom:${path}`;
          break;
        }
      }
    }

    // If not found or no path given, try the known app-context path
    if (!targetObject) {
      const knownPath = ['__DEFAULT_SCOPE__', 'webapp', 'app-context'];
      for (const jsonObj of allJsonData) {
        const found = getValueByPath(jsonObj, knownPath);
        if (found !== null) {
          targetObject = found;
          targetSource = '__DEFAULT_SCOPE__.webapp.app-context';
          break;
        }
      }
    }

    if (!targetObject) {
      // Fallback: collect all top-level keys for debugging
      const debugKeys = [];
      for (const jsonObj of allJsonData) {
        if (jsonObj && typeof jsonObj === 'object') {
          for (const key in jsonObj) {
            debugKeys.push(key);
          }
        }
      }
      const uniqueKeys = [...new Set(debugKeys)].slice(0, 100);
      return res.status(404).json({
        error: 'Target object not found. Use ?path=__DEFAULT_SCOPE__.webapp.app-context (with hyphen)',
        debugTopKeys: uniqueKeys
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
