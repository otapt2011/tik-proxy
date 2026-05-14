// /api/user/[username]/appcontext.js

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
  setCorsHeaders(res);

  // Authentication
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

    // Extract the main JSON blob
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');

    const data = JSON.parse(match[1]);

    // Directly access the app-context using bracket notation (handles hyphen)
    const appContext = data?.__DEFAULT_SCOPE__?.webapp?.['app-context'];

    if (!appContext) {
      // Fallback: try camelCase version
      const fallback = data?.__DEFAULT_SCOPE__?.webapp?.appContext;
      if (fallback) {
        return res.status(200).json({
          success: true,
          username,
          data: fallback,
          source: 'appContext (camelCase)',
          timestamp: new Date().toISOString()
        });
      }
      throw new Error('app-context not found in TikTok data');
    }

    // Return the full app-context object
    res.status(200).json({
      success: true,
      username,
      data: appContext,
      source: 'app-context (with hyphen)',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message === 'Profile not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
