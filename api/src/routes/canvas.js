const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const User     = require('../models/User');
const Assignment = require('../models/Assignment');
const Course   = require('../models/Course');
const auth     = require('../middleware/auth');

// ─── GET /api/canvas/settings ────────────────────────────────────────────────
// Returns the stored token + url for the logged-in user (token is masked)
router.get('/settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('canvasToken canvasUrl canvasLastSync');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      canvasToken: user.canvasToken ? '••••••••' : '',   // never expose raw token
      canvasUrl:   user.canvasUrl   || '',
      lastSync:    user.canvasLastSync || null
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/canvas/settings ───────────────────────────────────────────────
// Save (or update) Canvas token + url
router.post('/settings', auth, async (req, res) => {
  try {
    const { canvasToken, canvasUrl } = req.body;
    if (!canvasToken || !canvasToken.trim()) {
      return res.status(400).json({ message: 'Canvas token is required' });
    }

    const baseUrl = (canvasUrl || 'https://canvas.instructure.com').trim().replace(/\/$/, '');

    // Validate token against Canvas before saving
    try {
      await axios.get(`${baseUrl}/api/v1/users/self`, {
        headers: { Authorization: `Bearer ${canvasToken.trim()}` }
      });
    } catch {
      return res.status(400).json({ message: 'Invalid Canvas token or URL — could not authenticate with Canvas.' });
    }

    await User.findByIdAndUpdate(req.userId, {
      canvasToken: canvasToken.trim(),
      canvasUrl:   baseUrl
    });

    res.json({ message: 'Canvas settings saved.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── DELETE /api/canvas/settings ─────────────────────────────────────────────
// Remove Canvas integration
router.delete('/settings', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $unset: { canvasToken: '', canvasUrl: '', canvasLastSync: '' }
    });
    res.json({ message: 'Canvas integration removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/canvas/sync ───────────────────────────────────────────────────
// Pull assignments from Canvas and upsert into local DB
router.post('/sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('canvasToken canvasUrl');
    if (!user || !user.canvasToken) {
      return res.status(400).json({ message: 'Canvas not connected. Add your token in Settings first.' });
    }

    const baseUrl = (user.canvasUrl || 'https://canvas.instructure.com').replace(/\/$/, '');
    const headers = { Authorization: `Bearer ${user.canvasToken}` };

    // 1. Fetch active courses from Canvas
    const coursesRes = await axios.get(
      `${baseUrl}/api/v1/courses?enrollment_state=active&per_page=50`, { headers }
    );
    const canvasCourses = coursesRes.data || [];

    // 2. For each Canvas course upsert a local Course doc
    const courseIdMap = {}; // canvasCourseId -> local Course._id
    for (const cc of canvasCourses) {
      if (!cc.name) continue;
      let localCourse = await Course.findOne({ userId: req.userId, canvasId: String(cc.id) });
      if (!localCourse) {
        localCourse = await Course.create({
          userId:   req.userId,
          name:     cc.name,
          code:     cc.course_code || '',
          canvasId: String(cc.id)
        });
      }
      courseIdMap[cc.id] = localCourse._id;
    }

    // 3. Fetch upcoming assignments for each course
    let synced = 0;
    for (const cc of canvasCourses) {
      let page = 1;
      while (true) {
        const aRes = await axios.get(
          `${baseUrl}/api/v1/courses/${cc.id}/assignments?per_page=50&page=${page}&bucket=upcoming`,
          { headers }
        );
        const items = aRes.data || [];
        if (!items.length) break;

        for (const a of items) {
          await Assignment.findOneAndUpdate(
            { userId: req.userId, canvasId: String(a.id) },
            {
              userId:      req.userId,
              canvasId:    String(a.id),
              courseId:    courseIdMap[cc.id] || null,
              title:       a.name || 'Untitled',
              description: a.description ? a.description.replace(/<[^>]+>/g, '') : '',
              dueDate:     a.due_at ? new Date(a.due_at) : null,
              source:      'canvas',
              status:      'pending'
            },
            { upsert: true, new: true }
          );
          synced++;
        }

        // Canvas uses Link header for pagination; break if last page
        if (items.length < 50) break;
        page++;
      }
    }

    // 4. Update lastSync timestamp
    await User.findByIdAndUpdate(req.userId, { canvasLastSync: new Date() });

    res.json({ message: `Sync complete.`, synced });
  } catch (err) {
    res.status(500).json({ message: 'Sync failed', error: err.message });
  }
});

module.exports = router;