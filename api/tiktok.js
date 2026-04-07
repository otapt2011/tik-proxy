function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    return res.status(200).end();
  }

  setCorsHeaders(res);

  const authHeader = req.headers['x-api-key'] || req.headers['authorization'];
  const expectedKey = process.env.API_SECRET_KEY;
  if (!expectedKey || authHeader !== expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
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
    const userInfo = data['__DEFAULT_SCOPE__']['webapp.user-detail']['userInfo'];
    const profile = {
      username: userInfo.user.uniqueId,
      display_name: userInfo.user.nickname,
      avatar_url: userInfo.user.avatarLarger || userInfo.user.avatarMedium,
      followers: userInfo.stats.followerCount,
      following: userInfo.stats.followingCount,
      total_likes: userInfo.stats.heartCount,
      total_videos: userInfo.stats.videoCount
    };
    res.status(200).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
