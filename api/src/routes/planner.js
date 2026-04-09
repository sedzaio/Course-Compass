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

// earliest = dueDate - advanceDays, latest = dueDate - bufferHours
function getSchedulingWindow(dueDate, advanceDays, bufferHours) {
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

    if (bufferHours !== undefined) {
      const b = Number(bufferHours);
      if (!Number.isInteger(b) || b < 1)
        return res.status(400).json({ message: '"Finish at least" must be a whole number greater than 0.' });
    }

    if (advanceDays !== undefined) {
      const a = Number(advanceDays);
      if (!Number.isInteger(a) || a < 1)
        return res.status(400).json({ message: '"Start scheduling up to" must be a whole number greater than 0.' });
      if (a > 90)
        return res.status(400).json({ message: '"Start scheduling up to" cannot exceed 90 days.' });

      const currentBuf = bufferHours !== undefined
        ? Number(bufferHours)
        : ((await User.findById(req.userId).select('studyPlanner'))?.studyPlanner?.bufferHours ?? 24);
      if (a * 24 <= currentBuf) {
        return res.status(400).json({
          message: `"Start scheduling up to" (${a} days = ${a * 24}h) must be strictly greater than "Finish at least" (${currentBuf}h).`,
        });
      }
    }

    if (maxSessionHours !== undefined && maxSessionHours !== null) {
      const m = Number(maxSessionHours);
      if (isNaN(m) || m < 1 || m > 23)
        return res.status(400).json({ message: 'Max session must be between 1 and 23 hours.' });
    }

    if (breakMinutes !== undefined) {
      const allowed = [0, 15, 30, 45, 60];
      if (!allowed.includes(Number(breakMinutes)))
        return res.status(400).json({ message: 'Break minutes must be 0, 15, 30, 45, or 60.' });
    }

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

// ─── POST /planner/generate ────────────────────────────────────────────────────
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

    // ── Resolve "this week" ──────────────────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekStart    = getWeekStart(today, firstDay);
    const weekStartStr = toDateStr(weekStart);
    const weekEnd      = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    // ── Fetch all incomplete assignments ────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null },
    }).sort({ dueDate: 1 });

    // ── Filter: only assignments whose scheduling window overlaps this week ──
    //   window.earliest <= weekEnd  AND  window.latest >= weekStart
    const eligible = [];
    for (const a of allAssignments) {
      const win = getSchedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue; // window is impossible (buffer >= advance) — skip
      // Window must overlap [weekStart, weekEnd]
      if (win.earliest > weekEnd)  continue; // not in range yet
      if (win.latest   < weekStart) continue; // already past deadline
      eligible.push({ assignment: a, window: win });
    }

    if (eligible.length === 0) {
      return res.json({ sessions: [], warnings: [], unscheduled: [], weekStart: weekStartStr });
    }

    // ── Fetch all PREVIOUS weeks' saved plans to compute already-scheduled hours ──
    const previousPlans = await StudyPlan.find({
      userId:    req.userId,
      weekStart: { $lt: weekStartStr },
    });

    // Build map: assignmentId → total hours already scheduled in past plans
    const scheduledHoursMap = {};
    for (const plan of previousPlans) {
      for (const s of (plan.sessions || [])) {
        if (!s.assignmentId) continue;
        const id = s.assignmentId.toString();
        scheduledHoursMap[id] = (scheduledHoursMap[id] || 0) + (s.hours || 0);
      }
    }

    // ── Pre-fill missing estimated times (AI fallback for Canvas tasks) ─────
    for (const { assignment: a } of eligible) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const prompt = `Reply with ONLY a single decimal number representing study hours needed for: ${a.title || 'Untitled'}`;
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
        } catch (_) {}
      }
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // ── Build assignment list for AI ─────────────────────────────────────────
    const assignmentList = eligible.map(({ assignment: a, window: win }) => {
      const alreadyScheduled = scheduledHoursMap[a._id.toString()] || 0;
      const totalHours       = a.estimatedTime || 1;
      const remainingHours   = Math.max(totalHours - alreadyScheduled, 0);

      // Clamp window to this week's boundaries
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));

      return {
        id:              a._id.toString(),
        title:           a.title,
        courseId:        a.courseId ? a.courseId.toString() : null,
        dueDate:         toDateStr(new Date(a.dueDate)),
        totalHours,
        alreadyScheduledHours: alreadyScheduled,
        remainingHours,
        // Hard window the AI must respect (already clamped to this week)
        scheduleFrom:    toDateStr(clampedEarliest),
        scheduleTo:      toDateStr(clampedLatest),
        scheduleLatestTime: win.latest.toISOString(), // exact timestamp for same-day cutoff
      };
    }).filter(a => a.remainingHours > 0); // skip fully scheduled

    if (assignmentList.length === 0) {
      return res.json({ sessions: [], warnings: [], unscheduled: [], weekStart: weekStartStr });
    }

    // ── Build AI payload ─────────────────────────────────────────────────────
    const payload = {
      weekStart: weekStartStr,
      weekEnd:   toDateStr(weekEnd),
      availability,
      preferences: {
        maxSessionHours: maxSessHours || 'Unlimited',
        breakMinutes:    breakMins,
      },
      assignments: assignmentList,
    };

    const systemPrompt = `You are an expert academic scheduling AI. Your job is to generate a study session plan for exactly ONE week.
Output ONLY valid JSON — no markdown, no explanation.

=== STRICT RULES ===

1. AVAILABILITY: Only schedule sessions within the "availability" time blocks provided. Each block has a day name, from time, and to time (24h format). Never schedule outside these blocks.

2. SCHEDULING WINDOW (CRITICAL):
   Each assignment has "scheduleFrom" (YYYY-MM-DD) and "scheduleTo" (YYYY-MM-DD) — the date range within which you may place sessions for that assignment.
   "scheduleLatestTime" is the exact ISO timestamp by which ALL sessions for that assignment must END.
   → Never schedule a session for an assignment before its "scheduleFrom" date.
   → Never schedule a session for an assignment that ends after its "scheduleLatestTime".

3. REMAINING HOURS: Each assignment has "remainingHours" — the exact hours you need to schedule this week. Do NOT schedule more than remainingHours for any assignment.

4. SPLITTING: If remainingHours exceeds "maxSessionHours", you MUST split the work into multiple sessions across different time slots or days. Title each split as "Task Title (Part 1)", "Task Title (Part 2)", etc. You decide the split sizes — but no single session may exceed maxSessionHours.

5. BREAKS: If you place two sessions back-to-back in the same availability block, leave a gap of exactly "breakMinutes" between them.

6. PRIORITY: Schedule assignments with earlier "dueDate" first.

7. PARTIAL SCHEDULING: If there is not enough available time to fit all remaining hours for an assignment within its window this week, schedule as much as possible and add a warning entry. Do NOT skip the assignment entirely unless there is zero available time.

8. UNSCHEDULED: Only add an assignment to "unscheduled" if it has zero available slots within its scheduleFrom–scheduleTo window. Give a clear reason.

9. TIME FORMAT: "date" must be YYYY-MM-DD within the week. "from" and "to" must be HH:mm (24h). "hours" must be a positive decimal.

=== OUTPUT SCHEMA ===
{
  "sessions": [
    { "assignmentId": "string", "title": "string", "courseId": "string|null", "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm", "hours": 1.5 }
  ],
  "warnings": [
    { "assignmentId": "string", "title": "string", "scheduledHours": 1.0, "neededHours": 2.5, "message": "string" }
  ],
  "unscheduled": [
    { "assignmentId": "string", "title": "string", "reason": "string" }
  ]
}`;

    // ── Call Groq AI ─────────────────────────────────────────────────────────
    const groqRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const plan = JSON.parse(groqRes.data.choices[0].message.content);

    // ── Post-processing: hard-filter sessions outside valid windows ──────────
    // Build a quick lookup: assignmentId → scheduleLatestTime
    const windowMap = {};
    for (const a of assignmentList) {
      windowMap[a.id] = {
        from:   a.scheduleFrom,
        latest: new Date(a.scheduleLatestTime),
      };
    }

    const validSessions = [];
    const invalidByAssignment = {};

    for (const s of (plan.sessions || [])) {
      const w = windowMap[s.assignmentId];
      if (!w) { validSessions.push({ ...s, completed: false, skipped: false }); continue; }

      // Check date >= scheduleFrom
      if (s.date < w.from) { invalidByAssignment[s.assignmentId] = (invalidByAssignment[s.assignmentId] || 0) + (s.hours || 0); continue; }

      // Check session end time <= scheduleLatestTime
      const sessionEnd = new Date(`${s.date}T${s.to}:00.000Z`);
      if (sessionEnd > w.latest) { invalidByAssignment[s.assignmentId] = (invalidByAssignment[s.assignmentId] || 0) + (s.hours || 0); continue; }

      validSessions.push({ ...s, completed: false, skipped: false });
    }

    // Promote filtered-out sessions to warnings
    const warnings = [...(plan.warnings || [])];
    for (const [assignmentId, droppedHours] of Object.entries(invalidByAssignment)) {
      const a = assignmentList.find(x => x.id === assignmentId);
      if (!a) continue;
      const existing = warnings.find(w => w.assignmentId === assignmentId);
      if (existing) {
        existing.message += ` (${droppedHours}h removed — outside scheduling window)`;
      } else {
        warnings.push({
          assignmentId,
          title: a.title,
          scheduledHours: validSessions.filter(s => s.assignmentId === assignmentId).reduce((acc, s) => acc + s.hours, 0),
          neededHours: a.remainingHours,
          message: `${droppedHours}h of sessions were outside the valid scheduling window and removed.`,
        });
      }
    }

    res.json({
      sessions:    validSessions,
      warnings,
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