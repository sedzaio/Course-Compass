// api/src/routes/planner.js
'use strict';

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── Constants ───────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
const MIN_FLOORS = [60, 45, 30, 15];

// ─── Pure Helpers ─────────────────────────────────────────────────────────────────────

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function parseDate(str) {
  const d = new Date(str + 'T00:00:00.000Z');
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function getWeekStart(date, firstDay = 'sunday') {
  const d   = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day  = d.getUTCDay();
  const diff = firstDay === 'monday' ? (day === 0 ? -6 : 1 - day) : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function schedulingWindow(dueDate, advanceDays, bufferHours) {
  const due      = new Date(dueDate);
  const earliest = new Date(due.getTime() - advanceDays * 86_400_000);
  const latest   = new Date(due.getTime() - bufferHours *  3_600_000);
  if (earliest >= latest) return null;
  return { earliest, latest };
}

function toMins(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function fromMins(mins) {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function r4(n) { return Math.round(n * 4) / 4; }

async function upsertPlan(userId, weekStart, sessions, warnings, unscheduled) {
  const update = {
    $set: { sessions, warnings, unscheduled, generatedAt: new Date() },
    $setOnInsert: { userId, weekStart },
  };
  try {
    return await StudyPlan.findOneAndUpdate(
      { userId, weekStart },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    if (err.code === 11000) {
      return await StudyPlan.findOneAndUpdate(
        { userId, weekStart },
        { $set: { sessions, warnings, unscheduled, generatedAt: new Date() } },
        { new: true },
      );
    }
    throw err;
  }
}

// AI estimate helper — works for ANY assignment (manual or Canvas)
async function aiEstimate(title) {
  try {
    const gr = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model:       'llama-3.1-8b-instant',
        messages:    [{
          role:    'user',
          content: `Reply with ONE decimal number only — estimated total hours a student needs to complete: "${title || 'assignment'}"`,
        }],
        max_tokens:  8,
        temperature: 0.1,
      },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } },
    );
    const est = parseFloat(gr.data.choices[0].message.content.trim());
    if (!isNaN(est) && est > 0) return r4(Math.min(Math.max(est, 0.25), 24));
  } catch (_) { /* fall through */ }
  return null;
}

// ─── GET /planner/preferences ───────────────────────────────────────────────────────────

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

// ─── PUT /planner/preferences ───────────────────────────────────────────────────────────

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

// ─── POST /planner/generate ───────────────────────────────────────────────────────────────

router.post('/generate', auth, async (req, res) => {
  try {

    // ── 1. Load user settings ──────────────────────────────────────────────────────────
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

    // ── 2. Resolve target week ─────────────────────────────────────────────────────────
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const weekStart = req.body.weekStart
      ? parseDate(req.body.weekStart)
      : getWeekStart(today, firstDay);

    const weekStartStr = toDateStr(weekStart);
    const weekEnd      = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    const weekEndStr = toDateStr(weekEnd);

    const scheduleFrom    = weekStart > today ? weekStart : today;
    const scheduleFromStr = toDateStr(scheduleFrom);

    // ── 3. Fetch incomplete assignments ──────────────────────────────────────────────
    const allAssignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null },
    }).sort({ dueDate: 1 });

    // ── 4. Classify: overdue (always skip) vs. eligible ──────────────────────────────
    // An assignment is overdue when its latest scheduling time has already passed.
    // Overdue assignments are NEVER scheduled regardless of which week is requested.
    // They appear in the unscheduled list with a human-readable message.
    const overdueUnscheduled = [];
    const eligible           = [];

    for (const a of allAssignments) {
      const win = schedulingWindow(a.dueDate, advanceDays, bufferHours);
      // No valid window (buffer >= advance) — skip silently
      if (!win) continue;

      // Overdue: latest scheduling time is in the past
      if (win.latest <= today) {
        overdueUnscheduled.push({
          assignmentId: a._id,
          title:        a.title,
          reason:       `Deadline has passed — latest scheduling time was ${toDateStr(win.latest)}.`,
        });
        continue; // never schedule this in any week
      }

      // Does the scheduling window overlap this week at all?
      if (win.earliest > weekEnd || win.latest < weekStart) continue;
      eligible.push({ a, win });
    }

    if (!eligible.length) {
      const saved = await upsertPlan(req.userId, weekStartStr, [], [], overdueUnscheduled);
      return res.json({
        sessions:    saved.sessions    || [],
        warnings:    saved.warnings    || [],
        unscheduled: saved.unscheduled || [],
        weekStart:   weekStartStr,
      });
    }

    // ── 5. Count hours already placed in PREVIOUS weeks (skip skipped) ──────────
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

    // ── 6. Ensure ALL assignments have an estimated time ───────────────────────────
    // Applies to both manual and Canvas assignments with no estimate.
    // Falls back to 1h if the AI call fails.
    for (const { a } of eligible) {
      if (a.estimatedTime == null) {
        const est = await aiEstimate(a.title);
        if (est != null) {
          a.estimatedTime = est;
          a.aiGenerated   = true;
          await a.save();
        } else {
          a.estimatedTime = 1; // safe fallback — not persisted
        }
      }
    }

    // ── 7. Build assignmentMeta + aiTasks ─────────────────────────────────────────
    const assignmentMeta = {};
    const aiTasks        = [];

    for (const { a, win } of eligible) {
      const done      = doneHoursMap[a._id.toString()] || 0;
      const remaining = r4(Math.max((a.estimatedTime || 1) - done, 0));
      if (remaining <= 0) continue;

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

    if (!aiTasks.length) {
      const saved = await upsertPlan(req.userId, weekStartStr, [], [], overdueUnscheduled);
      return res.json({
        sessions:    saved.sessions    || [],
        warnings:    saved.warnings    || [],
        unscheduled: saved.unscheduled || [],
        weekStart:   weekStartStr,
      });
    }

    // ── 8. Build per-date slot map ─────────────────────────────────────────────────
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

    if (!Object.keys(dailySlots).length) {
      const saved = await upsertPlan(req.userId, weekStartStr, [], [], overdueUnscheduled);
      return res.json({
        sessions:    saved.sessions    || [],
        warnings:    saved.warnings    || [],
        unscheduled: saved.unscheduled || overdueUnscheduled,
        weekStart:   weekStartStr,
      });
    }

    // ── 9. AI prompt + call ───────────────────────────────────────────────────────────
    const totalAvailMins  = Object.values(dailySlots).flat().reduce((s, b) => s + toMins(b.to) - toMins(b.from), 0);
    const totalNeededMins = aiTasks.reduce((s, t) => s + Math.round(t.hours * 60), 0);

    const systemPrompt = `\
You are a deterministic study-session scheduler. Your ONLY output is a single JSON object.
DO NOT include markdown fences, comments, explanations, or any text outside the JSON.

╔════════════════════════════════════════════════════════
INPUT
╔════════════════════════════════════════════════════════
  "slots"  →  { "YYYY-MM-DD": [ { "from": "HH:mm", "to": "HH:mm" }, … ], … }
  "tasks"  →  [ { "id", "hours", "from", "to", "due" }, … ]
    id    : opaque string — copy exactly, never alter
    hours : TOTAL hours that MUST be scheduled across all sessions for this task
    from  : earliest DATE (inclusive) any session may be placed
    to    : latest DATE (inclusive) any session may be placed
    due   : assignment due date — for reference only

╔════════════════════════════════════════════════════════
STRICT RULES
╔════════════════════════════════════════════════════════
R1  SLOTS ONLY. Every session must start AND end within a single slot on that date.
R2  DATE WINDOW. session.date must satisfy: task.from ≤ date ≤ task.to.
R3  NO OVERLAP. Two sessions on the same date must NOT share any minute.
R4  EXACT HOURS. Sum of all session durations for a task MUST equal task.hours exactly.
    Duration in minutes = toMins(to) − toMins(from). Compute arithmetically.
R5  GREEDY FILL. Fill every available slot minute before leaving any task incomplete.
    Total available: ${totalAvailMins} min. Total needed: ${totalNeededMins} min.
    If available ≥ needed, ALL tasks must be fully scheduled.
R6  WHOLE TASK FIRST. Always attempt to fit the entire task in a single uninterrupted
    slot before considering any split.
R7  CONTIGUOUS SPLITS. If a task must be split, ALL parts must be placed back-to-back
    across consecutive availability blocks with NO other task's sessions inserted
    between them.
    - Part 1  → fills the TAIL of its block  (placed at the end of remaining free time)
    - Middle  → fills the ENTIRE free portion of the block
    - Last    → fills the HEAD of its block  (placed at the start of free time)
    Try first to find a chain of blocks that are completely free of other tasks.
    Only if no clean chain exists may you place parts around already-scheduled sessions.
R8  CASCADING MINIMUM. When splitting, the smallest part must respect a minimum floor.
    Try floors in order until the task can be fully scheduled:
      Floor 1: every part ≥ 60 min
      Floor 2: every part ≥ 45 min
      Floor 3: every part ≥ 30 min
      Floor 4: every part ≥ 15 min  (last resort)
    Use the fewest parts possible at each floor before trying a lower floor.
R9  ORDER IS FREE. Tasks may be scheduled in any order within their windows.
    No due-date ordering is required.

╔════════════════════════════════════════════════════════
SCHEDULING ALGORITHM (execute step by step)
╔════════════════════════════════════════════════════════
For each task:
  minutesNeeded = round(hours × 60)

  STEP A — Try whole task (no split):
    Scan slots in chronological order within [task.from … task.to].
    If any single contiguous free interval ≥ minutesNeeded exists → place it there. Done.

  STEP B — Try split with cascading floor:
    For minFloor in [60, 45, 30, 15]:
      Pass 1 (clean): find the earliest contiguous chain of blocks where the
        cumulative free minutes ≥ minutesNeeded and no other task occupies any
        minute between the first and last block of the chain.
      Pass 2 (mixed): if Pass 1 fails, find the earliest contiguous chain of
        blocks (free gaps only, other tasks may already occupy parts of blocks)
        where cumulative free gaps ≥ minutesNeeded.
      For each segment in the chosen chain:
        take = min(freeInThisBlock, stillNeeded)
        take must be ≥ minFloor (except the very last segment which absorbs remainder)
        If this segment would be < minFloor and is not the last → skip this floor, try next.
      If all segments satisfy the floor → place them. Done.

  STEP C — If still unplaced → omit from sessions (will appear in warnings/unscheduled).

╔════════════════════════════════════════════════════════
PLACEMENT WITHIN A BLOCK
╔════════════════════════════════════════════════════════
  Single session (whole task or last part): place at START of free interval.
  First part of a multi-part task: place at END of the block's free interval
    (i.e., from = freeEnd − take, to = freeEnd).
  Middle parts: fill the block's entire free interval.
  Last part: place at START of the block's free interval (from = freeStart, to = freeStart + take).

╔════════════════════════════════════════════════════════
OUTPUT (exact shape, NO extra keys, NO extra text)
╔════════════════════════════════════════════════════════
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
      console.warn('Groq call failed — using deterministic fallback:', groqErr.response?.data || groqErr.message);
    }

    // ── 10. Validate every AI session ─────────────────────────────────────────────────
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
      if (isNaN(fromM) || isNaN(toM) || toM <= fromM || toM - fromM < 15) continue;
      const blocks = availByDate[s.date];
      if (!blocks || !blocks.some(b => fromM >= b.fromMins && toM <= b.toMins)) continue;
      if (s.date === meta.schedTo && meta.latestEndMins > 0 && toM > meta.latestEndMins) continue;
      candidates.push({ id: s.id, date: s.date, fromM, toM, sessMins: toM - fromM });
    }

    candidates.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.fromM - b.fromM);

    // ── 11. Deterministic fallback ───────────────────────────────────────────────────────
    const aiMinutesById = {};
    for (const c of candidates) aiMinutesById[c.id] = (aiMinutesById[c.id] || 0) + c.sessMins;

    function buildBlockList(schedFrom, schedTo) {
      const result = [];
      const end    = parseDate(schedTo);
      for (let cur = parseDate(schedFrom); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
        const dateStr = toDateStr(cur);
        const blocks  = availByDate[dateStr];
        if (!blocks) continue;
        for (let bi = 0; bi < blocks.length; bi++) {
          result.push({ dateStr, bi, fromMins: blocks[bi].fromMins, toMins: blocks[bi].toMins });
        }
      }
      return result;
    }

    function getFreeIntervals(blockFrom, blockTo, occupied) {
      const sorted = occupied
        .filter(([f, t]) => f < blockTo && t > blockFrom)
        .sort((a, b) => a[0] - b[0]);
      let cursor = blockFrom;
      const free = [];
      for (const [oF, oT] of sorted) {
        if (cursor < oF) free.push([cursor, oF]);
        cursor = Math.max(cursor, oT);
      }
      if (cursor < blockTo) free.push([cursor, blockTo]);
      return free;
    }

    function tryPlaceContiguous(taskId, blockList, targetMins, minFloor, occupiedByDate, latestEndMins, schedTo, cleanPass) {
      for (let startIdx = 0; startIdx < blockList.length; startIdx++) {
        const chain     = [];
        let   collected = 0;

        for (let i = startIdx; i < blockList.length && collected < targetMins; i++) {
          const blk = blockList[i];
          const occ = (occupiedByDate[blk.dateStr] || []);

          if (cleanPass && i > startIdx) {
            const hasOther = occ.some(([f, t, tid]) => tid !== taskId && f < blk.toMins && t > blk.fromMins);
            if (hasOther) break;
          }

          const blockTo = (blk.dateStr === schedTo && latestEndMins > 0)
            ? Math.min(blk.toMins, latestEndMins)
            : blk.toMins;
          if (blockTo <= blk.fromMins) break;

          const freeIntervals = getFreeIntervals(blk.fromMins, blockTo, occ.map(([f, t]) => [f, t]));
          const blockFree     = freeIntervals.reduce((s, [f, t]) => s + t - f, 0);

          if (blockFree === 0) break;

          const take = Math.min(blockFree, targetMins - collected);
          chain.push({ blk, freeIntervals, take, blockFree, blockTo });
          collected += take;
        }

        if (collected < targetMins) continue;

        let valid = true;
        for (let ci = 0; ci < chain.length; ci++) {
          if (chain[ci].take < minFloor) { valid = false; break; }
        }
        if (!valid) continue;

        const sessions = [];
        const nParts   = chain.length;

        for (let ci = 0; ci < nParts; ci++) {
          const { blk, freeIntervals, take } = chain[ci];
          let fromM, toM;

          if (nParts === 1) {
            fromM = freeIntervals[0][0];
            toM   = fromM + take;
          } else if (ci === 0) {
            fromM = freeIntervals[freeIntervals.length - 1][1] - take;
            toM   = freeIntervals[freeIntervals.length - 1][1];
            if (fromM < freeIntervals[0][0]) fromM = freeIntervals[0][0];
          } else if (ci === nParts - 1) {
            fromM = freeIntervals[0][0];
            toM   = fromM + take;
          } else {
            fromM = freeIntervals[0][0];
            toM   = freeIntervals[freeIntervals.length - 1][1];
          }

          if (toM > fromM) {
            sessions.push({ id: taskId, date: blk.dateStr, fromM, toM, sessMins: toM - fromM });
          }
        }

        if (sessions.length > 0) return sessions;
      }

      return null;
    }

    const fallbackCandidates = [];
    const occupiedFallback   = {};
    for (const dateStr of Object.keys(dailySlots)) occupiedFallback[dateStr] = [];

    for (const c of candidates) {
      (occupiedFallback[c.date] = occupiedFallback[c.date] || []).push([c.fromM, c.toM, c.id]);
    }

    for (const task of aiTasks) {
      const meta        = assignmentMeta[task.id];
      const targetMins  = Math.round(meta.remaining * 60);
      const alreadyDone = aiMinutesById[task.id] || 0;
      const stillNeeded = targetMins - alreadyDone;
      if (stillNeeded <= 0) continue;

      const blockList = buildBlockList(meta.schedFrom, meta.schedTo);
      const floors    = [stillNeeded, ...MIN_FLOORS].filter((v, i, a) => v <= stillNeeded && a.indexOf(v) === i);

      let placed = false;
      for (const minFloor of floors) {
        let sessions = tryPlaceContiguous(task.id, blockList, stillNeeded, minFloor, occupiedFallback, meta.latestEndMins, meta.schedTo, true);
        if (!sessions)
          sessions = tryPlaceContiguous(task.id, blockList, stillNeeded, minFloor, occupiedFallback, meta.latestEndMins, meta.schedTo, false);

        if (sessions) {
          for (const s of sessions) {
            fallbackCandidates.push(s);
            (occupiedFallback[s.date] = occupiedFallback[s.date] || []).push([s.fromM, s.toM, s.id]);
          }
          placed = true;
          break;
        }
      }
    }

    const allCandidates = [...candidates, ...fallbackCandidates];
    allCandidates.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.fromM - b.fromM);

    // ── 12. Place sessions: dedup overlaps + cap to remaining ───────────────────────────
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
      if (sessMins > stillNeeded) { sessMins = stillNeeded; toM = fromM + sessMins; }
      if (sessMins < 15) continue;

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

    // ── 13. Compute warnings + unscheduled ─────────────────────────────────────────────
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
          reason:       'No available time this week — will be attempted in next week\'s plan.',
        });
      } else {
        const remaining = r4(needed - placedHours);
        warnings.push({
          assignmentId:   meta.id,
          title:          meta.title,
          scheduledHours: placedHours,
          neededHours:    needed,
          message:        `${placedHours}h scheduled this week — the remaining ${remaining}h will carry over to next week's plan.`,
        });
      }
    }

    // ── 14. Save plan to DB ──────────────────────────────────────────────────────────────
    const saved = await upsertPlan(req.userId, weekStartStr, finalSessions, warnings, unscheduled);

    // ── 15. Respond ───────────────────────────────────────────────────────────────────
    res.json({
      sessions:    saved.sessions    || finalSessions,
      warnings:    saved.warnings    || warnings,
      unscheduled: saved.unscheduled || unscheduled,
      weekStart:   weekStartStr,
    });

  } catch (err) {
    console.error('POST /planner/generate:', err.response?.data || err.message || err);
    res.status(500).json({ message: 'Failed to generate study plan', error: err.message });
  }
});

