// pages/api/user/[username]/appcontext.js

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (authHeader !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: 'Missing username' });
  }

  try {
    const url = `https://www.tiktok.com/@${username}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');
    
    const data = JSON.parse(match[1]);
    const appContext = data?.__DEFAULT_SCOPE__?.webapp?.['app-context'];
    
    if (!appContext) {
      throw new Error('app-context not found');
    }
    
    res.status(200).json({
      success: true,
      username,
      data: appContext,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const status = err.message === 'Profile not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
