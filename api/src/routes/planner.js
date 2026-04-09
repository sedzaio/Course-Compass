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

function minsToTime(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
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

    // ── Resolve the target week ───────────────────────────────────────────────
    // Today is always the real server date — used for "past date" filtering.
    // weekStart is the week the frontend is requesting (may be a future week).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    // Use the weekStart sent by the frontend; fall back to the current week.
    const weekStart = req.body.weekStart
      ? (() => { const d = new Date(req.body.weekStart + 'T00:00:00.000Z'); d.setUTCHours(0,0,0,0); return d; })()
      : getWeekStart(today, firstDay);

    const weekStartStr = toDateStr(weekStart);
    const weekEnd      = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    const weekEndStr   = toDateStr(weekEnd);

    // The earliest day in this week we'll actually schedule sessions on:
    // for the current week it's today; for future weeks it's weekStart itself.
    const scheduleFromDate = weekStart > today ? weekStart : today;
    const scheduleFromStr  = toDateStr(scheduleFromDate);

    // ── Fetch incomplete assignments ─────────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null },
    }).sort({ dueDate: 1 });

    // ── Filter: window must overlap this week ────────────────────────────────
    const eligible       = [];
    const preUnscheduled = [];

    for (const a of allAssignments) {
      const win = getSchedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue;

      // Overdue tasks — only show in unscheduled for the CURRENT week
      if (win.latest < today) {
        const currentWeekStart = getWeekStart(today, firstDay);
        if (weekStartStr === toDateStr(currentWeekStart)) {
          preUnscheduled.push({
            assignmentId: a._id.toString(),
            title:        a.title,
            reason:       `Deadline has passed — latest scheduling time was ${toDateStr(win.latest)}.`,
          });
        }
        continue;
      }

      if (win.earliest > weekEnd)  continue;
      if (win.latest   < weekStart) continue;

      eligible.push({ assignment: a, window: win });
    }

    if (eligible.length === 0) {
      return res.json({ sessions: [], warnings: [], unscheduled: preUnscheduled, weekStart: weekStartStr });
    }

    // ── Already-scheduled hours from ALL weeks before this one ───────────────
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

    // ── AI fallback: estimate Canvas tasks ───────────────────────────────────
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

    // ── Build assignment list ─────────────────────────────────────────────────
    const assignmentList = [];
    const preWarnings    = [];

    for (const { assignment: a, window: win } of eligible) {
      const alreadyScheduled = scheduledHoursMap[a._id.toString()] || 0;
      const totalHours       = a.estimatedTime || 1;
      const remainingHours   = Math.round(Math.max(totalHours - alreadyScheduled, 0) * 4) / 4;

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

      if (remainingHours === 0) continue;

      // Clamp the window to this week's bounds
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));
      // For the current week: don't schedule in the past. For future weeks: weekStart is fine.
      const effectiveFrom   = new Date(Math.max(clampedEarliest.getTime(), scheduleFromDate.getTime()));
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

    // ── Compute exact free slots per day for AI ───────────────────────────────
    const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

    const freeSlotsPerDay = {};
    for (let i = 0; i <= 6; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + i);
      const dateStr = toDateStr(dayDate);
      // Skip days before today (only applies to current week navigation)
      if (dateStr < scheduleFromStr) continue;
      const dayName = DAY_NAMES[dayDate.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      if (!blocks.length) continue;
      const slots = [];
      let totalMins = 0;
      for (const b of blocks) {
        const [fh, fm] = b.from.split(':').map(Number);
        const [th, tm] = b.to.split(':').map(Number);
        const mins = (th * 60 + tm) - (fh * 60 + fm);
        if (mins > 0) {
          slots.push({ from: b.from, to: b.to, availableMinutes: mins });
          totalMins += mins;
        }
      }
      if (totalMins > 0) freeSlotsPerDay[dateStr] = { slots, totalAvailableMinutes: totalMins };
    }

    // ── AI payload ────────────────────────────────────────────────────────────
    const payload = {
      weekStart:     weekStartStr,
      weekEnd:       weekEndStr,
      todayDate:     todayStr,
      scheduleFromDate: scheduleFromStr,   // earliest date to place sessions
      availability,
      freeSlotsPerDay,
      preferences: {
        maxSessionHours: maxSessHours || 'Unlimited',
        breakMinutes:    breakMins,
      },
      assignments: assignmentList,
    };

    const systemPrompt = `You are an expert academic scheduling AI. Generate a study plan for exactly ONE week.
Output ONLY valid JSON — no markdown, no explanation, no extra keys.

=== STRICT RULES ===

1. AVAILABILITY ONLY: Schedule sessions ONLY within the "availability" blocks (day + from/to in 24h).
   A session from HH:mm to HH:mm must fit ENTIRELY within a single availability block.
   Example: block is 08:00–12:00. A 2h session starting 11:00 ends 13:00 — INVALID. Start at 10:00 instead.

2. FUTURE DATES ONLY: Never schedule a session on a date before "scheduleFromDate".
   For the current week this is today. For future weeks this is the weekStart date.

3. SCHEDULING WINDOW:
   Each assignment has "scheduleFrom" (YYYY-MM-DD) and "scheduleTo" (YYYY-MM-DD).
   "scheduleLatestTime" is the exact ISO cutoff — the session must END before this.
   → No session may start before scheduleFrom.
   → No session may end after scheduleLatestTime.

4. EXACT HOURS (CRITICAL):
   Each assignment has "remainingHours". The sum of "hours" across ALL sessions for that
   assignment must equal EXACTLY remainingHours. Never more, never less.
   Example: remainingHours=1.5 → schedule exactly 1.5h total (e.g. 1h + 0.5h, or one 1.5h block).

5. SPLITTING: If remainingHours > maxSessionHours, split across multiple sessions.
   Name them "Title (Part 1)", "Title (Part 2)", etc. Each ≤ maxSessionHours.

6. BREAKS: Leave exactly breakMinutes gap between consecutive sessions in the same block.

7. PRIORITY: Schedule earliest-dueDate assignments first. Use ALL available time.

8. USE FREE SLOTS (CRITICAL — READ THIS CAREFULLY):
   "freeSlotsPerDay" shows EXACTLY how much time is available each day.
   Before placing any session, check "freeSlotsPerDay" for that date.
   If totalAvailableMinutes for a date ≥ session length in minutes → the session FITS. Place it.
   You MUST greedily fill free time. Do NOT skip a day that has free minutes.
   Only put an assignment in "unscheduled" if EVERY day in its scheduleFrom–scheduleTo
   range has 0 available minutes for the required session length.

9. NO PHANTOM ENTRIES: Only include sessions/warnings/unscheduled for assignmentIds
   that appear EXACTLY in the provided "assignments" array. Copy the id character-for-character.
   Do NOT invent entries for any other assignment.

10. WARNINGS vs UNSCHEDULED:
    - "warnings": assignment was partially scheduled (scheduledHours < remainingHours but > 0)
    - "unscheduled": assignment could not be scheduled AT ALL (0 hours placed)
    - NEVER put the same assignment in both warnings AND unscheduled.
    - NEVER add a warning if scheduledHours === remainingHours (fully scheduled = no warning).

=== OUTPUT SCHEMA ===
{
  "sessions": [
    { "assignmentId": "<exact id>", "title": "string", "courseId": "string|null",
      "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm", "hours": 1.5 }
  ],
  "warnings": [
    { "assignmentId": "<exact id>", "title": "string",
      "scheduledHours": 1.0, "neededHours": 2.5, "message": "string" }
  ],
  "unscheduled": [
    { "assignmentId": "<exact id>", "title": "string", "reason": "string" }
  ]
}`;

    // ── Call Groq ─────────────────────────────────────────────────────────────
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

    // ── Post-processing ───────────────────────────────────────────────────────
    const validAssignmentIds = new Set(assignmentList.map(a => a.id));

    const windowMap = {};
    for (const a of assignmentList) {
      windowMap[a.id] = { from: a.scheduleFrom, latest: new Date(a.scheduleLatestTime) };
    }

    // Availability block bounds per date (for overflow validation)
    const availBlockEndByDay = {};
    for (let i = 0; i <= 6; i++) {
      const dayDate = new Date(weekStart);
      dayDate.setUTCDate(weekStart.getUTCDate() + i);
      const dateStr = toDateStr(dayDate);
      const dayName = DAY_NAMES[dayDate.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      if (!blocks.length) continue;
      availBlockEndByDay[dateStr] = blocks.map(b => {
        const [th, tm] = b.to.split(':').map(Number);
        const [fh, fm] = b.from.split(':').map(Number);
        return { fromMins: fh * 60 + fm, toMins: th * 60 + tm };
      });
    }

    const validSessions            = [];
    const droppedHoursByAssignment = {};

    for (const s of (plan.sessions || [])) {
      // Strip phantom IDs
      if (!validAssignmentIds.has(s.assignmentId)) continue;

      // Strip past dates (before scheduleFromDate)
      if (s.date < scheduleFromStr) {
        droppedHoursByAssignment[s.assignmentId] = (droppedHoursByAssignment[s.assignmentId] || 0) + (s.hours || 0);
        continue;
      }

      // Strip outside scheduling window
      const w = windowMap[s.assignmentId];
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

      // Strip sessions that overflow their availability block
      const blocks = availBlockEndByDay[s.date] || [];
      const [sfh, sfm] = s.from.split(':').map(Number);
      const [sth, stm] = s.to.split(':').map(Number);
      const sessionFromMins = sfh * 60 + sfm;
      const sessionToMins   = sth * 60 + stm;
      const fitsInBlock = blocks.some(b =>
        sessionFromMins >= b.fromMins && sessionToMins <= b.toMins
      );
      if (!fitsInBlock) {
        droppedHoursByAssignment[s.assignmentId] = (droppedHoursByAssignment[s.assignmentId] || 0) + (s.hours || 0);
        continue;
      }

      validSessions.push({ ...s, completed: false, skipped: false });
    }

    // Enforce exact hours per assignment
    const hoursScheduledByAssignment = {};
    const finalSessions = [];

    for (const s of validSessions) {
      const a = assignmentList.find(x => x.id === s.assignmentId);
      if (!a) { finalSessions.push(s); continue; }

      const already   = hoursScheduledByAssignment[s.assignmentId] || 0;
      const remaining = Math.round((a.remainingHours - already) * 4) / 4;
      if (remaining <= 0) continue;

      if (s.hours > remaining) {
        const [fh, fm]     = s.from.split(':').map(Number);
        const clampedMins  = Math.round(remaining * 60);
        const endTotalMins = fh * 60 + fm + clampedMins;
        const clampedTo    = `${String(Math.floor(endTotalMins / 60)).padStart(2,'0')}:${String(endTotalMins % 60).padStart(2,'0')}`;
        finalSessions.push({ ...s, to: clampedTo, hours: remaining });
        hoursScheduledByAssignment[s.assignmentId] = a.remainingHours;
      } else {
        finalSessions.push(s);
        hoursScheduledByAssignment[s.assignmentId] = already + s.hours;
      }
    }

    // Post-process warnings — strip phantoms
    const aiWarnings = (plan.warnings || []).filter(w => validAssignmentIds.has(w.assignmentId));

    for (const [assignmentId, droppedHours] of Object.entries(droppedHoursByAssignment)) {
      const a = assignmentList.find(x => x.id === assignmentId);
      if (!a) continue;
      const existing = aiWarnings.find(w => w.assignmentId === assignmentId);
      if (existing) {
        existing.message += ` (${droppedHours}h removed — outside valid window or availability block)`;
      } else {
        aiWarnings.push({
          assignmentId,
          title:          a.title,
          scheduledHours: hoursScheduledByAssignment[assignmentId] || 0,
          neededHours:    a.remainingHours,
          message:        `${droppedHours}h removed — sessions were outside valid window or availability block.`,
        });
      }
    }

    // Strip phantom unscheduled
    let aiUnscheduled = (plan.unscheduled || []).filter(u => validAssignmentIds.has(u.assignmentId));

    // Remove from unscheduled if fully scheduled
    aiUnscheduled = aiUnscheduled.filter(u => {
      const scheduled = hoursScheduledByAssignment[u.assignmentId] || 0;
      const a = assignmentList.find(x => x.id === u.assignmentId);
      if (!a) return true;
      return scheduled < a.remainingHours;
    });

    // Remove from unscheduled if already in warnings (AI sometimes puts same item in both)
    const warnedIds = new Set(aiWarnings.map(w => w.assignmentId));
    aiUnscheduled = aiUnscheduled.filter(u => !warnedIds.has(u.assignmentId));

    res.json({
      sessions:    finalSessions,
      warnings:    [...preWarnings,    ...aiWarnings],
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
        userId:      req.userId,
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
