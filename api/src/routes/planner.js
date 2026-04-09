// api/src/routes/planner.js
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
    const bufferHours  = planner.bufferHours    ?? 24;
    const advanceDays  = planner.advanceDays     ?? 7;
    const breakMins    = planner.breakMinutes    ?? 15;
    const maxSessHours = planner.maxSessionHours ?? null;
    const availability = planner.availability   || [];
    const firstDay     = user.preferences?.firstDayOfWeek || 'sunday';

    if (!availability.length) {
      return res.status(400).json({ message: 'No availability set. Please configure your study planner settings.' });
    }

    // ── Resolve this week ────────────────────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr  = toDateStr(today);

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

    // ── Filter: window must overlap this week ────────────────────────────────
    const eligible = [];
    const preUnscheduled = [];

    for (const a of allAssignments) {
      const win = getSchedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue;

      // Window already fully in the past → immediately unscheduled
      if (win.latest < today) {
        preUnscheduled.push({
          assignmentId: a._id.toString(),
          title:        a.title,
          reason:       `Deadline has passed — latest scheduling time was ${toDateStr(win.latest)}.`,
        });
        continue;
      }

      // Window must overlap [weekStart, weekEnd]
      if (win.earliest > weekEnd)  continue;
      if (win.latest   < weekStart) continue;

      eligible.push({ assignment: a, window: win });
    }

    if (eligible.length === 0) {
      return res.json({ sessions: [], warnings: [], unscheduled: preUnscheduled, weekStart: weekStartStr });
    }

    // ── Compute already-scheduled hours from previous weeks ─────────────────
    const previousPlans = await StudyPlan.find({
      userId:    req.userId,
      weekStart: { $lt: weekStartStr },
    });

    const scheduledHoursMap = {};
    for (const plan of previousPlans) {
      for (const s of (plan.sessions || [])) {
        if (!s.assignmentId) continue;
        const id = s.assignmentId.toString();
        scheduledHoursMap[id] = (scheduledHoursMap[id] || 0) + (s.hours || 0);
      }
    }

    // ── AI fallback: estimate time for Canvas tasks with no estimatedTime ────
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
    const assignmentList = [];
    const preWarnings = [];

    for (const { assignment: a, window: win } of eligible) {
      const alreadyScheduled = scheduledHoursMap[a._id.toString()] || 0;
      const totalHours       = a.estimatedTime || 1;
      const remainingHours   = Math.round(Math.max(totalHours - alreadyScheduled, 0) * 4) / 4;

      // Already over-scheduled in previous weeks — warn and skip
      if (alreadyScheduled > totalHours) {
        preWarnings.push({
          assignmentId:   a._id.toString(),
          title:          a.title,
          scheduledHours: alreadyScheduled,
          neededHours:    totalHours,
          message:        `Over-scheduled by ${Math.round((alreadyScheduled - totalHours) * 4) / 4}h in previous weeks.`,
        });
        continue;
      }

      // Fully scheduled already — skip silently
      if (remainingHours === 0) continue;

      // Clamp window to this week
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));

      // Don't schedule in the past
      const effectiveFrom = new Date(Math.max(clampedEarliest.getTime(), today.getTime()));
      if (effectiveFrom > clampedLatest) continue;

      assignmentList.push({
        id:                    a._id.toString(),
        title:                 a.title,
        courseId:              a.courseId ? a.courseId.toString() : null,
        dueDate:               toDateStr(new Date(a.dueDate)),
        totalHours,
        alreadyScheduledHours: alreadyScheduled,
        remainingHours,
        scheduleFrom:          toDateStr(effectiveFrom),
        scheduleTo:            toDateStr(clampedLatest),
        scheduleLatestTime:    win.latest.toISOString(),
      });
    }

    if (assignmentList.length === 0) {
      return res.json({ sessions: [], warnings: preWarnings, unscheduled: preUnscheduled, weekStart: weekStartStr });
    }

    // ── Per-day available minutes hint for AI ────────────────────────────────
    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const availableMinutesPerDay = {};
    for (let i = 0; i <= 6; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + i);
      const dateStr = toDateStr(dayDate);
      if (dateStr < todayStr) continue;
      const dayName = DAY_NAMES[dayDate.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      let totalMins = 0;
      for (const b of blocks) {
        const [fh, fm] = b.from.split(':').map(Number);
        const [th, tm] = b.to.split(':').map(Number);
        totalMins += (th * 60 + tm) - (fh * 60 + fm);
      }
      if (totalMins > 0) availableMinutesPerDay[dateStr] = totalMins;
    }

    // ── AI payload ───────────────────────────────────────────────────────────
    const payload = {
      weekStart:  weekStartStr,
      weekEnd:    toDateStr(weekEnd),
      todayDate:  todayStr,
      availability,
      availableMinutesPerDay,
      preferences: {
        maxSessionHours: maxSessHours || 'Unlimited',
        breakMinutes:    breakMins,
      },
      assignments: assignmentList,
    };

    const systemPrompt = `You are an expert academic scheduling AI. Generate a study plan for exactly ONE week.
Output ONLY valid JSON — no markdown, no explanation, no extra keys.

=== STRICT RULES ===

1. AVAILABILITY ONLY: Schedule sessions ONLY within the "availability" blocks (day + from/to in 24h). Never outside them.

2. FUTURE DATES ONLY: "todayDate" is today. Never schedule a session on a date before todayDate.

3. SCHEDULING WINDOW (HARD CONSTRAINT):
   Each assignment has "scheduleFrom" and "scheduleTo" (YYYY-MM-DD).
   "scheduleLatestTime" is the exact ISO cutoff — the session must END before this timestamp.
   → No session may start before scheduleFrom.
   → No session may end after scheduleLatestTime.

4. EXACT HOURS (CRITICAL):
   Each assignment has "remainingHours" — the EXACT total hours to schedule this week.
   The sum of "hours" across ALL sessions for one assignment must equal EXACTLY remainingHours.
   Never schedule more or less. Never round up to fill a slot.
   Example: remainingHours=1.5 → you may do one 1.5h session, or 1h + 0.5h. Not 2h.

5. SPLITTING: If remainingHours > maxSessionHours, split into multiple sessions.
   Name them "Title (Part 1)", "Title (Part 2)", etc.
   Each part must be ≤ maxSessionHours. Parts can be on different days.

6. BREAKS: Between two sessions in the same availability block, leave a gap of exactly breakMinutes.

7. PRIORITY: Schedule assignments with the earliest dueDate first.
   Prioritize fitting ALL hours before moving to lower-priority assignments.

8. NO LAZY UNSCHEDULED (CRITICAL):
   Only add an assignment to "unscheduled" if there is LITERALLY no available time slot
   in its scheduleFrom–scheduleTo window after accounting for all other sessions.
   Use "availableMinutesPerDay" as a guide — if a day has free minutes, USE THEM.
   Do NOT put something in unscheduled just because the week is busy.

9. GHOST ENTRIES FORBIDDEN (CRITICAL):
   Only generate sessions, warnings, and unscheduled entries for assignments in the
   provided "assignments" list. Never invent entries for assignments not in the list.
   Check assignmentId matches one of the provided ids exactly.

10. WARNINGS: Only warn if you scheduled FEWER hours than remainingHours for an assignment
    that has available slots. State exactly how many hours were scheduled vs needed.

=== OUTPUT SCHEMA (return exactly this structure) ===
{
  "sessions": [
    {
      "assignmentId": "<id from assignments list>",
      "title": "string",
      "courseId": "string or null",
      "date": "YYYY-MM-DD",
      "from": "HH:mm",
      "to": "HH:mm",
      "hours": 1.5
    }
  ],
  "warnings": [
    {
      "assignmentId": "<id>",
      "title": "string",
      "scheduledHours": 1.0,
      "neededHours": 2.5,
      "message": "string"
    }
  ],
  "unscheduled": [
    {
      "assignmentId": "<id>",
      "title": "string",
      "reason": "string — be specific about why no slot exists"
    }
  ]
}`;

    // ── Call Groq ────────────────────────────────────────────────────────────
    const groqRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model:           'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature:     0.2,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const plan = JSON.parse(groqRes.data.choices[0].message.content);

    // ── Valid assignmentId set for post-filtering ────────────────────────────
    const validAssignmentIds = new Set(assignmentList.map(a => a.id));

    const windowMap = {};
    for (const a of assignmentList) {
      windowMap[a.id] = {
        from:   a.scheduleFrom,
        latest: new Date(a.scheduleLatestTime),
      };
    }

    // ── Post-process: filter invalid sessions ────────────────────────────────
    const validSessions             = [];
    const droppedHoursByAssignment  = {};

    for (const s of (plan.sessions || [])) {
      // Strip phantom entries
      if (!validAssignmentIds.has(s.assignmentId)) continue;

      const w = windowMap[s.assignmentId];

      // Strip past-date sessions
      if (s.date < todayStr) {
        droppedHoursByAssignment[s.assignmentId] = (droppedHoursByAssignment[s.assignmentId] || 0) + (s.hours || 0);
        continue;
      }

      // Strip sessions outside scheduling window
      if (w) {
        if (s.date < w.from) {
          droppedHoursByAssignment[s.assignmentId] = (droppedHoursByAssignment[s.assignmentId] || 0) + (s.hours || 0);
          continue;
        }
        const sessionEnd = new Date(`${s.date}T${s.to}:00.000Z`);
        if (sessionEnd > w.latest) {
          droppedHoursByAssignment[s.assignmentId] = (droppedHoursByAssignment[s.assignmentId] || 0) + (s.hours || 0);
          continue;
        }
      }

      validSessions.push({ ...s, completed: false, skipped: false });
    }

    // ── Enforce exact hours per assignment ───────────────────────────────────
    const hoursScheduledByAssignment = {};
    const finalSessions = [];

    for (const s of validSessions) {
      const a = assignmentList.find(x => x.id === s.assignmentId);
      if (!a) { finalSessions.push(s); continue; }

      const already    = hoursScheduledByAssignment[s.assignmentId] || 0;
      const remaining  = Math.round((a.remainingHours - already) * 4) / 4;

      if (remaining <= 0) continue;

      if (s.hours > remaining) {
        const [fh, fm]     = s.from.split(':').map(Number);
        const clampedMins  = Math.round(remaining * 60);
        const endTotalMins = fh * 60 + fm + clampedMins;
        const eh = Math.floor(endTotalMins / 60);
        const em = endTotalMins % 60;
        const clampedTo = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
        finalSessions.push({ ...s, to: clampedTo, hours: remaining });
        hoursScheduledByAssignment[s.assignmentId] = a.remainingHours;
      } else {
        finalSessions.push(s);
        hoursScheduledByAssignment[s.assignmentId] = already + s.hours;
      }
    }

    // ── Post-process warnings ────────────────────────────────────────────────
    const aiWarnings = (plan.warnings || []).filter(w => validAssignmentIds.has(w.assignmentId));

    for (const [assignmentId, droppedHours] of Object.entries(droppedHoursByAssignment)) {
      const a = assignmentList.find(x => x.id === assignmentId);
      if (!a) continue;
      const existing = aiWarnings.find(w => w.assignmentId === assignmentId);
      if (existing) {
        existing.message += ` (${droppedHours}h removed — outside valid window or past date)`;
      } else {
        aiWarnings.push({
          assignmentId,
          title:          a.title,
          scheduledHours: hoursScheduledByAssignment[assignmentId] || 0,
          neededHours:    a.remainingHours,
          message:        `${droppedHours}h of sessions were outside the valid window or in the past and removed.`,
        });
      }
    }

    const aiUnscheduled = (plan.unscheduled || []).filter(u => validAssignmentIds.has(u.assignmentId));

    res.json({
      sessions:    finalSessions,
      warnings:    [...preWarnings, ...aiWarnings],
      unscheduled: [...preUnscheduled, ...aiUnscheduled],
      weekStart:   weekStartStr,
    });

  } catch (err) {
    console.error('POST /planner/generate error:', err.response?.data || err.message);
    res.status(500).json({ message: 'Failed to generate AI study plan', error: err.message });
  }
});

// ─── POST /planner/schedule — save plan ───────────────────────────────────────
router.post('/schedule', auth, async (req, res) => {
  try {
    const { weekStart, sessions, warnings, unscheduled } = req.body;
    if (!weekStart) return res.status(400).json({ message: 'weekStart is required' });

    const plan = await StudyPlan.findOneAndUpdate(
      { userId: req.userId, weekStart },
      {
        userId:      req.userId,   // ✅ fixed: was bare `userId` (ReferenceError)
        weekStart,
        sessions,
        warnings:    warnings    || [],
        unscheduled: unscheduled || [],
        generatedAt: new Date(),
      },
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

// ─── PATCH /planner/schedule/:sessionId — mark done / skip ───────────────────
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
