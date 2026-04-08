// Helper: CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

export default async function handler(req, res) {
  // Handle preflight
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
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    // Fetch profile HTML
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const profileRes = await fetch(profileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await profileRes.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');
    const data = JSON.parse(match[1]);
    const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];
    const userInfo = userDetail.userInfo;

    // Extract profile data
    const profile = {
      username: userInfo.user.uniqueId,
      displayName: userInfo.user.nickname,
      avatarUrl: userInfo.user.avatarLarger || userInfo.user.avatarMedium,
      bio: userInfo.user.signature || '',
      verified: userInfo.user.verified,
      privateAccount: userInfo.user.privateAccount,
      secUid: userInfo.user.secUid
    };

    // Stats
    const stats = {
      followerCount: userInfo.stats.followerCount,
      followingCount: userInfo.stats.followingCount,
      heartCount: userInfo.stats.heartCount,
      videoCount: userInfo.stats.videoCount
    };

    // Final response
    res.status(200).json({
      success: true,
      username,
      profile,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Full data error:', err);
    res.status(err.message === 'Profile not found' ? 404 : 500).json({ error: err.message });
  }
}
