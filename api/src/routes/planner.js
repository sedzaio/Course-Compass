const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── helpers ──────────────────────────────────────────────────────────────────

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date, firstDay = 'sunday') {
  const d = new Date(date);
  const day = d.getUTCDay(); 
  const diff = firstDay === 'monday'
    ? (day === 0 ? -6 : 1 - day)
    : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── GET /planner/preferences ─────────────────────────────────────────────────
router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      studyPlanner:   user.studyPlanner || {},
      firstDayOfWeek: user.preferences?.firstDayOfWeek || 'sunday',
    });
  } catch (err) {
    console.error('GET /planner/preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PUT /planner/preferences ─────────────────────────────────────────────────
router.put('/preferences', auth, async (req, res) => {
  try {
    const { availability, bufferHours, maxSessionHours, breakMinutes } = req.body;

    if (bufferHours !== undefined) {
      const b = Number(bufferHours);
      if (isNaN(b) || b < 1) return res.status(400).json({ message: 'Buffer must be at least 1 hour.' });
    }
    if (maxSessionHours !== undefined && maxSessionHours !== null) {
      const m = Number(maxSessionHours);
      if (isNaN(m) || m < 1 || m > 23) return res.status(400).json({ message: 'Max session must be between 1 and 23 hours.' });
    }
    if (breakMinutes !== undefined) {
      const allowed = [0, 15, 30, 45, 60];
      if (!allowed.includes(Number(breakMinutes))) return res.status(400).json({ message: 'Break minutes must be 0, 15, 30, 45, or 60.' });
    }
    if (availability !== undefined) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      for (const block of availability) {
        if (!days.includes(block.day)) return res.status(400).json({ message: `Invalid day: ${block.day}` });
        if (!block.from || !block.to) return res.status(400).json({ message: 'Each availability block must have from and to times.' });
        if (block.from >= block.to) return res.status(400).json({ message: `${block.day}: start time must be before end time.` });
      }
    }

    const setFields = {}, unsetFields = {};
    if (availability  !== undefined) setFields['studyPlanner.availability']  = availability;
    if (bufferHours   !== undefined) setFields['studyPlanner.bufferHours']   = Number(bufferHours);
    if (breakMinutes  !== undefined) setFields['studyPlanner.breakMinutes']  = Number(breakMinutes);
    if (maxSessionHours !== undefined) {
      if (maxSessionHours === null) unsetFields['studyPlanner.maxSessionHours'] = '';
      else setFields['studyPlanner.maxSessionHours'] = Number(maxSessionHours);
    }

    if (!Object.keys(setFields).length && !Object.keys(unsetFields).length) {
      const current = await User.findById(req.userId).select('studyPlanner');
      return res.json({ studyPlanner: current?.studyPlanner || {} });
    }

    const mongoOp = {};
    if (Object.keys(setFields).length)   mongoOp.$set   = setFields;
    if (Object.keys(unsetFields).length) mongoOp.$unset = unsetFields;

    const user = await User.findByIdAndUpdate(req.userId, mongoOp, { new: true }).select('studyPlanner');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ studyPlanner: user.studyPlanner });
  } catch (err) {
    console.error('PUT /planner/preferences error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /planner/generate (AI-Powered) ──────────────────────────────────────
router.post('/generate', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const planner      = user.studyPlanner || {};
    const bufferHours  = planner.bufferHours    ?? 24;
    const breakMins    = planner.breakMinutes   ?? 15;
    const maxSessHours = planner.maxSessionHours ?? null;
    const availability = planner.availability   || [];
    const firstDay     = user.preferences?.firstDayOfWeek || 'sunday';

    if (!availability.length) {
      return res.status(400).json({ message: 'No availability set. Please configure your study planner settings.' });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekStart = getWeekStart(today, firstDay);
    const weekStartStr = toDateStr(weekStart);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    // 1. Fetch assignments
    const assignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null, $gte: today },
    }).sort({ dueDate: 1 });

    if (assignments.length === 0) {
      return res.json({ sessions: [], warnings: [], unscheduled: [], weekStart: weekStartStr });
    }

    // 2. Pre-fill missing estimated times for Canvas tasks (fallback 1hr)
    for (const a of assignments) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const title = a.title || 'Untitled';
          const prompt = `Reply with ONLY a single decimal number representing study hours needed for: ${title}`;
          const groqRes = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 10, temperature: 0.1 },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
          );
          const parsed = parseFloat(groqRes.data.choices[0].message.content.trim());
          if (!isNaN(parsed) && parsed > 0) {
            a.estimatedTime = Math.round(Math.min(Math.max(parsed, 0.25), 24) * 4) / 4;
            a.aiGenerated = true;
            await a.save();
          }
        } catch (_) { }
      }
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // 3. Build payload for AI
    const payload = {
      targetWeekStart: weekStartStr,
      targetWeekEnd: toDateStr(weekEnd),
      availability: availability,
      preferences: {
        bufferHours,
        maxSessionHours: maxSessHours || "Unlimited",
        breakMinutes: breakMins
      },
      assignments: assignments.map(a => ({
        id: a._id.toString(),
        title: a.title,
        courseId: a.courseId ? a.courseId.toString() : null,
        dueDate: a.dueDate,
        estimatedHours: a.estimatedTime
      }))
    };

    const systemPrompt = `You are an expert academic planning AI. Generate a realistic 7-day study plan for the student.
You MUST output ONLY valid JSON using the exact schema requested, with no markdown tags or extra text.

RULES:
1. ONLY schedule sessions inside the exact times and days provided in "availability".
2. Prioritize assignments with the earliest dueDates.
3. Every assignment must be finished at least "bufferHours" BEFORE its exact dueDate.
4. NEVER exceed "maxSessionHours" for a single continuous session. If a task is longer, split it into multiple parts (e.g., "Part 1", "Part 2") on different days or times.
5. If scheduling back-to-back sessions in the same block, leave a gap of exactly "breakMinutes".
6. If an assignment cannot be fully scheduled before its deadline due to lack of time, schedule what you can and add a "warning".
7. If an assignment cannot be scheduled AT ALL, add it to "unscheduled".
8. Ensure times are formatted as "HH:mm" in 24-hour format and dates as "YYYY-MM-DD" within the target week.

SCHEMA:
{
  "sessions": [
    { "assignmentId": "string", "title": "string", "courseId": "string or null", "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm", "hours": 1.5 }
  ],
  "warnings": [
    { "assignmentId": "string", "title": "string", "scheduledHours": 1.5, "neededHours": 3.0, "message": "string reason" }
  ],
  "unscheduled": [
    { "assignmentId": "string", "title": "string", "reason": "string reason" }
  ]
}`;

    // 4. Call Groq AI to generate schedule
    const groqRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(payload) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const aiContent = groqRes.data.choices[0].message.content;
    const plan = JSON.parse(aiContent);

    // 5. Sanitize AI output to match frontend expectations
    const sessions = (plan.sessions || []).map(s => ({
      ...s,
      completed: false,
      skipped: false
    }));

    res.json({ 
      sessions: sessions, 
      warnings: plan.warnings || [], 
      unscheduled: plan.unscheduled || [], 
      weekStart: weekStartStr 
    });

  } catch (err) {
    console.error('POST /planner/generate error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Failed to generate AI study plan', error: err.message });
  }
});

