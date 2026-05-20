// Helper to set CORS headers on every response
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Helper to fetch a single user's data
async function fetchUserDetail(username) {
  const url = `https://www.tiktok.com/@${username}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await response.text();
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new Error('Profile not found');
  const data = JSON.parse(match[1]);
  return data['__DEFAULT_SCOPE__']['webapp.user-detail'];
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

  const { username, usernames } = req.query;

  // Handle multiple usernames (comma‑separated)
  if (usernames) {
    const usernameList = usernames.split(',').map(u => u.trim()).filter(u => u);
    if (usernameList.length === 0) {
      return res.status(400).json({ error: 'No valid usernames provided' });
    }

    const results = [];
    for (const uname of usernameList) {
      try {
        const userDetail = await fetchUserDetail(uname);
        results.push({
          username: uname,
          success: true,
          data: userDetail,
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        results.push({
          username: uname,
          success: false,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      }
      // Optional small delay to avoid rate limiting (e.g., 200ms)
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return res.status(200).json({ results });
  }

  // Single username (original behaviour)
  if (!username) {
    return res.status(400).json({ error: 'Missing username or usernames parameter' });
  }

  try {
    const userDetail = await fetchUserDetail(username);
    res.status(200).json({ success: true, data: userDetail, timestamp: new Date().toISOString() });
  } catch (err) {
    const status = err.message === 'Profile not found' ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
}
