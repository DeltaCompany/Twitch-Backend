// Extension Backend Service (EBS)
// This connects your Twitch Extension to your Alert Server

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 8081;

// YOUR EXTENSION CREDENTIALS
const EXTENSION_SECRET = '5IwAxUB0zY+1K48beAn888udPj59RfVWCCqZu+MdUP8='; // From Twitch Dev Console
const EXTENSION_CLIENT_ID = '6r0cobne2a7yby2exidbibdl07vi2w';

// Your alert server URL
const ALERT_SERVER_URL = process.env.ALERT_SERVER_URL || 'http://localhost:3000';

app.use(cors());
app.use(express.json());

// In-memory user data (in production, use a database)
const userData = new Map();

// Verify Twitch Extension JWT
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, Buffer.from(EXTENSION_SECRET, 'base64'));
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'Extension Backend Service' });
});

// Get user data
app.get('/user/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;
  const user = userData.get(userId) || {
    weaponBall: {
      name: '',
      weapon: 'sword',
      color: '#ff6b6b'
    },
    stats: {
      dungeonsWon: 0,
      duelsWon: 0,
      bossesKilled: 0,
      deaths: 0,
      loot: []
    }
  };
  
  res.json(user);
});

// Save weapon ball
app.post('/ball/save', verifyToken, (req, res) => {
  const { userId, ball } = req.body;
  
  if (!userData.has(userId)) {
    userData.set(userId, {
      weaponBall: ball,
      stats: {
        dungeonsWon: 0,
        duelsWon: 0,
        bossesKilled: 0,
        deaths: 0,
        loot: []
      }
    });
  } else {
    const user = userData.get(userId);
    user.weaponBall = ball;
    userData.set(userId, user);
  }
  
  res.json({ success: true });
});

// Join dungeon
app.post('/dungeon/join', verifyToken, async (req, res) => {
  const { userId, channelId, ball } = req.body;
  
  try {
    // Send to alert server to add player to next dungeon
    await axios.post(`${ALERT_SERVER_URL}/api/dungeon/join`, {
      userId,
      channelId,
      ball: {
        id: userId,
        name: ball.name,
        weapon: { type: ball.weapon },
        color: ball.color,
        // Additional ball properties
        x: Math.random() * 200 + 100,
        y: Math.random() * 200 + 100,
        vx: Math.random() * 4 - 2,
        vy: Math.random() * 4 - 2,
        hp: 100,
        maxHp: 100,
        size: 20,
        team: Math.random() > 0.5 ? 0 : 1,
        maxSpeed: ball.weapon === 'unarmed' ? 3 : 15
      }
    });
    
    res.json({ success: true, message: 'Joined next dungeon!' });
  } catch (err) {
    console.error('Failed to join dungeon:', err);
    res.status(500).json({ error: 'Failed to join dungeon' });
  }
});

// Redeem TTS
app.post('/redeem/tts', verifyToken, async (req, res) => {
  const { userId, channelId, text } = req.body;
  
  // In production: verify user has enough channel points via Twitch API
  
  try {
    // Send TTS to alert server
    await axios.post(`${ALERT_SERVER_URL}/api/alert/trigger`, {
      alertType: 'message',
      config: {
        message: text,
        duration: 5000,
        tags: []
      },
      source: 'extension',
      userId
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to trigger TTS:', err);
    res.status(500).json({ error: 'Failed to trigger alert' });
  }
});

// Redeem Media Share
app.post('/redeem/media', verifyToken, async (req, res) => {
  const { userId, channelId, url } = req.body;
  
  try {
    // TODO: Validate YouTube URL
    
    await axios.post(`${ALERT_SERVER_URL}/api/alert/trigger`, {
      alertType: 'media',
      config: {
        url,
        tags: ['fullscreen']
      },
      source: 'extension',
      userId
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to trigger media:', err);
    res.status(500).json({ error: 'Failed to trigger media' });
  }
});

// Redeem Effect
app.post('/redeem/effect', verifyToken, async (req, res) => {
  const { userId, channelId, effect } = req.body;
  
  try {
    await axios.post(`${ALERT_SERVER_URL}/api/alert/trigger`, {
      alertType: 'effect',
      config: {
        effect,
        tags: []
      },
      source: 'extension',
      userId
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to trigger effect:', err);
    res.status(500).json({ error: 'Failed to trigger effect' });
  }
});

// Get user stats
app.get('/stats/:userId', verifyToken, (req, res) => {
  const userId = req.params.userId;
  const user = userData.get(userId);
  
  if (user) {
    res.json(user.stats);
  } else {
    res.json({
      dungeonsWon: 0,
      duelsWon: 0,
      bossesKilled: 0,
      deaths: 0,
      loot: []
    });
  }
});

// Update stats (called by alert server when dungeon ends)
app.post('/stats/update', async (req, res) => {
  // Verify this request is from your alert server (use a shared secret)
  const { userId, statsUpdate } = req.body;
  
  const user = userData.get(userId) || {
    weaponBall: { name: '', weapon: 'sword', color: '#ff6b6b' },
    stats: {
      dungeonsWon: 0,
      duelsWon: 0,
      bossesKilled: 0,
      deaths: 0,
      loot: []
    }
  };
  
  // Merge stats
  Object.assign(user.stats, statsUpdate);
  userData.set(userId, user);
  
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Extension Backend Service running on port ${PORT}`);
  console.log(`📡 Connected to Alert Server: ${ALERT_SERVER_URL}`);
});