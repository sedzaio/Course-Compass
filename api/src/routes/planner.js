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
      if (isNaN(m) || m < 1 || m > 23) {
        return res.status(400).json({ message: 'Max session must be between 1 and 23 hours.' });
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
          return res.status(400).json({ message: `${block.day}: start time must be before end time.` });
        }
      }
    }

    // Build update using $set / $unset to avoid runValidators issues on subdocuments
    const setFields  = {};
    const unsetFields = {};

    if (availability    !== undefined) setFields['studyPlanner.availability']    = availability;
    if (bufferHours     !== undefined) setFields['studyPlanner.bufferHours']     = Number(bufferHours);
    if (breakMinutes    !== undefined) setFields['studyPlanner.breakMinutes']    = Number(breakMinutes);

    if (maxSessionHours !== undefined) {
      if (maxSessionHours === null) {
        unsetFields['studyPlanner.maxSessionHours'] = '';
      } else {
        setFields['studyPlanner.maxSessionHours'] = Number(maxSessionHours);
      }
    }

    const mongoOp = {};
    if (Object.keys(setFields).length)   mongoOp.$set   = setFields;
    if (Object.keys(unsetFields).length) mongoOp.$unset = unsetFields;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      mongoOp,
      { new: true }
    ).select('studyPlanner');

    res.json({ studyPlanner: user.studyPlanner });
  } catch (err) {
    console.error('PUT /planner/preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
