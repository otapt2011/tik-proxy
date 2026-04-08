// Helper: CORS headers
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Authorization, Content-Type');
}

// Extract secUid from profile HTML
async function getSecUidFromUsername(username) {
  const url = `https://www.tiktok.com/@${username}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await response.text();
  const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
  if (!match) throw new Error('Profile not found');
  const data = JSON.parse(match[1]);
  const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];
  return userDetail?.userInfo?.user?.secUid;
}

// Fetch videos using secUid
async function fetchVideos(secUid, limit = 12) {
  const apiUrl = `https://www.tiktok.com/api/user/item_list/?secUid=${encodeURIComponent(secUid)}&count=${Math.min(parseInt(limit), 50)}&cookie_enabled=true`;
  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.tiktok.com/',
      'Accept': 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Videos API returned ${response.status}`);
  const data = await response.json();
  const items = data.itemList || [];
  return items.slice(0, limit).map(v => ({
    id: v.id,
    videoUrl: v.video.playAddr,
    cover: v.video.cover,
    duration: v.video.duration,
    playCount: v.stats.playCount,
    diggCount: v.stats.diggCount,
    commentCount: v.stats.commentCount,
    shareCount: v.stats.shareCount,
    description: v.desc,
    createTime: v.createTime,
    hashtags: v.textExtra?.filter(t => t.hashtagName).map(t => t.hashtagName) || []
  }));
}

// Attempt to fetch following list (requires session – may fail)
async function fetchFollowing(secUid, limit = 30) {
  try {
    const url = `https://www.tiktok.com/api/user/following/?secUid=${secUid}&count=${limit}&sourceType=5`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.tiktok.com/'
      }
    });
    if (!response.ok) throw new Error('Following API failed');
    const data = await response.json();
    return (data.userList || []).map(u => ({
      id: u.userId,
      uniqueId: u.uniqueId,
      nickname: u.nickname,
      avatar: u.avatarThumb
    }));
  } catch (err) {
    return { error: err.message, note: 'Following list requires authenticated session – not available publicly' };
  }
}

// Attempt to fetch followers list (requires session – may fail)
async function fetchFollowers(secUid, limit = 30) {
  try {
    const url = `https://www.tiktok.com/api/user/follower/?secUid=${secUid}&count=${limit}&sourceType=5`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.tiktok.com/'
      }
    });
    if (!response.ok) throw new Error('Followers API failed');
    const data = await response.json();
    return (data.userList || []).map(u => ({
      id: u.userId,
      uniqueId: u.uniqueId,
      nickname: u.nickname,
      avatar: u.avatarThumb
    }));
  } catch (err) {
    return { error: err.message, note: 'Followers list requires authenticated session – not available publicly' };
  }
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

  const { username, limit = 12 } = req.query;
  if (!username) return res.status(400).json({ error: 'Missing username' });

  try {
    // 1. Fetch full profile (HTML scraping)
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const profileRes = await fetch(profileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await profileRes.text();
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/s);
    if (!match) throw new Error('Profile not found');
    const data = JSON.parse(match[1]);
    const userDetail = data['__DEFAULT_SCOPE__']['webapp.user-detail'];
    const userInfo = userDetail.userInfo;
    const secUid = userInfo.user.secUid;

    // Extract profile data
    const profile = {
      username: userInfo.user.uniqueId,
      displayName: userInfo.user.nickname,
      avatarUrl: userInfo.user.avatarLarger || userInfo.user.avatarMedium,
      bio: userInfo.user.signature || '',
      verified: userInfo.user.verified,
      privateAccount: userInfo.user.privateAccount,
      secUid: secUid
    };

    // Stats
    const stats = {
      followerCount: userInfo.stats.followerCount,
      followingCount: userInfo.stats.followingCount,
      heartCount: userInfo.stats.heartCount,
      videoCount: userInfo.stats.videoCount
    };

    // 2. Fetch videos (using secUid)
    let videos = [];
    try {
      videos = await fetchVideos(secUid, limit);
    } catch (err) {
      videos = { error: err.message };
    }

    // 3. Fetch following (best effort)
    let following = [];
    try {
      following = await fetchFollowing(secUid, 20);
    } catch (err) {
      following = { error: err.message };
    }

    // 4. Fetch followers (best effort)
    let followers = [];
    try {
      followers = await fetchFollowers(secUid, 20);
    } catch (err) {
      followers = { error: err.message };
    }

    // Final response
    res.status(200).json({
      success: true,
      username,
      profile,
      stats,
      videos: {
        count: Array.isArray(videos) ? videos.length : 0,
        items: videos,
        note: Array.isArray(videos) ? null : 'Failed to fetch videos'
      },
      following: {
        count: Array.isArray(following) ? following.length : 0,
        items: following,
        note: !Array.isArray(following) ? 'Following list requires authenticated session' : null
      },
      followers: {
        count: Array.isArray(followers) ? followers.length : 0,
        items: followers,
        note: !Array.isArray(followers) ? 'Followers list requires authenticated session' : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Full data error:', err);
    res.status(err.message === 'Profile not found' ? 404 : 500).json({ error: err.message });
  }
}
