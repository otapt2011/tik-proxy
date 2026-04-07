function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  if (authHeader !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { usernames } = req.body;
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Provide an array of usernames' });
  }

  const results = [];
  for (const username of usernames) {
    try {
      const url = `https://www.tiktok.com/@${username}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await response.text();
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
      if (!match) throw new Error('Profile not found');
      const data = JSON.parse(match[1]);
      const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];
      results.push({ username, success: true, data: userDetail });
    } catch (err) {
      results.push({ username, success: false, error: err.message });
    }
    await new Promise(r => setTimeout(r, 500));
  }
  res.status(200).json({ success: true, results, timestamp: new Date().toISOString() });
}
