const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const Course     = require('../models/Course');
const auth       = require('../middleware/auth');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNextSync(from, frequency) {
  const d = new Date(from);
  if (frequency === 'daily')   d.setDate(d.getDate() + 1);
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
}

// Follow Canvas Link header pagination — fetches ALL pages reliably
async function fetchAllPages(firstUrl, headers) {
  let results = [];
  let url = firstUrl;

  while (url) {
    const res = await axios.get(url, { headers });
    const data = res.data;
    if (Array.isArray(data)) results = results.concat(data);

    const linkHeader = res.headers['link'] || '';
    const nextMatch  = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    url = nextMatch ? nextMatch[1] : null;
  }

  return results;
}

async function runSync(user) {
  const baseUrl = (user.canvasUrl || 'https://canvas.instructure.com').replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${user.canvasToken}` };

  const canvasCourses = await fetchAllPages(
    `${baseUrl}/api/v1/courses?enrollment_state=active&per_page=100&include[]=teachers&include[]=term`,
    headers
  );

  const courseIdMap = {};
  for (const cc of canvasCourses) {
    if (!cc.name || cc.access_restricted_by_date) continue;

    const instructor = cc.teachers?.[0]
      ? `${cc.teachers[0].display_name || ''}`.trim()
      : null;
    const semester = cc.term?.name || null;

    let localCourse = await Course.findOne({ userId: user._id, canvasId: String(cc.id) });
    if (!localCourse) {
      localCourse = await Course.create({
        userId:     user._id,
        title:      cc.name,
        code:       cc.course_code || '',
        canvasId:   String(cc.id),
        instructor: instructor || '',
        semester:   semester || '',
      });
    } else {
      let changed = false;
      if (localCourse.title !== cc.name)                        { localCourse.title = cc.name;           changed = true; }
      if (instructor && localCourse.instructor !== instructor)  { localCourse.instructor = instructor;   changed = true; }
      if (semester   && localCourse.semester   !== semester)    { localCourse.semester   = semester;     changed = true; }
      if (changed) await localCourse.save();
    }
    courseIdMap[cc.id] = localCourse._id;
  }

  let synced = 0;
  for (const cc of canvasCourses) {
    if (!cc.name || cc.access_restricted_by_date) continue;

    let items;
    try {
      items = await fetchAllPages(
        `${baseUrl}/api/v1/courses/${cc.id}/assignments?per_page=100&order_by=due_at`,
        headers
      );
    } catch (err) {
      console.warn(`[canvas sync] Skipping course ${cc.id}: ${err.message}`);
      continue;
    }

    // Fetch submissions to mirror Canvas completion state
    const submissionsMap = {};   // ← plain JS object, no TS syntax
    try {
      const subs = await fetchAllPages(
        `${baseUrl}/api/v1/courses/${cc.id}/students/submissions?per_page=100&student_ids[]=self`,
        headers
      );
      for (const s of subs) {
        submissionsMap[String(s.assignment_id)] =
          s.workflow_state === 'graded' || s.workflow_state === 'submitted';
      }
    } catch (_) { /* submissions not critical */ }

    for (const a of items) {
      const isDone     = submissionsMap[String(a.id)] || false;
      const canvasLink = `${baseUrl}/courses/${cc.id}/assignments/${a.id}`;

      await Assignment.findOneAndUpdate(
        { userId: user._id, canvasId: String(a.id) },
        {
          $set: {
            courseId:    courseIdMap[cc.id] || null,
            title:       a.name || 'Untitled',
            description: a.description ? a.description.replace(/<[^>]+>/g, '').trim() : '',
            dueDate:     a.due_at ? new Date(a.due_at) : null,
            source:      'canvas',
            canvasUrl:   canvasLink,
            completed:   isDone,
          },
          $setOnInsert: {
            userId:   user._id,
            canvasId: String(a.id),
            type:     'assignment',
          },
        },
        { upsert: true, new: true }
      );
      synced++;
    }
  }
  return synced;
}

// ─── GET /api/canvas/settings ─────────────────────────────────────────────────

router.get('/settings', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('canvasToken canvasUrl canvasLastSync canvasSyncFrequency canvasNextSync');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      canvasToken:   user.canvasToken ? '••••••••' : '',
      canvasUrl:     user.canvasUrl   || '',
      lastSync:      user.canvasLastSync   || null,
      nextSync:      user.canvasNextSync   || null,
      syncFrequency: user.canvasSyncFrequency || 'weekly',
      isConnected:   !!user.canvasToken,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/canvas/settings ────────────────────────────────────────────────

router.post('/settings', auth, async (req, res) => {
  try {
    const { canvasToken, canvasUrl, syncFrequency } = req.body;
    if (!canvasToken || !canvasToken.trim())
      return res.status(400).json({ message: 'Canvas token is required' });

    const baseUrl = (canvasUrl || 'https://canvas.instructure.com').trim().replace(/\/$/, '');
    const freq    = ['daily', 'weekly', 'monthly'].includes(syncFrequency) ? syncFrequency : 'weekly';

    try {
      await axios.get(`${baseUrl}/api/v1/users/self`, {
        headers: { Authorization: `Bearer ${canvasToken.trim()}` },
      });
    } catch {
      return res.status(400).json({ message: 'Invalid Canvas token or URL — could not authenticate with Canvas.' });
    }

    const now      = new Date();
    const nextSync = computeNextSync(now, freq);

    await User.findByIdAndUpdate(req.userId, {
      canvasToken:         canvasToken.trim(),
      canvasUrl:           baseUrl,
      canvasSyncFrequency: freq,
      canvasNextSync:      nextSync,
    });

    res.json({ message: 'Canvas settings saved.', nextSync, syncFrequency: freq });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── PUT /api/canvas/settings/frequency ──────────────────────────────────────

router.put('/settings/frequency', auth, async (req, res) => {
  try {
    const { syncFrequency } = req.body;
    if (!['daily', 'weekly', 'monthly'].includes(syncFrequency))
      return res.status(400).json({ message: 'Invalid frequency. Use daily, weekly, or monthly.' });

    const user = await User.findById(req.userId).select('canvasLastSync canvasToken');
    if (!user || !user.canvasToken)
      return res.status(400).json({ message: 'Canvas not connected.' });

    const base     = user.canvasLastSync || new Date();
    const nextSync = computeNextSync(base, syncFrequency);

    await User.findByIdAndUpdate(req.userId, {
      canvasSyncFrequency: syncFrequency,
      canvasNextSync:      nextSync,
    });

    res.json({ message: 'Sync frequency updated.', syncFrequency, nextSync });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── DELETE /api/canvas/settings ─────────────────────────────────────────────

router.delete('/settings', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.userId, {
      $unset: {
        canvasToken: '', canvasUrl: '', canvasLastSync: '',
        canvasNextSync: '', canvasSyncFrequency: '',
      },
    });
    res.json({ message: 'Canvas integration removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /api/canvas/sync ────────────────────────────────────────────────────

router.post('/sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('canvasToken canvasUrl canvasSyncFrequency');
    if (!user || !user.canvasToken)
      return res.status(400).json({ message: 'Canvas not connected. Add your token in Settings first.' });

    const synced   = await runSync(user);
    const now      = new Date();
    const freq     = user.canvasSyncFrequency || 'weekly';
    const nextSync = computeNextSync(now, freq);

    await User.findByIdAndUpdate(req.userId, {
      canvasLastSync: now,
      canvasNextSync: nextSync,
    });

    res.json({ message: 'Sync complete.', synced, lastSync: now, nextSync });
  } catch (err) {
    console.error('[canvas sync]', err);
    res.status(500).json({ message: 'Sync failed', error: err.message });
  }
});

// ─── POST /api/canvas/check-sync ─────────────────────────────────────────────

router.post('/check-sync', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('canvasToken canvasUrl canvasLastSync canvasSyncFrequency canvasNextSync');

    if (!user || !user.canvasToken)
      return res.json({ synced: false, reason: 'not_connected' });

    const now      = new Date();
    const nextSync = user.canvasNextSync ? new Date(user.canvasNextSync) : null;

    if (!nextSync || now < nextSync)
      return res.json({ synced: false, reason: 'not_due', nextSync: nextSync || null });

    const count   = await runSync(user);
    const freq    = user.canvasSyncFrequency || 'weekly';
    const newNext = computeNextSync(now, freq);

    await User.findByIdAndUpdate(req.userId, {
      canvasLastSync: now,
      canvasNextSync: newNext,
    });

    res.json({ synced: true, count, lastSync: now, nextSync: newNext });
  } catch (err) {
    console.error('[canvas check-sync]', err);
    res.status(500).json({ message: 'Auto-sync failed', error: err.message });
  }
});

module.exports = router;