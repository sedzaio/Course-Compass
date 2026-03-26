const express = require('express');
const router = express.Router();
const CanvasIntegration = require('../models/CanvasIntegration');
const auth = require('../middleware/auth');

// Get canvas integration
router.get('/', auth, async (req, res) => {
  try {
    const integration = await CanvasIntegration.findOne({ userId: req.userId });
    res.json(integration);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Save canvas integration
router.post('/', auth, async (req, res) => {
  try {
    const existing = await CanvasIntegration.findOne({ userId: req.userId });
    if (existing) {
      const updated = await CanvasIntegration.findOneAndUpdate(
        { userId: req.userId },
        req.body,
        { returnDocument: 'after' }
      );
      return res.json(updated);
    }
    const integration = new CanvasIntegration({ userId: req.userId, ...req.body });
    await integration.save();
    res.status(201).json(integration);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete canvas integration
router.delete('/', auth, async (req, res) => {
  try {
    await CanvasIntegration.findOneAndDelete({ userId: req.userId });
    res.json({ message: 'Canvas integration removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;