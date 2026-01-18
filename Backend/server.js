require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-extension');

// Database Schemas
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  name: String,
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

const distractionSchema = new mongoose.Schema({
  userId: String,
  site: String,
  timestamp: Date,
  type: String,
  confidence: Number,
  createdAt: { type: Date, default: Date.now }
});

const analyticsSchema = new mongoose.Schema({
  userId: String,
  date: String,
  stats: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Distraction = mongoose.model('Distraction', distractionSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

// Root route
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'AI Browser Extension Backend',
    endpoints: [
      'POST /api/register-user',
      'POST /api/track-distraction',
      'POST /api/save-analytics',
      'GET /api/team-dashboard',
      'GET /api/health'
    ]
  });
});

// Routes

// 1. Register user
app.post('/api/register-user', async (req, res) => {
  try {
    const { userId, name } = req.body;
    
    let user = await User.findOne({ userId });
    if (!user) {
      user = new User({ userId, name, lastActive: new Date() });
      await user.save();
    }
    
    res.json({ success: true, user });
  } catch (error) {
    console.error('Register user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Track distraction
app.post('/api/track-distraction', async (req, res) => {
  try {
    const { userId, distraction, timestamp } = req.body;
    
    // Update user lastActive
    await User.updateOne({ userId }, { lastActive: new Date() });
    
    // Save distraction
    const newDistraction = new Distraction({
      userId,
      site: distraction.to,
      type: distraction.type,
      confidence: distraction.confidence,
      timestamp: new Date(timestamp)
    });
    await newDistraction.save();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Track distraction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Save analytics
app.post('/api/save-analytics', async (req, res) => {
  try {
    const { userId, date, stats } = req.body;
    
    // Update or create analytics record
    await Analytics.updateOne(
      { userId, date },
      { 
        userId,
        date,
        stats
      },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Save analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Get team dashboard
app.get('/api/team-dashboard', async (req, res) => {
  try {
    // Get all active users (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await User.find({ lastActive: { $gte: sevenDaysAgo } });
    
    if (activeUsers.length === 0) {
      return res.json({
        totalUsers: 0,
        averageProductivity: 0,
        userStats: {},
        teamDistractions: []
      });
    }

    // Get today's analytics for all users
    const today = new Date().toISOString().split('T')[0];
    const userStats = {};
    let totalProductivity = 0;

    for (const user of activeUsers) {
      const analytics = await Analytics.findOne({ userId: user.userId, date: today });
      
      let productivity = 100;
      if (analytics && analytics.stats) {
        const stats = analytics.stats;
        if (stats.totalTime > 0) {
          productivity = Math.round((stats.productiveTime / stats.totalTime) * 100);
        }
      }

      userStats[user.userId] = {
        name: user.name,
        productivity,
        distractionCount: analytics?.stats?.distractionCount || 0
      };
      
      totalProductivity += productivity;
    }

    const averageProductivity = Math.round(totalProductivity / activeUsers.length);

    // Get top team distractions (last 7 days)
    const distractions = await Distraction.find({ 
      timestamp: { $gte: sevenDaysAgo }
    });

    const distractionMap = {};
    distractions.forEach(d => {
      if (d.site) {
        distractionMap[d.site] = (distractionMap[d.site] || 0) + 1;
      }
    });

    const teamDistractions = Object.entries(distractionMap)
      .map(([site, count]) => ({ site, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      totalUsers: activeUsers.length,
      averageProductivity,
      userStats,
      teamDistractions
    });
  } catch (error) {
    console.error('Team dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`🌐 Network: 172.17.64.1:${PORT}`);
  // ...
});
