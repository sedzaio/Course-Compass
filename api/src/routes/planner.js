const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const User     = require('../models/User');

// ── GET /planner/preferences ──────────────────────────────────────────────────
router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      studyPlanner: user.studyPlanner || {},
      firstDayOfWeek: user.preferences?.firstDayOfWeek || 'sunday',
    });
  } catch (err) {
    console.error('GET /planner/preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ── PUT /planner/preferences ──────────────────────────────────────────────────
router.put('/preferences', auth, async (req, res) => {
  try {
    const { availability, bufferHours, maxSessionHours, breakMinutes } = req.body;

    // Validate bufferHours
    if (bufferHours !== undefined) {
      const b = Number(bufferHours);
      if (isNaN(b) || b < 1) {
        return res.status(400).json({ message: 'Buffer must be at least 1 hour.' });
      }
    }

    // Validate maxSessionHours if provided
    if (maxSessionHours !== undefined && maxSessionHours !== null) {
      const m = Number(maxSessionHours);
      if (isNaN(m) || m <= 0 || m > 23.75) {
        return res.status(400).json({ message: 'Max session must be between 0:15 and 23:45.' });
      }
    }

    // Validate breakMinutes
    if (breakMinutes !== undefined) {
      const allowed = [0, 15, 30, 45, 60];
      if (!allowed.includes(Number(breakMinutes))) {
        return res.status(400).json({ message: 'Break minutes must be 0, 15, 30, 45, or 60.' });
      }
    }

    // Validate availability blocks
    if (availability !== undefined) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      for (const block of availability) {
        if (!days.includes(block.day)) {
          return res.status(400).json({ message: `Invalid day: ${block.day}` });
        }
        if (!block.from || !block.to) {
          return res.status(400).json({ message: 'Each availability block must have from and to times.' });
        }
        if (block.from >= block.to) {
          return res.status(400).json({ message: `Block for ${block.day}: "from" must be before "to".` });
        }
      }
    }

    const update = {};
    if (availability    !== undefined) update['studyPlanner.availability']    = availability;
    if (bufferHours     !== undefined) update['studyPlanner.bufferHours']     = Number(bufferHours);
    if (maxSessionHours !== undefined) update['studyPlanner.maxSessionHours'] = maxSessionHours === null ? null : Number(maxSessionHours);
    if (breakMinutes    !== undefined) update['studyPlanner.breakMinutes']    = Number(breakMinutes);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('studyPlanner');

    res.json({ studyPlanner: user.studyPlanner });
  } catch (err) {
    console.error('PUT /planner/preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;