// ─── POST /planner/schedule — save generated plan ─────────────────────────────
router.post('/schedule', auth, async (req, res) => {
  try {
    const { weekStart, sessions, warnings, unscheduled } = req.body;
    if (!weekStart) return res.status(400).json({ message: 'weekStart is required' });

    const plan = await StudyPlan.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { userId: req.userId, weekStart, sessions, warnings: warnings || [], unscheduled: unscheduled || [], generatedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json(plan);
  } catch (err) {
    console.error('POST /planner/schedule error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET /planner/schedule — load saved plan ──────────────────────────────────
router.get('/schedule', auth, async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart) return res.status(400).json({ message: 'weekStart query param required' });

    const plan = await StudyPlan.findOne({ userId: req.userId, weekStart });
    if (!plan) return res.status(404).json({ message: 'No plan found for this week' });

    res.json(plan);
  } catch (err) {
    console.error('GET /planner/schedule error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PATCH /planner/schedule/:sessionId — mark done or skip ──────────────────
router.patch('/schedule/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { completed, skipped } = req.body;

    const plan = await StudyPlan.findOne({ userId: req.userId, 'sessions._id': sessionId });
    if (!plan) return res.status(404).json({ message: 'Session not found' });

    const session = plan.sessions.id(sessionId);
    if (completed !== undefined) session.completed = completed;
    if (skipped   !== undefined) session.skipped   = skipped;
    await plan.save();

    res.json({ sessionId, completed: session.completed, skipped: session.skipped });
  } catch (err) {
    console.error('PATCH /planner/schedule error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;