// api/src/routes/planner.js
'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(date, firstDay = 'sunday') {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = firstDay === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Returns { earliest: Date, latest: Date } or null if window is invalid. */
function getSchedulingWindow(dueDate, advanceDays, bufferHours) {
  const due      = new Date(dueDate);
  const earliest = new Date(due.getTime() - advanceDays * 86400000);
  const latest   = new Date(due.getTime() - bufferHours * 3600000);
  if (earliest >= latest) return null;
  return { earliest, latest };
}

/** Convert "HH:mm" to total minutes. */
function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Convert total minutes to "HH:mm". */
function fromMins(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Round to nearest 0.25. */
function r4(n) { return Math.round(n * 4) / 4; }

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
    console.error('GET /planner/preferences:', err);
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
        return res.status(400).json({ message: '"Finish at least" must be a whole number ≥ 1.' });
    }

    if (advanceDays !== undefined) {
      const a = Number(advanceDays);
      if (!Number.isInteger(a) || a < 1)
        return res.status(400).json({ message: '"Start scheduling up to" must be a whole number ≥ 1.' });
      if (a > 90)
        return res.status(400).json({ message: '"Start scheduling up to" cannot exceed 90 days.' });
      const currentBuf = bufferHours !== undefined
        ? Number(bufferHours)
        : ((await User.findById(req.userId).select('studyPlanner'))?.studyPlanner?.bufferHours ?? 24);
      if (a * 24 <= currentBuf)
        return res.status(400).json({
          message: `"Start scheduling up to" (${a}d = ${a * 24}h) must exceed "Finish at least" (${currentBuf}h).`,
        });
    }

    if (maxSessionHours !== undefined && maxSessionHours !== null) {
      const m = Number(maxSessionHours);
      if (isNaN(m) || m < 0.5 || m > 23)
        return res.status(400).json({ message: 'Max session must be between 0.5 and 23 hours.' });
    }

    if (breakMinutes !== undefined) {
      if (![0, 15, 30, 45, 60].includes(Number(breakMinutes)))
        return res.status(400).json({ message: 'Break minutes must be 0, 15, 30, 45, or 60.' });
    }

    if (availability !== undefined) {
      for (const block of availability) {
        if (!DAY_NAMES.includes(block.day))
          return res.status(400).json({ message: `Invalid day: ${block.day}` });
        if (!block.from || !block.to)
          return res.status(400).json({ message: 'Each availability block must have from and to.' });
        if (block.from >= block.to)
          return res.status(400).json({ message: `${block.day}: start must be before end.` });
      }
    }

    const setFields = {}, unsetFields = {};
    if (availability    !== undefined) setFields['studyPlanner.availability']    = availability;
    if (bufferHours     !== undefined) setFields['studyPlanner.bufferHours']     = Number(bufferHours);
    if (advanceDays     !== undefined) setFields['studyPlanner.advanceDays']     = Number(advanceDays);
    if (breakMinutes    !== undefined) setFields['studyPlanner.breakMinutes']    = Number(breakMinutes);
    if (maxSessionHours !== undefined) {
      if (maxSessionHours === null) unsetFields['studyPlanner.maxSessionHours'] = '';
      else                          setFields['studyPlanner.maxSessionHours']   = Number(maxSessionHours);
    }

    if (!Object.keys(setFields).length && !Object.keys(unsetFields).length) {
      const u = await User.findById(req.userId).select('studyPlanner');
      return res.json({ studyPlanner: u?.studyPlanner || {} });
    }

    const op = {};
    if (Object.keys(setFields).length)   op.$set   = setFields;
    if (Object.keys(unsetFields).length) op.$unset = unsetFields;

    const user = await User.findByIdAndUpdate(req.userId, op, { new: true }).select('studyPlanner');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ studyPlanner: user.studyPlanner });
  } catch (err) {
    console.error('PUT /planner/preferences:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /planner/generate ────────────────────────────────────────────────────

router.post('/generate', auth, async (req, res) => {
  try {
    // ── 1. Load user settings ─────────────────────────────────────────────────
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const planner      = user.studyPlanner || {};
    const bufferHours  = planner.bufferHours    ?? 24;
    const advanceDays  = planner.advanceDays     ?? 7;
    const breakMins    = planner.breakMinutes    ?? 15;
    const maxSessHours = planner.maxSessionHours ?? null;   // null = unlimited
    const availability = planner.availability   || [];
    const firstDay     = user.preferences?.firstDayOfWeek || 'sunday';

    if (!availability.length)
      return res.status(400).json({ message: 'No availability set. Configure your study planner settings.' });

    // ── 2. Resolve target week ─────────────────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    const weekStart = req.body.weekStart
      ? (() => { const d = new Date(req.body.weekStart + 'T00:00:00.000Z'); d.setUTCHours(0,0,0,0); return d; })()
      : getWeekStart(today, firstDay);

    const weekStartStr = toDateStr(weekStart);
    const weekEnd      = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    const weekEndStr = toDateStr(weekEnd);

    // Sessions can start on today at the earliest (for current week) or weekStart (for future weeks)
    const scheduleFrom    = weekStart > today ? weekStart : today;
    const scheduleFromStr = toDateStr(scheduleFrom);

    // ── 3. Fetch incomplete assignments ───────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId: req.userId, completed: false, dueDate: { $ne: null },
    }).sort({ dueDate: 1 });

    // ── 4. Separate overdue (for current-week unscheduled notice) vs eligible ─
    const preUnscheduled = [];
    const eligible       = [];

    const currentWeekStartStr = toDateStr(getWeekStart(today, firstDay));

    for (const a of allAssignments) {
      const win = getSchedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue;

      if (win.latest < today) {
        // Only surface overdue items on the current week's plan
        if (weekStartStr === currentWeekStartStr) {
          preUnscheduled.push({
            assignmentId: a._id,
            title:        a.title,
            reason:       `Deadline has passed — latest scheduling time was ${toDateStr(win.latest)}.`,
          });
        }
        continue;
      }

      // Window must overlap the target week
      if (win.earliest > weekEnd || win.latest < weekStart) continue;

      eligible.push({ a, win });
    }

    if (!eligible.length)
      return res.json({ sessions: [], warnings: [], unscheduled: preUnscheduled, weekStart: weekStartStr });

    // ── 5. Sum already-completed or non-skipped hours from prior weeks ─────────
    //       Bug fix: skipped sessions don't count as "done"
    const previousPlans = await StudyPlan.find({
      userId: req.userId, weekStart: { $lt: weekStartStr },
    });

    const doneHoursMap = {}; // assignmentId → hours already completed/scheduled
    for (const plan of previousPlans) {
      for (const s of (plan.sessions || [])) {
        if (!s.assignmentId || s.skipped) continue; // skipped sessions don't count
        const id = s.assignmentId.toString();
        doneHoursMap[id] = (doneHoursMap[id] || 0) + (s.hours || 0);
      }
    }

    // ── 6. Auto-estimate Canvas tasks with no estimatedTime ──────────────────
    for (const { a } of eligible) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const gr = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model: 'llama-3.1-8b-instant',
              messages: [{ role: 'user', content: `Reply with only a single number: estimated study hours for this assignment title: "${a.title || 'assignment'}"` }],
              max_tokens: 8, temperature: 0.1,
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
          );
          const est = parseFloat(gr.data.choices[0].message.content.trim());
          if (!isNaN(est) && est > 0) {
            a.estimatedTime = r4(Math.min(Math.max(est, 0.25), 24));
            a.aiGenerated = true;
            await a.save();
          }
        } catch (_) {}
      }
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // ── 7. Build the lean assignment list for the AI ───────────────────────────
    //    We only send: id, remainingHours, scheduleFrom, scheduleTo, dueDate
    //    The AI does NOT need titles, courseIds, or anything else.
    const assignmentMeta = {}; // id → full meta (for post-processing, never sent to AI)
    const aiAssignments  = [];

    for (const { a, win } of eligible) {
      const done      = doneHoursMap[a._id.toString()] || 0;
      const total     = a.estimatedTime || 1;
      const remaining = r4(Math.max(total - done, 0));

      if (remaining <= 0) continue; // fully done in prior weeks

      // Clamp the window to this week and scheduleFrom
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));
      const effectiveFrom   = new Date(Math.max(clampedEarliest.getTime(), scheduleFrom.getTime()));

      if (effectiveFrom > clampedLatest) continue; // window doesn't reach this week

      const id          = a._id.toString();
      const schedFromStr = toDateStr(effectiveFrom);
      // scheduleTo = the date the latest session must END on (or before)
      const schedToStr   = toDateStr(clampedLatest);
      // latestEndMins = the latest minute-of-day the last session can end (on scheduleTo)
      // We compute this from win.latest time-of-day, treating it as HH:mm UTC (same as availability)
      const latestEndMins = clampedLatest.getUTCHours() * 60 + clampedLatest.getUTCMinutes();

      assignmentMeta[id] = {
        id,
        title:      a.title,
        courseId:   a.courseId ? a.courseId.toString() : null,
        remaining,
        schedFrom:  schedFromStr,
        schedTo:    schedToStr,
        latestEndMins, // minute-of-day ceiling on schedTo day
      };

      aiAssignments.push({
        id,
        hours:     remaining,
        from:      schedFromStr,
        to:        schedToStr,
        due:       toDateStr(new Date(a.dueDate)),
      });
    }

    if (!aiAssignments.length)
      return res.json({ sessions: [], warnings: [], unscheduled: preUnscheduled, weekStart: weekStartStr });

    // ── 8. Build per-date availability blocks (what the AI sees as "free time") ─
    //    Key: "YYYY-MM-DD", Value: array of { from: "HH:mm", to: "HH:mm" }
    const dailySlots = {};
    for (let i = 0; i <= 6; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      const dateStr = toDateStr(d);
      if (dateStr < scheduleFromStr) continue;
      const dayName = DAY_NAMES[d.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      if (blocks.length) dailySlots[dateStr] = blocks.map(b => ({ from: b.from, to: b.to }));
    }

    // ── 9. Build system prompt (lean) ─────────────────────────────────────────
    const systemPrompt = `You are a scheduling assistant. Output ONLY valid JSON, no markdown.

You will receive:
- "slots": available time per date { "YYYY-MM-DD": [{ from, to }] }
- "prefs": { breakMins, maxSessionHours }
- "tasks": array of { id, hours, from, to, due }
  - "hours": exact hours that MUST be scheduled this week
  - "from"/"to": date range the task must be scheduled within (inclusive)
  - "due": due date (schedule earlier-due tasks first)

RULES:
1. Schedule ONLY within the given slots. A session must fit ENTIRELY inside ONE slot.
2. Schedule sessions ONLY on dates within the task's from–to range.
3. Leave exactly breakMins between consecutive sessions on the same date.
4. If hours > maxSessionHours, split into multiple sessions each ≤ maxSessionHours.
5. Sessions must not overlap on the same date.
6. Sort tasks by due date — schedule earlier-due tasks first.
7. Do NOT output anything about a task that got fully scheduled in "partial"/"unscheduled".

OUTPUT SCHEMA (no other fields):
{
  "sessions": [{ "id": "<task id>", "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm" }],
  "partial":  [{ "id": "<task id>", "scheduledMins": 90 }],
  "unscheduled": ["<task id>"]
}`;

    const aiPayload = {
      slots: dailySlots,
      prefs: {
        breakMins,
        maxSessionHours: maxSessHours || 'unlimited',
      },
      tasks: aiAssignments,
    };

    // ── 10. Call Groq ──────────────────────────────────────────────────────────
    const groqRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model:           'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: JSON.stringify(aiPayload) },
        ],
        response_format: { type: 'json_object' },
        temperature:     0.1,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const aiPlan = JSON.parse(groqRes.data.choices[0].message.content);

    // ── 11. Build per-date availability map for validation ────────────────────
    const availByDate = {}; // dateStr → [{ fromMins, toMins }]
    for (const [dateStr, blocks] of Object.entries(dailySlots)) {
      availByDate[dateStr] = blocks.map(b => ({ fromMins: toMins(b.from), toMins: toMins(b.to) }));
    }

    const validIds = new Set(Object.keys(assignmentMeta));

    // ── 12. Validate + normalize AI sessions ─────────────────────────────────
    //    - Ignore unknown ids
    //    - Compute hours from from/to (never trust the AI's hours field)
    //    - Drop if outside availability block
    //    - Drop if outside assignment window
    //    - Drop if < 15 minutes
    //    - Track capped hours per assignment to not exceed remaining
    const candidateSessions = []; // { id, date, from, to, hours }

    for (const s of (aiPlan.sessions || [])) {
      const id = s.id;
      if (!id || !validIds.has(id)) continue;

      const meta = assignmentMeta[id];
      if (!meta) continue;

      const date = s.date;
      if (!date || date < meta.schedFrom || date > meta.schedTo) continue;
      if (date < scheduleFromStr) continue;

      const from = s.from;
      const to   = s.to;
      if (!from || !to) continue;

      const fromM = toMins(from);
      const toM   = toMins(to);
      if (toM <= fromM) continue; // invalid time range

      // Compute hours from from/to — never trust AI's reported hours
      const sessionMins  = toM - fromM;
      const sessionHours = r4(sessionMins / 60);
      if (sessionHours < 0.25) continue; // < 15 min sessions dropped

      // Must fit entirely inside an availability block on that date
      const blocks = availByDate[date] || [];
      if (!blocks.some(b => fromM >= b.fromMins && toM <= b.toMins)) continue;

      // On the scheduleTo date, the session must end before latestEndMins
      if (date === meta.schedTo && meta.latestEndMins > 0 && toM > meta.latestEndMins) continue;

      candidateSessions.push({ id, date, from, to, hours: sessionHours });
    }

    // Sort by date then from-time
    candidateSessions.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.from.localeCompare(b.from)
    );

    // ── 13. Final pass: enforce no-overlap + cap at remainingHours ─────────────
    const scheduledMinsById = {}; // id → minutes already placed
    const occupiedByDate    = {}; // dateStr → [[fromMins, toMins]]
    const finalSessions     = [];

    for (const s of candidateSessions) {
      const meta = assignmentMeta[s.id];
      const remainingMins = Math.round(meta.remaining * 60) - (scheduledMinsById[s.id] || 0);

      if (remainingMins <= 0) continue; // already filled

      const fromM    = toMins(s.from);
      let   toM      = toMins(s.to);
      let   sessMins = toM - fromM;

      // Cap to remaining
      if (sessMins > remainingMins) {
        sessMins = remainingMins;
        toM      = fromM + sessMins;
      }

      // Must still be >= 15 min after capping
      if (sessMins < 15) continue;

      const occupied = occupiedByDate[s.date] || [];
      if (occupied.some(([oF, oT]) => fromM < oT && toM > oF)) continue; // overlap

      // Commit
      occupiedByDate[s.date] = [...occupied, [fromM, toM]];
      scheduledMinsById[s.id] = (scheduledMinsById[s.id] || 0) + sessMins;

      finalSessions.push({
        assignmentId: meta.id,
        title:        meta.title,
        courseId:     meta.courseId || null,
        date:         s.date,
        from:         s.from,
        to:           fromMins(toM),
        hours:        r4(sessMins / 60),
        completed:    false,
        skipped:      false,
      });
    }

    // ── 14. Build warnings and unscheduled deterministically ──────────────────
    //    We never trust the AI's partial/unscheduled — we compute it ourselves.
    const warnings    = [...preWarnings];  // preWarnings from step 4 (none yet, reserved)
    const unscheduled = [...preUnscheduled];

    for (const meta of Object.values(assignmentMeta)) {
      const scheduledMins  = scheduledMinsById[meta.id] || 0;
      const scheduledHours = r4(scheduledMins / 60);
      const needed         = meta.remaining;

      if (scheduledHours >= needed) continue; // fully scheduled — no warning

      if (scheduledHours === 0) {
        // Nothing placed at all
        unscheduled.push({
          assignmentId: meta.id,
          title:        meta.title,
          reason:       'No available time slots.',
        });
      } else {
        // Partially placed
        warnings.push({
          assignmentId:   meta.id,
          title:          meta.title,
          scheduledHours,
          neededHours:    needed,
          message:        `Only ${scheduledHours}h of ${needed}h could be scheduled this week.`,
        });
      }
    }

    res.json({ sessions: finalSessions, warnings, unscheduled, weekStart: weekStartStr });

  } catch (err) {
    console.error('POST /planner/generate:', err.response?.data || err.message);
    res.status(500).json({ message: 'Failed to generate study plan', error: err.message });
  }
});

// ─── POST /planner/schedule — save plan ───────────────────────────────────────

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
    console.error('POST /planner/schedule:', err);
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
    console.error('GET /planner/schedule:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── PATCH /planner/schedule/:sessionId — mark done / skip ───────────────────

router.patch('/schedule/:sessionId', auth, async (req, res) => {
  try {
    const { sessionId }         = req.params;
    const { completed, skipped } = req.body;

    const plan = await StudyPlan.findOne({ userId: req.userId, 'sessions._id': sessionId });
    if (!plan) return res.status(404).json({ message: 'Session not found' });

    const session = plan.sessions.id(sessionId);
    if (completed !== undefined) session.completed = completed;
    if (skipped   !== undefined) session.skipped   = skipped;
    await plan.save();

    res.json({ sessionId, completed: session.completed, skipped: session.skipped });
  } catch (err) {
    console.error('PATCH /planner/schedule:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;