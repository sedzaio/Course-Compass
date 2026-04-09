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

// Compute scheduling window for one assignment:
// earliest = dueDate - advanceDays (days)
// latest   = dueDate - bufferHours (hours)
// Returns { earliest: Date, latest: Date } or null if window is impossible
function schedulingWindow(dueDate, advanceDays, bufferHours) {
  const due      = new Date(dueDate);
  const earliest = new Date(due.getTime() - advanceDays * 24 * 60 * 60 * 1000);
  const latest   = new Date(due.getTime() - bufferHours * 60 * 60 * 1000);
  if (earliest >= latest) return null;
  return { earliest, latest };
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
    const { availability, bufferHours, advanceDays, maxSessionHours, breakMinutes } = req.body;

    // --- validate bufferHours ---
    if (bufferHours !== undefined) {
      const b = Number(bufferHours);
      if (!Number.isInteger(b) || b < 1)
        return res.status(400).json({ message: '"Finish at least" must be a whole number greater than 0.' });
    }

    // --- validate advanceDays ---
    if (advanceDays !== undefined) {
      const a = Number(advanceDays);
      if (!Number.isInteger(a) || a < 1)
        return res.status(400).json({ message: '"Start scheduling up to" must be a whole number greater than 0.' });
      if (a > 90)
        return res.status(400).json({ message: '"Start scheduling up to" cannot exceed 90 days.' });

      // cross-field: advanceDays (in hours) must be strictly > bufferHours
      const currentBuf = bufferHours !== undefined
        ? Number(bufferHours)
        : ((await User.findById(req.userId).select('studyPlanner'))?.studyPlanner?.bufferHours ?? 24);
      if (a * 24 <= currentBuf) {
        return res.status(400).json({
          message: `"Start scheduling up to" (${a} days = ${a * 24}h) must be strictly greater than "Finish at least" (${currentBuf}h).`,
        });
      }
    }

    // --- validate maxSessionHours ---
    if (maxSessionHours !== undefined && maxSessionHours !== null) {
      const m = Number(maxSessionHours);
      if (isNaN(m) || m < 1 || m > 23)
        return res.status(400).json({ message: 'Max session must be between 1 and 23 hours.' });
    }

    // --- validate breakMinutes ---
    if (breakMinutes !== undefined) {
      const allowed = [0, 15, 30, 45, 60];
      if (!allowed.includes(Number(breakMinutes)))
        return res.status(400).json({ message: 'Break minutes must be 0, 15, 30, 45, or 60.' });
    }

    // --- validate availability ---
    if (availability !== undefined) {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      for (const block of availability) {
        if (!days.includes(block.day))
          return res.status(400).json({ message: `Invalid day: ${block.day}` });
        if (!block.from || !block.to)
          return res.status(400).json({ message: 'Each availability block must have from and to times.' });
        if (block.from >= block.to)
          return res.status(400).json({ message: `${block.day}: start time must be before end time.` });
      }
    }

    const setFields = {}, unsetFields = {};
    if (availability   !== undefined) setFields['studyPlanner.availability']  = availability;
    if (bufferHours    !== undefined) setFields['studyPlanner.bufferHours']   = Number(bufferHours);
    if (advanceDays    !== undefined) setFields['studyPlanner.advanceDays']   = Number(advanceDays);
    if (breakMinutes   !== undefined) setFields['studyPlanner.breakMinutes']  = Number(breakMinutes);
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
    const bufferHours  = planner.bufferHours     ?? 24;
    const advanceDays  = planner.advanceDays      ?? 7;
    const breakMins    = planner.breakMinutes     ?? 15;
    const maxSessHours = planner.maxSessionHours  ?? null;
    const availability = planner.availability     || [];
    const firstDay     = user.preferences?.firstDayOfWeek || 'sunday';

    if (!availability.length) {
      return res.status(400).json({ message: 'No availability set. Please configure your study planner settings.' });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekStart    = getWeekStart(today, firstDay);
    const weekStartStr = toDateStr(weekStart);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

    // 1. Fetch assignments — include any whose due date is within the scheduling window
    //    (earliest possible session date = today OR dueDate - advanceDays, whichever is later)
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

    // 3. Build per-assignment scheduling windows and payload for AI
    const assignmentPayload = assignments.map(a => {
      const win = schedulingWindow(a.dueDate, advanceDays, bufferHours);
      return {
        id:             a._id.toString(),
        title:          a.title,
        courseId:       a.courseId ? a.courseId.toString() : null,
        dueDate:        a.dueDate,
        estimatedHours: a.estimatedTime,
        // Scheduling window: sessions must fall ENTIRELY within [schedulingWindow.earliest, schedulingWindow.latest]
        schedulingWindow: win
          ? {
              earliest: win.earliest.toISOString(),   // no sessions before this date/time
              latest:   win.latest.toISOString(),      // all sessions must END by this date/time
            }
          : null,  // null = window is impossible (will be unscheduled)
      };
    });

    const payload = {
      targetWeekStart: weekStartStr,
      targetWeekEnd:   toDateStr(weekEnd),
      availability:    availability,
      preferences: {
        bufferHours,
        advanceDays,
        maxSessionHours: maxSessHours || 'Unlimited',
        breakMinutes:    breakMins,
      },
      assignments: assignmentPayload,
    };

    const systemPrompt = `You are an expert academic planning AI. Generate a realistic study plan for the student.
You MUST output ONLY valid JSON using the exact schema requested, with no markdown tags or extra text.

RULES:
1. ONLY schedule sessions inside the exact times and days provided in "availability".
2. CRITICAL - SCHEDULING WINDOW: Every assignment has a "schedulingWindow" field with "earliest" and "latest" timestamps.
   - You MUST NOT schedule any session for an assignment before its "schedulingWindow.earliest" date.
   - All sessions for an assignment MUST END before its "schedulingWindow.latest" timestamp.
   - This means: if due date is 4/20 at 11:59pm, advanceDays=7, bufferHours=24 → earliest=4/13 11:59pm, latest=4/19 11:59pm.
   - If "schedulingWindow" is null, move that assignment to "unscheduled" with reason "Scheduling window is too narrow".
3. Prioritize assignments with the earliest dueDates.
4. NEVER exceed "maxSessionHours" for a single continuous session. Split longer tasks into multiple parts (e.g., "Part 1", "Part 2") on different days or times within the valid window.
5. If scheduling back-to-back sessions in the same block, leave a gap of exactly "breakMinutes".
6. Sessions may span across multiple weeks if needed — do NOT cram everything into one week.
7. If an assignment cannot be fully scheduled before its deadline due to lack of available time, schedule what you can and add a "warning".
8. If an assignment cannot be scheduled AT ALL, add it to "unscheduled".
9. Ensure times are formatted as "HH:mm" in 24-hour format and dates as "YYYY-MM-DD".

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
          { role: 'user',   content: JSON.stringify(payload) }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const aiContent = groqRes.data.choices[0].message.content;
    const plan = JSON.parse(aiContent);

    // 5. Sanitize AI output
    const sessions = (plan.sessions || []).map(s => ({
      ...s,
      completed: false,
      skipped:   false,
    }));

    res.json({
      sessions:    sessions,
      warnings:    plan.warnings    || [],
      unscheduled: plan.unscheduled || [],
      weekStart:   weekStartStr,
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