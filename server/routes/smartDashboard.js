const express = require('express');
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const {
  generateWelcome,
  getDashboardData,
  getRecommendations,
  trackBehavior,
  getBehaviorInsights,
} = require('../utils/aiOrchestrator');

const router = express.Router();
router.use(authMiddleware);

router.get('/welcome', async (req, res) => {
  try {
    const welcome = await generateWelcome(req.user);
    res.json({ success: true, data: welcome });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/data', async (req, res) => {
  try {
    const data = await getDashboardData(req.user);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/recommendations', async (req, res) => {
  try {
    const recs = await getRecommendations(req.user);
    res.json({ success: true, data: recs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/behavior', async (req, res) => {
  try {
    const { action, metadata } = req.body;
    if (!action) return res.status(400).json({ success: false, error: 'action required' });
    await trackBehavior(req.user.id, action, metadata || {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/behavior/insights', async (req, res) => {
  try {
    const insights = await getBehaviorInsights(req.user.id);
    res.json({ success: true, data: insights });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
