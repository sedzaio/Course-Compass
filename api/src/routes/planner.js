const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const auth       = require('../middleware/auth');
const User       = require('../models/User');
const Assignment = require('../models/Assignment');
const StudyPlan  = require('../models/StudyPlan');

// ─── helpers ──────────────────────────────────────────────────────────────────

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function toTimeStr(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// returns "2026-04-06" for a Date object
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

// get monday of the week containing `date`
function getWeekStart(date, firstDay = 'sunday') {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = firstDay === 'monday'
    ? (day === 0 ? -6 : 1 - day)
    : -day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

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
      if (isNaN(b) || b < 1)
        return res.status(400).json({ message: 'Buffer must be at least 1 hour.' });
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

// ─── POST /planner/generate ───────────────────────────────────────────────────
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

    if (!availability.length)
      return res.status(400).json({ message: 'No availability set. Please configure your study planner settings.' });

    // ── build the two-week window (today → today+13) ──────────────────────────
    const today     = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setUTCDate(today.getUTCDate() + 13);

    const weekStart    = getWeekStart(today, firstDay);
    const weekStartStr = toDateStr(weekStart);

    // ── build day slots map: dateStr → [ { from, to, remainingMins } ] ────────
    const daySlots = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() + i);
      const dateStr = toDateStr(d);
      const dayName = DAY_NAMES[d.getUTCDay()];
      const blocks  = availability.filter(b => b.day === dayName);
      if (blocks.length) {
        daySlots[dateStr] = blocks.map(b => ({
          from:          toMinutes(b.from),
          to:            toMinutes(b.to),
          remainingMins: toMinutes(b.to) - toMinutes(b.from),
          cursor:        toMinutes(b.from),
        }));
      }
    }

    // ── fetch assignments ──────────────────────────────────────────────────────
    const assignments = await Assignment.find({
      userId:    req.userId,
      completed: false,
      dueDate:   { $ne: null, $gte: today },
    }).sort({ dueDate: 1 });

    // ── AI estimate for canvas assignments with no estimatedTime ──────────────
    for (const a of assignments) {
      if (a.estimatedTime == null && a.source === 'canvas') {
        try {
          const title       = a.title || 'Untitled';
          const description = a.description ? a.description.slice(0, 600) : 'No description provided';
          const prompt =
            `You are estimating study time for a college student.\n` +
            `Reply with ONLY a single positive decimal number representing hours needed.\n` +
            `Round to nearest quarter hour (0.25, 0.5, 0.75, 1, 1.25 ... 6).\n` +
            `No text, units, or explanation — just the number.\n\n` +
            `Title: ${title}\nDescription: ${description}`;

          const groqRes = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            { model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 10, temperature: 0.1 },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
          );
          const parsed = parseFloat(groqRes.data.choices[0].message.content.trim());
          if (!isNaN(parsed) && parsed > 0) {
            const snapped = Math.round(Math.min(Math.max(parsed, 0.25), 24) * 4) / 4;
            a.estimatedTime = snapped;
            a.aiGenerated   = true;
            await a.save();
          }
        } catch (_) { /* silent — fall through to default */ }
      }
      // manual with no estimate → default 1 hr
      if (a.estimatedTime == null) a.estimatedTime = 1;
    }

    // ── schedule ───────────────────────────────────────────────────────────────
    const sessions    = [];
    const warnings    = [];
    const unscheduled = [];

    for (const a of assignments) {
      const dueDate    = new Date(a.dueDate);
      const cutoffTime = new Date(dueDate.getTime() - bufferHours * 60 * 60 * 1000);
      let   remaining  = Math.round(a.estimatedTime * 60); // in minutes
      let   scheduled  = 0;
      const maxSessMins = maxSessHours ? maxSessHours * 60 : Infinity;

      // check if cutoff already passed
      if (cutoffTime <= today) {
        unscheduled.push({ assignmentId: a._id, title: a.title, reason: `Due too soon — buffer cutoff already passed` });
        continue;
      }

      const sortedDates = Object.keys(daySlots).sort();

      for (const dateStr of sortedDates) {
        if (remaining <= 0) break;

        // don't schedule past cutoff day
        const slotDate = new Date(dateStr + 'T00:00:00Z');
        if (slotDate >= cutoffTime) break;

        const blocks = daySlots[dateStr];

        for (const block of blocks) {
          if (remaining <= 0) break;
          if (block.remainingMins <= 0) continue;

          // add break gap if block has been partially used
          const gapMins = block.cursor > block.from ? breakMins : 0;
          const available = block.remainingMins - gapMins;
          if (available <= 0) continue;

          const chunkMins = Math.min(remaining, available, maxSessMins);
          if (chunkMins <= 0) continue;

          const sessionFrom = block.cursor + (block.cursor > block.from ? breakMins : 0);
          const sessionTo   = sessionFrom + chunkMins;

          sessions.push({
            assignmentId: a._id,
            title:        a.title,
            courseId:     a.courseId || null,
            date:         dateStr,
            from:         toTimeStr(sessionFrom),
            to:           toTimeStr(sessionTo),
            hours:        chunkMins / 60,
            completed:    false,
            skipped:      false,
          });

          block.cursor        = sessionTo;
          block.remainingMins = block.to - block.cursor;
          scheduled  += chunkMins;
          remaining  -= chunkMins;
        }
      }

      if (remaining > 0) {
        warnings.push({
          assignmentId:   a._id,
          title:          a.title,
          scheduledHours: scheduled / 60,
          neededHours:    a.estimatedTime,
          message:        `${(remaining / 60).toFixed(2)} hr(s) couldn't be scheduled — not enough availability before buffer cutoff`,
        });
      }
    }

    res.json({ sessions, warnings, unscheduled, weekStart: weekStartStr });
  } catch (err) {
    console.error('POST /planner/generate error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── POST /planner/schedule — save generated plan ─────────────────────────────
router.post('/schedule', auth, async (req, res) => {
  try {
    const { weekStart, sessions, warnings, unscheduled } = req.body;
    if (!weekStart) return res.status(400).json({ message: 'weekStart is required' });

    // upsert — regenerate replaces existing plan for the same week
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