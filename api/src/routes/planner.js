// api/src/routes/planner.js
'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function toDateStr(d) { return d.toISOString().slice(0, 10); }

function getWeekStart(date, firstDay = 'sunday') {
  const d   = new Date(date);
  const day = d.getUTCDay();
  const diff = firstDay === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Returns { earliest, latest } Date objects or null if window collapses.
function schedulingWindow(dueDate, advanceDays, bufferHours) {
  const due      = new Date(dueDate);
  const earliest = new Date(due.getTime() - advanceDays * 86400000);
  const latest   = new Date(due.getTime() - bufferHours * 3600000);
  if (earliest >= latest) return null;
  return { earliest, latest };
}

// "HH:mm" → total minutes
function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// total minutes → "HH:mm"
function fromMins(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

// Round to nearest 0.25
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
    const { availability, bufferHours, advanceDays } = req.body;

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

    const setFields = {};
    if (availability !== undefined) setFields['studyPlanner.availability'] = availability;
    if (bufferHours  !== undefined) setFields['studyPlanner.bufferHours']  = Number(bufferHours);
    if (advanceDays  !== undefined) setFields['studyPlanner.advanceDays']  = Number(advanceDays);

    if (!Object.keys(setFields).length) {
      const u = await User.findById(req.userId).select('studyPlanner');
      return res.json({ studyPlanner: u?.studyPlanner || {} });
    }

    const user = await User.findByIdAndUpdate(
      req.userId, { $set: setFields }, { new: true }
    ).select('studyPlanner');
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

    // ── 1. Load user settings ──────────────────────────────────────────────────
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const planner      = user.studyPlanner || {};
    const bufferHours  = planner.bufferHours ?? 24;
    const advanceDays  = planner.advanceDays  ?? 7;
    const availability = planner.availability || [];
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

    // For the current week: can only schedule from today onward.
    // For future weeks: can schedule from the first day of that week.
    const scheduleFrom    = weekStart > today ? weekStart : today;
    const scheduleFromStr = toDateStr(scheduleFrom);

    // ── 3. Fetch incomplete assignments ───────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId: req.userId,
      completed: false,
      dueDate: { $ne: null },
    }).sort({ dueDate: 1 });

    // ── 4. Classify: overdue vs eligible ─────────────────────────────────────
    const overdueUnscheduled = [];
    const eligible           = [];
    const currentWeekStartStr = toDateStr(getWeekStart(today, firstDay));

    for (const a of allAssignments) {
      const win = schedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue;

      if (win.latest < today) {
        // Only show overdue items on the current week's plan, not on future weeks
        if (weekStartStr === currentWeekStartStr) {
          overdueUnscheduled.push({
            assignmentId: a._id,
            title:        a.title,
            reason:       `Deadline passed — last valid date was ${toDateStr(win.latest)}.`,
          });
        }
        continue;
      }

      // The scheduling window must overlap with the target week
      if (win.earliest > weekEnd || win.latest < weekStart) continue;

      eligible.push({ a, win });
    }

    if (!eligible.length)
      return res.json({ sessions: [], warnings: [], unscheduled: overdueUnscheduled, weekStart: weekStartStr });

    // ── 5. Count hours already scheduled in PREVIOUS weeks (skip skipped sessions) ─
    const previousPlans = await StudyPlan.find({
      userId:    req.userId,
      weekStart: { $lt: weekStartStr },
    });

    const doneHoursMap = {};
    for (const plan of previousPlans) {
      for (const s of (plan.sessions || [])) {
        if (!s.assignmentId || s.skipped) continue;
        const id = s.assignmentId.toString();
        doneHoursMap[id] = (doneHoursMap[id] || 0) + (s.hours || 0);
      }
    }

    // ── 6. Auto-estimate Canvas tasks that have no estimatedTime set ──────────
    for (const { a } of eligible) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const gr = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model:       'llama-3.1-8b-instant',
              messages:    [{ role: 'user', content: `Reply with ONE number only — estimated study hours needed: "${a.title || 'assignment'}"` }],
              max_tokens:  8,
              temperature: 0.1,
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
          );
          const est = parseFloat(gr.data.choices[0].message.content.trim());
          if (!isNaN(est) && est > 0) {
            a.estimatedTime = r4(Math.min(Math.max(est, 0.25), 24));
            a.aiGenerated = true;
            await a.save();
          }
        } catch (_) { /* ignore — fallback below */ }
      }
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // ── 7. Build lean task list + meta map ────────────────────────────────────
    // assignmentMeta: server-only, used in post-processing. Never sent to AI.
    // aiTasks: the minimal payload the AI receives.
    const assignmentMeta = {}; // id → { id, title, courseId, remaining, schedFrom, schedTo, latestEndMins }
    const aiTasks        = []; // [{ id, hours, from, to, due }]

    for (const { a, win } of eligible) {
      const done      = doneHoursMap[a._id.toString()] || 0;
      const total     = a.estimatedTime || 1;
      const remaining = r4(Math.max(total - done, 0));
      if (remaining <= 0) continue; // fully done in prior weeks

      // Clamp window to this week, and to scheduleFrom
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));
      const effectiveFrom   = new Date(Math.max(clampedEarliest.getTime(), scheduleFrom.getTime()));

      if (effectiveFrom > clampedLatest) continue; // clamped window is empty

      const id           = a._id.toString();
      const schedFromStr = toDateStr(effectiveFrom);
      const schedToStr   = toDateStr(clampedLatest);
      // latestEndMins: the latest minute-of-day a session may END on the schedTo date
      const latestEndMins = clampedLatest.getUTCHours() * 60 + clampedLatest.getUTCMinutes();

      assignmentMeta[id] = {
        id,
        title:         a.title,
        courseId:      a.courseId ? a.courseId.toString() : null,
        remaining,
        schedFrom:     schedFromStr,
        schedTo:       schedToStr,
        latestEndMins,
      };

      aiTasks.push({
        id,
        hours: remaining,
        from:  schedFromStr,  // earliest date this task can be scheduled
        to:    schedToStr,    // latest date this task can be scheduled
        due:   toDateStr(new Date(a.dueDate)),
      });
    }

    if (!aiTasks.length)
      return res.json({ sessions: [], warnings: [], unscheduled: overdueUnscheduled, weekStart: weekStartStr });

    // ── 8. Build per-date slot map for AI ─────────────────────────────────────
    // Only include dates >= scheduleFromStr with actual availability blocks.
    const dailySlots = {}; // { "YYYY-MM-DD": [{ from, to }] }
    for (let i = 0; i <= 6; i++) {
      const d = new Date(weekStart);
      d.setUTCDate(weekStart.getUTCDate() + i);
      const dateStr = toDateStr(d);
      if (dateStr < scheduleFromStr) continue;
      const dayName = DAY_NAMES[d.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      if (blocks.length) dailySlots[dateStr] = blocks.map(b => ({ from: b.from, to: b.to }));
    }

    // ── 9. AI prompt + call ───────────────────────────────────────────────────
    const systemPrompt = `You are a study session scheduler. Output ONLY a JSON object — no markdown, no prose.

INPUT YOU RECEIVE:
- "slots": free time blocks per date  →  { "YYYY-MM-DD": [{from,to}, …] }
- "tasks": work to schedule  →  [{ id, hours, from, to, due }]
  - id     : opaque string — copy it exactly into output, never modify it
  - hours  : total hours that MUST be scheduled across all sessions for this task
  - from   : earliest date (inclusive) a session may be placed
  - to     : latest date (inclusive) a session may be placed
  - due    : due date — schedule earlier-due tasks first (highest priority)

HARD RULES — violating any rule makes the output wrong:
1. SLOTS ONLY: every session must start AND end within a single slot on that date.
   Example: slot 08:00–12:00, session 11:00–13:00 is INVALID (overruns slot).
2. DATE WINDOW: session date must be >= task.from AND <= task.to.
3. NO OVERLAP: two sessions on the same date must never share any minute.
   After placing session A that ends at T, the next session on the same date
   must start at T or later (no gap required — just no overlap).
4. EXACT HOURS: sum of all session durations for a task MUST equal task.hours exactly.
   Compute duration from (to - from) in minutes, never guess.
5. PRIORITY: fill earliest-due tasks completely before starting later ones.
6. FILL GREEDILY: use all available slot time; do not leave gaps unused if tasks remain.
7. SPLIT LARGE TASKS: if task.hours exceeds the length of a single available slot,
   split across multiple sessions (different time blocks or different days).

OUTPUT FORMAT (exactly this shape, no extra keys):
{
  "sessions": [
    { "id": "<exact task id>", "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm" }
  ]
}

Do NOT include tasks in sessions if there is no slot available for them.
Do NOT include any field other than id, date, from, to in each session object.`;

    const aiPayload = { slots: dailySlots, tasks: aiTasks };

    let aiPlan;
    try {
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
          max_tokens:      4096,
        },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      );
      aiPlan = JSON.parse(groqRes.data.choices[0].message.content);
    } catch (groqErr) {
      console.error('Groq call failed:', groqErr.response?.data || groqErr.message);
      return res.status(502).json({ message: 'AI scheduling service unavailable. Please try again.' });
    }

    // ── 10. Build availability lookup for validation ───────────────────────────
    const availByDate = {}; // dateStr → [{ fromMins, toMins }]
    for (const [dateStr, blocks] of Object.entries(dailySlots)) {
      availByDate[dateStr] = blocks.map(b => ({ fromMins: toMins(b.from), toMins: toMins(b.to) }));
    }

    const validIds = new Set(Object.keys(assignmentMeta));

    // ── 11. Validate every AI session — drop bad ones silently ────────────────
    // Rules checked:
    //   a) id must be in validIds
    //   b) date must be within [scheduleFromStr, task.schedTo]
    //   c) from < to, duration >= 15 min
    //   d) session must fit entirely inside one availability block
    //   e) on task.schedTo day: session must end <= latestEndMins
    const candidates = [];

    for (const s of (Array.isArray(aiPlan.sessions) ? aiPlan.sessions : [])) {
      const id = s.id;
      if (!id || !validIds.has(id)) continue;

      const meta = assignmentMeta[id];
      const date = s.date;
      if (!date || typeof date !== 'string') continue;
      if (date < scheduleFromStr || date < meta.schedFrom || date > meta.schedTo) continue;

      const from = s.from;
      const to   = s.to;
      if (!from || !to || typeof from !== 'string' || typeof to !== 'string') continue;

      const fromM = toMins(from);
      const toM   = toMins(to);
      if (isNaN(fromM) || isNaN(toM) || toM <= fromM) continue;

      const sessMins = toM - fromM;
      if (sessMins < 15) continue; // enforce 15-min minimum

      // Must fit entirely in one availability block
      const blocks = availByDate[date];
      if (!blocks || !blocks.some(b => fromM >= b.fromMins && toM <= b.toMins)) continue;

      // On the final allowed date, enforce the hard cutoff
      if (date === meta.schedTo && meta.latestEndMins > 0 && toM > meta.latestEndMins) continue;

      candidates.push({ id, date, fromM, toM, sessMins });
    }

    // Sort: by date asc, then by from-time asc
    candidates.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.fromM - b.fromM
    );

    // ── 12. Place sessions: enforce no-overlap + cap to remainingMins ─────────
    const placedMinsById = {}; // id → total minutes placed so far
    const occupiedByDate = {}; // dateStr → [[fromM, toM]] already placed
    const finalSessions  = [];

    for (const s of candidates) {
      const meta         = assignmentMeta[s.id];
      const targetMins   = Math.round(meta.remaining * 60);
      const placedSoFar  = placedMinsById[s.id] || 0;
      const remainingMin = targetMins - placedSoFar;

      if (remainingMin <= 0) continue; // task already fully filled

      let fromM    = s.fromM;
      let toM      = s.toM;
      let sessMins = s.sessMins;

      // Cap this session to what's still needed
      if (sessMins > remainingMin) {
        sessMins = remainingMin;
        toM      = fromM + sessMins;
      }
      if (sessMins < 15) continue; // too short after capping

      // Check overlap with already-placed sessions on this date
      const occupied = occupiedByDate[s.date] || [];
      if (occupied.some(([oF, oT]) => fromM < oT && toM > oF)) continue;

      // Commit
      occupiedByDate[s.date]  = [...occupied, [fromM, toM]];
      placedMinsById[s.id]    = placedSoFar + sessMins;

      finalSessions.push({
        assignmentId: meta.id,
        title:        meta.title,
        courseId:     meta.courseId || null,
        date:         s.date,
        from:         fromMins(fromM),
        to:           fromMins(toM),
        hours:        r4(sessMins / 60),
        completed:    false,
        skipped:      false,
      });
    }

    // ── 13. Compute warnings + unscheduled deterministically ──────────────────
    // We NEVER trust the AI's own partial/unscheduled output.
    const warnings    = [];
    const unscheduled = [...overdueUnscheduled];

    for (const meta of Object.values(assignmentMeta)) {
      const placedMins  = placedMinsById[meta.id] || 0;
      const placedHours = r4(placedMins / 60);
      const needed      = meta.remaining;

      if (placedHours >= needed) continue; // fully scheduled

      if (placedHours === 0) {
        unscheduled.push({
          assignmentId: meta.id,
          title:        meta.title,
          reason:       'No available time slots this week.',
        });
      } else {
        warnings.push({
          assignmentId:   meta.id,
          title:          meta.title,
          scheduledHours: placedHours,
          neededHours:    needed,
          message:        `Only ${placedHours}h of ${needed}h could be scheduled this week.`,
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
      {
        userId:      req.userId,
        weekStart,
        sessions:    sessions    || [],
        warnings:    warnings    || [],
        unscheduled: unscheduled || [],
        generatedAt: new Date(),
      },
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
    const { sessionId }          = req.params;
    const { completed, skipped } = req.body;

    const plan = await StudyPlan.findOne({ userId: req.userId, 'sessions._id': sessionId });
    if (!plan) return res.status(404).json({ message: 'Session not found' });

    const session = plan.sessions.id(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found in plan' });
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