// ─── POST /planner/schedule ───────────────────────────────────────────────────────────────

router.post('/schedule', auth, async (req, res) => {
  try {
    const { weekStart, sessions, warnings, unscheduled } = req.body;
    if (!weekStart) return res.status(400).json({ message: 'weekStart is required' });

    const saved = await upsertPlan(
      req.userId, weekStart,
      sessions    || [],
      warnings    || [],
      unscheduled || [],
    );
    res.json(saved);
  } catch (err) {
    console.error('POST /planner/schedule:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── GET /planner/schedule ──────────────────────────────────────────────────────────────────

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

// ─── PATCH /planner/schedule/:sessionId ───────────────────────────────────────────────

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

    // ── Sync assignment completed state ────────────────────────────────────────────────────
    // When completed changes, check if ALL non-skipped sessions for this
    // assignment (across all weeks) are done. If so, mark the assignment
    // completed. If any session is un-completed, mark the assignment incomplete.
    if (completed !== undefined && session.assignmentId) {
      try {
        const assignmentId = session.assignmentId.toString();

        // Gather all plans that contain sessions for this assignment
        const allPlans = await StudyPlan.find({
          userId:   req.userId,
          'sessions.assignmentId': session.assignmentId,
        });

        const allSessions = allPlans.flatMap(p => p.sessions)
          .filter(s => s.assignmentId && s.assignmentId.toString() === assignmentId && !s.skipped);

        const allDone = allSessions.length > 0 && allSessions.every(s => s.completed);

        await Assignment.findOneAndUpdate(
          { _id: session.assignmentId, userId: req.userId },
          { completed: allDone },
          { new: true },
        );
      } catch (syncErr) {
        // Non-fatal: log but don't fail the request
        console.error('PATCH /planner/schedule sync assignment:', syncErr.message);
      }
    }

    res.json({ sessionId, completed: session.completed, skipped: session.skipped });
  } catch (err) {
    console.error('PATCH /planner/schedule:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
