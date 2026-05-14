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

function getValueByKeyArray(obj, keys) {
  let current = obj;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return null;
    current = current[key];
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
    return res.status(400).json({ error: 'Missing username' });
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

    let targetObject = null;
    let targetSource = null;

    if (path) {
      const keys = path.split('.');
      for (const jsonObj of allJsonData) {
        const found = getValueByKeyArray(jsonObj, keys);
        if (found !== null) {
          targetObject = found;
          targetSource = path;
          break;
        }
      }
    }

    if (!targetObject) {
      let debugKeys = [];
      if (allJsonData.length > 0 && allJsonData[0]) {
        debugKeys = Object.keys(allJsonData[0]).slice(0, 100);
      }
      return res.status(404).json({
        error: `Object not found at path "${path || 'none'}"`,
        debugTopKeys: debugKeys,
        hint: 'Try ?path=__DEFAULT_SCOPE__.webapp.app-context'
      });
    }

    const topLevelKeys = Object.keys(targetObject);
    const result = {
      success: true,
      username,
      topLevelKeys,
      keyCount: topLevelKeys.length,
      source: targetSource,
      timestamp: new Date().toISOString()
    };
    if (full === '1') {
      result.fullObject = targetObject;
    }
    res.status(200).json(result);
  } catch (err) {
    const status = err.message.includes('Profile not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
