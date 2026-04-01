const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const CanvasIntegration = require('../models/CanvasIntegration');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');

// Helper: fetch from Canvas API (handles pagination)
async function canvasFetch(canvasUrl, token, path) {
  const base = canvasUrl.replace(/\/$/, '');
  const url = `${base}/api/v1${path}`;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { Authorization: `Bearer ${token}` }
    };

    lib.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Invalid JSON from Canvas'));
        }
      });
    }).on('error', reject);
  });
}

// GET /canvas — get saved integration
router.get('/', auth, async (req, res) => {
  try {
    const integration = await CanvasIntegration.findOne({ userId: req.userId });
    if (!integration) return res.json(null);
    // Never expose the raw token to the client
    res.json({
      canvasUrl: integration.canvasUrl,
      lastSync: integration.lastSync,
      connected: true
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /canvas — save or update integration
router.post('/', auth, async (req, res) => {
  try {
    const { canvasUrl, token } = req.body;
    if (!canvasUrl || !token) {
      return res.status(400).json({ message: 'canvasUrl and token are required' });
    }

    // Validate the token against Canvas before saving
    const trimmedUrl = canvasUrl.replace(/\/$/, '');
    const test = await canvasFetch(trimmedUrl, token, '/users/self');
    if (test.status !== 200) {
      return res.status(400).json({ message: 'Invalid Canvas URL or token. Please check and try again.' });
    }

    const integration = await CanvasIntegration.findOneAndUpdate(
      { userId: req.userId },
      { canvasUrl: trimmedUrl, token },
      { new: true, upsert: true }
    );

    res.json({ message: 'Canvas integration saved.', canvasUrl: integration.canvasUrl, connected: true });
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return res.status(400).json({ message: 'Could not reach Canvas URL. Check the URL and try again.' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /canvas — remove integration
router.delete('/', auth, async (req, res) => {
  try {
    await CanvasIntegration.findOneAndDelete({ userId: req.userId });
    res.json({ message: 'Canvas integration removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /canvas/sync — sync courses + assignments from Canvas into DB
router.post('/sync', auth, async (req, res) => {
  try {
    const integration = await CanvasIntegration.findOne({ userId: req.userId });
    if (!integration) {
      return res.status(404).json({ message: 'No Canvas integration found. Please connect Canvas first.' });
    }

    const { canvasUrl, token } = integration;

    // 1. Fetch active courses from Canvas
    const coursesRes = await canvasFetch(canvasUrl, token, '/courses?enrollment_state=active&per_page=50');
    if (coursesRes.status !== 200) {
      return res.status(400).json({ message: 'Failed to fetch courses from Canvas.' });
    }

    const canvasCourses = Array.isArray(coursesRes.body) ? coursesRes.body : [];
    const importedCourseIds = {};
    let coursesImported = 0;
    let assignmentsImported = 0;

    for (const cc of canvasCourses) {
      if (!cc.name || cc.access_restricted_by_date) continue;

      // Upsert course by canvasId field (we store it to avoid duplicates)
      let course = await Course.findOne({ userId: req.userId, canvasId: String(cc.id) });
      if (!course) {
        course = await Course.create({
          userId: req.userId,
          canvasId: String(cc.id),
          title: cc.name,
          code: cc.course_code || '',
          instructor: '',
          color: '#81A6C6',
          semester: cc.term?.name || '',
          isActive: true
        });
        coursesImported++;
      }
      importedCourseIds[cc.id] = course._id;

      // 2. Fetch assignments for this course
      const assignRes = await canvasFetch(canvasUrl, token, `/courses/${cc.id}/assignments?per_page=50`);
      if (assignRes.status !== 200) continue;

      const canvasAssignments = Array.isArray(assignRes.body) ? assignRes.body : [];

      for (const ca of canvasAssignments) {
        if (!ca.name) continue;
        const exists = await Assignment.findOne({ userId: req.userId, canvasId: String(ca.id) });
        if (!exists) {
          await Assignment.create({
            userId: req.userId,
            canvasId: String(ca.id),
            courseId: course._id,
            title: ca.name,
            description: ca.description ? ca.description.replace(/<[^>]+>/g, '').trim().slice(0, 500) : '',
            type: 'assignment',
            dueDate: ca.due_at ? new Date(ca.due_at) : null,
            status: 'todo',
            priority: 0
          });
          assignmentsImported++;
        }
      }
    }

    // Update lastSync timestamp
    integration.lastSync = new Date();
    await integration.save();

    res.json({
      message: 'Sync complete.',
      coursesImported,
      assignmentsImported,
      lastSync: integration.lastSync
    });
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return res.status(400).json({ message: 'Could not reach Canvas. Check your URL.' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;