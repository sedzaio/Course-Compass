// api/src/routes/planner.js
'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

/** Date → "YYYY-MM-DD" (UTC) */
function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → Date at UTC midnight */
function parseDate(str) {
  const d = new Date(str + 'T00:00:00.000Z');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Compute the Monday or Sunday that begins the week containing `date`. */
function getWeekStart(date, firstDay = 'sunday') {
  const d   = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day  = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = firstDay === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/**
 * Returns { earliest, latest } Date objects for when work on an assignment
 * may be scheduled.  Returns null when the window is empty.
 */
function schedulingWindow(dueDate, advanceDays, bufferHours) {
  const due      = new Date(dueDate);
  const earliest = new Date(due.getTime() - advanceDays * 86_400_000);
  const latest   = new Date(due.getTime() - bufferHours  *  3_600_000);
  if (earliest >= latest) return null;
  return { earliest, latest };
}

/** "HH:mm" → total minutes from midnight */
function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Total minutes from midnight → "HH:mm" */
function fromMins(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Round to nearest quarter-hour (0.25 h) */
function r4(n) { return Math.round(n * 4) / 4; }

// ─── GET /planner/preferences ─────────────────────────────────────────────────

router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      studyPlanner:   user.studyPlanner   || {},
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
      if (!Number.isFinite(b) || b < 1)
        return res.status(400).json({ message: '"Finish at least" must be a number ≥ 1.' });
    }

    if (advanceDays !== undefined) {
      const a = Number(advanceDays);
      if (!Number.isInteger(a) || a < 1)
        return res.status(400).json({ message: '"Start scheduling up to" must be a whole number ≥ 1.' });
      if (a > 90)
        return res.status(400).json({ message: '"Start scheduling up to" cannot exceed 90 days.' });

      const currentBufDoc = await User.findById(req.userId).select('studyPlanner');
      const currentBuf    = bufferHours !== undefined
        ? Number(bufferHours)
        : (currentBufDoc?.studyPlanner?.bufferHours ?? 24);

      if (a * 24 <= currentBuf)
        return res.status(400).json({
          message: `"Start scheduling up to" (${a}d = ${a * 24}h) must be greater than "Finish at least" (${currentBuf}h).`,
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

    const updated = await User.findByIdAndUpdate(
      req.userId,
      { $set: setFields },
      { new: true },
    ).select('studyPlanner');

    if (!updated) return res.status(404).json({ message: 'User not found.' });
    res.json({ studyPlanner: updated.studyPlanner });
  } catch (err) {
    console.error('PUT /planner/preferences:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /planner/generate ────────────────────────────────────────────────────
//
//  Flow:
//    1.  Load user settings
//    2.  Resolve target week
//    3.  Fetch incomplete assignments
//    4.  Classify: overdue vs. schedulable
//    5.  Count hours already scheduled in previous weeks
//    6.  AI-estimate missing durations (Canvas tasks only)
//    7.  Build assignmentMeta map + aiTasks list
//    8.  Build per-date slot map
//    9.  Call Groq with a very strict prompt
//   10.  Validate every AI session; discard invalid ones
//   11.  Fill any remaining work deterministically (fallback scheduler)
//   12.  Enforce no-overlap + cap to remaining minutes
//   13.  Compute warnings / unscheduled
//   14.  Respond

router.post('/generate', auth, async (req, res) => {
  try {

    // ── 1. Load user settings ──────────────────────────────────────────────────
    const user = await User.findById(req.userId).select('studyPlanner preferences');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const planner      = user.studyPlanner || {};
    const bufferHours  = Number(planner.bufferHours) || 24;
    const advanceDays  = Number(planner.advanceDays)  || 7;
    const availability = planner.availability || [];
    const firstDay     = user.preferences?.firstDayOfWeek || 'sunday';

    if (!availability.length)
      return res.status(400).json({
        message: 'No availability blocks set. Go to Settings → Study Planner → Availability Blocks.',
      });

    // ── 2. Resolve target week ─────────────────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = toDateStr(today);

    // Use provided weekStart or fall back to the current week.
    const weekStart = req.body.weekStart
      ? parseDate(req.body.weekStart)
      : getWeekStart(today, firstDay);

    const weekStartStr = toDateStr(weekStart);
    const weekEnd      = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    const weekEndStr = toDateStr(weekEnd);

    // Current week → schedule from today; future week → schedule from weekStart.
    const scheduleFrom    = weekStart > today ? weekStart : today;
    const scheduleFromStr = toDateStr(scheduleFrom);

    // ── 3. Fetch incomplete assignments ───────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null },
    }).sort({ dueDate: 1 });

    // ── 4. Classify: overdue vs. eligible ─────────────────────────────────────
    const overdueUnscheduled = [];
    const eligible           = [];
    const currentWeekStartStr = toDateStr(getWeekStart(today, firstDay));

    for (const a of allAssignments) {
      const win = schedulingWindow(a.dueDate, advanceDays, bufferHours);
      if (!win) continue;

      // Overdue — window already closed
      if (win.latest <= today) {
        if (weekStartStr === currentWeekStartStr) {
          overdueUnscheduled.push({
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
      return res.json({ sessions: [], warnings: [], unscheduled: overdueUnscheduled, weekStart: weekStartStr });

    // ── 5. Count hours already placed in PREVIOUS weeks (skip skipped) ────────
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

    // ── 6. AI-estimate missing durations (Canvas only) ────────────────────────
    for (const { a } of eligible) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const gr = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
              model:       'llama-3.1-8b-instant',
              messages:    [{
                role:    'user',
                content: `Reply with ONE decimal number only — estimated total hours a student needs to complete: "${a.title || 'assignment'}"`,
              }],
              max_tokens:  8,
              temperature: 0.1,
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } },
          );
          const est = parseFloat(gr.data.choices[0].message.content.trim());
          if (!isNaN(est) && est > 0) {
            a.estimatedTime = r4(Math.min(Math.max(est, 0.25), 24));
            a.aiGenerated   = true;
            await a.save();
          }
        } catch (_) { /* ignore — fall through to default */ }
      }
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // ── 7. Build assignmentMeta + aiTasks ────────────────────────────────────
    const assignmentMeta = {};
    const aiTasks        = [];

    for (const { a, win } of eligible) {
      const done      = doneHoursMap[a._id.toString()] || 0;
      const remaining = r4(Math.max((a.estimatedTime || 1) - done, 0));
      if (remaining <= 0) continue;

      // Clamp window to [weekStart … weekEnd] and to scheduleFrom
      const clampedEarliest = new Date(Math.max(win.earliest.getTime(), weekStart.getTime()));
      const clampedLatest   = new Date(Math.min(win.latest.getTime(),   weekEnd.getTime()));
      const effectiveFrom   = new Date(Math.max(clampedEarliest.getTime(), scheduleFrom.getTime()));

      if (effectiveFrom > clampedLatest) continue;

      const id            = a._id.toString();
      const schedFromStr  = toDateStr(effectiveFrom);
      const schedToStr    = toDateStr(clampedLatest);
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
        from:  schedFromStr,
        to:    schedToStr,
        due:   toDateStr(new Date(a.dueDate)),
      });
    }

    if (!aiTasks.length)
      return res.json({ sessions: [], warnings: [], unscheduled: overdueUnscheduled, weekStart: weekStartStr });

    // ── 8. Build per-date slot map ────────────────────────────────────────────
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

    if (!Object.keys(dailySlots).length)
      return res.json({ sessions: [], warnings: [], unscheduled: overdueUnscheduled, weekStart: weekStartStr });

    // ── 9. AI prompt + call ───────────────────────────────────────────────────

    const totalAvailMins = Object.values(dailySlots)
      .flat()
      .reduce((sum, b) => sum + toMins(b.to) - toMins(b.from), 0);
    const totalNeededMins = aiTasks.reduce((sum, t) => sum + Math.round(t.hours * 60), 0);

    const systemPrompt = `\
You are a deterministic study-session scheduler. Your ONLY output is a single JSON object.
DO NOT include markdown fences, comments, explanations, or any text outside the JSON.

════════════════════════════════════════════════════════
INPUT
════════════════════════════════════════════════════════
You receive two fields:

  "slots"  →  { "YYYY-MM-DD": [ { "from": "HH:mm", "to": "HH:mm" }, … ], … }
              Available time windows, grouped by date.

  "tasks"  →  [ { "id", "hours", "from", "to", "due" }, … ]
    id    : opaque string — copy exactly, never alter
    hours : TOTAL hours that MUST be scheduled across all sessions for this task
    from  : earliest DATE (inclusive) any session may be placed
    to    : latest DATE (inclusive) any session may be placed
    due   : the assignment's due date — use for priority only

════════════════════════════════════════════════════════
STRICT RULES — every violation makes the plan wrong
════════════════════════════════════════════════════════
R1  SLOTS ONLY.
    Every session must start AND end within a SINGLE slot on that date.
    Example: slot is 08:00–12:00.  Session 11:00–13:00 is INVALID.

R2  DATE WINDOW.
    A session's date must satisfy: task.from ≤ date ≤ task.to.

R3  NO OVERLAP.
    Two sessions on the same date must NOT share any minute.
    If session A ends at T, the very next session may start at T (back-to-back OK).
    Overlapping even by 1 minute is INVALID.

R4  EXACT HOURS.
    Sum of all session durations for a task MUST equal task.hours exactly.
    Duration in minutes = toMins(to) − toMins(from).
    Never approximate — compute arithmetically.

R5  PRIORITY.
    Schedule earliest-due tasks first. Do not start a later-due task until
    an earlier-due task is fully scheduled.

R6  GREEDY FILL.
    Fill every available slot minute before leaving any task incomplete.
    If total available minutes (${totalAvailMins} min) ≥ total needed minutes
    (${totalNeededMins} min), ALL tasks must be fully scheduled.

R7  SPLIT LARGE TASKS.
    If a task requires more time than a single slot holds, split it across
    multiple time blocks or multiple days. A task may have many sessions.

R8  MINIMUM SESSION LENGTH.
    Each session must be at least 15 minutes long.

════════════════════════════════════════════════════════
SCHEDULING ALGORITHM  (execute this mentally, step by step)
════════════════════════════════════════════════════════
1. Sort tasks by due date (ascending).
2. For each task (in due-date order):
   a. Compute minutesNeeded = round(hours × 60).
   b. Iterate dates from task.from to task.to (ascending).
   c. On each date, iterate available slots (ascending by from-time).
   d. For each slot, compute free minutes = slot.toMins − max(slot.fromMins, lastUsedMin).
      (lastUsedMin tracks minutes already consumed on that date by prior sessions.)
   e. Take min(freeMinutes, minutesNeeded) for this session — must be ≥ 15.
   f. Emit session: { id, date, from: fromMins(start), to: fromMins(start+taken) }.
   g. Subtract taken from minutesNeeded. If minutesNeeded = 0, stop for this task.
3. If any task has minutesNeeded > 0 after exhausting valid dates, leave it out
   of sessions (it will appear as unscheduled on the server side — do NOT invent
   sessions outside the slot map or outside the task window).

════════════════════════════════════════════════════════
OUTPUT  (this exact shape, NO extra keys, NO extra text)
════════════════════════════════════════════════════════
{
  "sessions": [
    { "id": "<exact task id>", "date": "YYYY-MM-DD", "from": "HH:mm", "to": "HH:mm" }
  ]
}`;

    let aiSessions = [];
    try {
      const groqRes = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:           'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: JSON.stringify({ slots: dailySlots, tasks: aiTasks }) },
          ],
          response_format: { type: 'json_object' },
          temperature:     0.0,
          max_tokens:      4096,
        },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } },
      );
      const parsed = JSON.parse(groqRes.data.choices[0].message.content);
      if (Array.isArray(parsed.sessions)) aiSessions = parsed.sessions;
    } catch (groqErr) {
      // Log but do NOT return 500 — the deterministic fallback below will cover everything.
      console.warn('Groq call failed (using deterministic fallback):', groqErr.response?.data || groqErr.message);
    }

    // ── 10. Validate every AI session ─────────────────────────────────────────
    //
    //  Build availByDate lookup: dateStr → [{ fromMins, toMins }]
    const availByDate = {};
    for (const [dateStr, blocks] of Object.entries(dailySlots)) {
      availByDate[dateStr] = blocks.map(b => ({ fromMins: toMins(b.from), toMins: toMins(b.to) }));
    }

    const validIds   = new Set(Object.keys(assignmentMeta));
    const candidates = [];

    for (const s of aiSessions) {
      if (!s || !s.id || !validIds.has(s.id)) continue;
      const meta = assignmentMeta[s.id];

      if (!s.date || typeof s.date !== 'string') continue;
      if (s.date < scheduleFromStr || s.date < meta.schedFrom || s.date > meta.schedTo) continue;

      if (!s.from || !s.to) continue;
      const fromM = toMins(s.from);
      const toM   = toMins(s.to);
      if (isNaN(fromM) || isNaN(toM) || toM <= fromM) continue;
      if (toM - fromM < 15) continue;

      // Must fit entirely inside one availability block
      const blocks = availByDate[s.date];
      if (!blocks || !blocks.some(b => fromM >= b.fromMins && toM <= b.toMins)) continue;

      // On the final allowed date, enforce hard deadline cutoff
      if (s.date === meta.schedTo && meta.latestEndMins > 0 && toM > meta.latestEndMins) continue;

      candidates.push({ id: s.id, date: s.date, fromM, toM, sessMins: toM - fromM });
    }

    candidates.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.fromM - b.fromM,
    );

    // ── 11. Deterministic fallback — fill anything the AI missed ──────────────
    //
    //  We compute how many minutes the AI already covered per task, then greedily
    //  fill the remainder using the same slot map.  This guarantees a complete plan
    //  even when Groq is down or returns partial output.
    //
    //  Pass 1: tally minutes proposed by AI (before overlap dedup)
    const aiMinutesById = {};
    for (const c of candidates) {
      aiMinutesById[c.id] = (aiMinutesById[c.id] || 0) + c.sessMins;
    }

    //  Track consumed minutes per date slot-position for fallback
    //  occupiedFallback: dateStr → sorted list of [fromM, toM] intervals
    const occupiedFallback = {};
    for (const dateStr of Object.keys(dailySlots)) occupiedFallback[dateStr] = [];

    // Sort tasks by due date for greedy scheduling
    const sortedTasks = aiTasks.slice().sort((a, b) => a.due.localeCompare(b.due));

    const fallbackCandidates = [];

    for (const task of sortedTasks) {
      const meta          = assignmentMeta[task.id];
      const targetMins    = Math.round(meta.remaining * 60);
      const alreadyCovered = aiMinutesById[task.id] || 0;
      let   stillNeeded   = targetMins - alreadyCovered;

      if (stillNeeded <= 0) continue;

      // Walk dates within the task window
      const dateStart = parseDate(meta.schedFrom);
      const dateEnd   = parseDate(meta.schedTo);

      for (
        let cur = new Date(dateStart);
        cur <= dateEnd && stillNeeded > 0;
        cur.setUTCDate(cur.getUTCDate() + 1)
      ) {
        const dateStr = toDateStr(cur);
        const blocks  = availByDate[dateStr];
        if (!blocks) continue;

        const used = occupiedFallback[dateStr] || [];

        for (const block of blocks) {
          if (stillNeeded <= 0) break;
          // Find free sub-intervals within this block not yet occupied
          // Build a sorted list of occupied intervals overlapping this block
          const overlapping = used
            .filter(([f, t]) => f < block.toMins && t > block.fromMins)
            .sort((a, b) => a[0] - b[0]);

          let cursor = block.fromMins;
          const freeIntervals = [];
          for (const [oF, oT] of overlapping) {
            if (cursor < oF) freeIntervals.push([cursor, oF]);
            cursor = Math.max(cursor, oT);
          }
          if (cursor < block.toMins) freeIntervals.push([cursor, block.toMins]);

          for (const [freeFrom, freeTo] of freeIntervals) {
            if (stillNeeded <= 0) break;
            const available = freeTo - freeFrom;
            if (available < 15) continue;
            const take = Math.min(available, stillNeeded);
            if (take < 15) continue;

            const sessionTo = freeFrom + take;
            // Enforce deadline cutoff on the final date
            if (dateStr === meta.schedTo && meta.latestEndMins > 0 && sessionTo > meta.latestEndMins) {
              const capped = meta.latestEndMins - freeFrom;
              if (capped < 15) continue;
              const cappedTo = freeFrom + capped;
              fallbackCandidates.push({ id: task.id, date: dateStr, fromM: freeFrom, toM: cappedTo, sessMins: capped });
              occupiedFallback[dateStr].push([freeFrom, cappedTo]);
              stillNeeded -= capped;
            } else {
              fallbackCandidates.push({ id: task.id, date: dateStr, fromM: freeFrom, toM: sessionTo, sessMins: take });
              occupiedFallback[dateStr].push([freeFrom, sessionTo]);
              stillNeeded -= take;
            }
          }
        }
      }
    }

    // Merge AI candidates + fallback candidates; fallback only covers the gap
    const allCandidates = [...candidates, ...fallbackCandidates];
    allCandidates.sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : a.fromM - b.fromM,
    );

    // ── 12. Place sessions: dedup overlaps + cap to remaining ─────────────────
    const placedMinsById = {};
    const occupiedByDate = {};
    const finalSessions  = [];

    for (const s of allCandidates) {
      const meta        = assignmentMeta[s.id];
      const targetMins  = Math.round(meta.remaining * 60);
      const placedSoFar = placedMinsById[s.id] || 0;
      const stillNeeded = targetMins - placedSoFar;

      if (stillNeeded <= 0) continue;

      let { fromM, toM } = s;
      let sessMins = toM - fromM;

      // Cap to remaining need
      if (sessMins > stillNeeded) {
        sessMins = stillNeeded;
        toM      = fromM + sessMins;
      }
      if (sessMins < 15) continue;

      // Overlap check
      const occupied = occupiedByDate[s.date] || [];
      if (occupied.some(([oF, oT]) => fromM < oT && toM > oF)) continue;

      occupiedByDate[s.date] = [...occupied, [fromM, toM]];
      placedMinsById[s.id]   = placedSoFar + sessMins;

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

    // ── 13. Compute warnings + unscheduled ────────────────────────────────────
    const warnings    = [];
    const unscheduled = [...overdueUnscheduled];

    for (const meta of Object.values(assignmentMeta)) {
      const placedMins  = placedMinsById[meta.id] || 0;
      const placedHours = r4(placedMins / 60);
      const needed      = meta.remaining;

      if (placedHours >= needed) continue;

      if (placedHours === 0) {
        unscheduled.push({
          assignmentId: meta.id,
          title:        meta.title,
          reason:       'No available time slots',
        });
      } else {
        const removed = r4(needed - placedHours);
        warnings.push({
          assignmentId:   meta.id,
          title:          meta.title,
          scheduledHours: placedHours,
          neededHours:    needed,
          message:        `Fully scheduled (${removed}h removed — outside valid window or availability block)`,
        });
      }
    }

    // ── 14. Respond ───────────────────────────────────────────────────────────
    res.json({ sessions: finalSessions, warnings, unscheduled, weekStart: weekStartStr });

  } catch (err) {
    console.error('POST /planner/generate:', err.response?.data || err.message || err);
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
      { upsert: true, new: true },
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
