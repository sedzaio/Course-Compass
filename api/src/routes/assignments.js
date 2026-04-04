const express              = require('express');
const router               = express.Router();
const Assignment           = require('../models/Assignment');
const auth                 = require('../middleware/auth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Helper: snap raw hours to nearest quarter (0, 0.25, 0.5, 0.75) ──────────
function snapToQuarter(hours) {
  // Minimum 0.25h (15 min), maximum 24h
  const clamped = Math.min(Math.max(hours, 0.25), 24);
  return Math.round(clamped * 4) / 4;
}

// ─── GET /api/assignments ─────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment
      .find({ userId: req.userId })
      .populate('courseId', '_id title code color')
      .sort({ dueDate: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── GET /api/assignments/course/:courseId ────────────────────────────────────
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const assignments = await Assignment
      .find({ userId: req.userId, courseId: req.params.courseId })
      .populate('courseId', '_id title code color')
      .sort({ dueDate: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/assignments ────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { courseId, title, description, dueDate, type, estimatedTime } = req.body;
    const assignment = new Assignment({
      userId:        req.userId,
      courseId:      courseId || null,
      title,
      description:   description || '',
      dueDate:       dueDate || null,
      type:          type || 'assignment',
      estimatedTime: estimatedTime != null ? Number(estimatedTime) : null,
      aiGenerated:   false,
      completed:     false,
      source:        'manual'
    });
    await assignment.save();
    await assignment.populate('courseId', '_id title code color');
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── PUT /api/assignments/:id ─────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const allowed = ['title', 'description', 'dueDate', 'courseId',
                     'type', 'estimatedTime', 'completed'];
    const update = {};
    allowed.forEach(k => {
      if (k in req.body) update[k] = req.body[k];
    });
    if ('courseId' in update && !update.courseId) update.courseId = null;
    if ('estimatedTime' in update) {
      update.estimatedTime = update.estimatedTime != null
        ? Number(update.estimatedTime) : null;
      // Manual edit clears the AI flag
      update.aiGenerated = false;
    }

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true }
    ).populate('courseId', '_id title code color');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ─── DELETE /api/assignments/:id ──────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Assignment.findOneAndDelete({
      _id: req.params.id, userId: req.userId
    });
    if (!deleted) return res.status(404).json({ message: 'Assignment not found' });
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ─── POST /api/assignments/:id/estimate ──────────────────────────────────────
// Calls Gemini to estimate completion time for one assignment.
// Returns estimatedTime snapped to nearest 0.25h and aiGenerated: true.
router.post('/:id/estimate', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      userId: req.userId
    });
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    const title       = assignment.title || 'Untitled';
    const type        = assignment.type  || 'assignment';
    const description = assignment.description
      ? assignment.description.slice(0, 600)
      : 'No description provided';

    const prompt =
      `You are estimating study time for a college student.\n` +
      `Given the assignment below, reply with ONLY a single positive decimal number representing hours needed.\n` +
      `Round to the nearest quarter hour (e.g. 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3).\n` +
      `Do not include any text, units, or explanation — just the number.\n\n` +
      `Title: ${title}\n` +
      `Type: ${type}\n` +
      `Description: ${description}`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();
    const parsed = parseFloat(raw);

    if (isNaN(parsed) || parsed <= 0) {
      return res.status(422).json({
        message: 'AI returned an unreadable estimate.',
        raw
      });
    }

    const estimatedTime = snapToQuarter(parsed);

    assignment.estimatedTime = estimatedTime;
    assignment.aiGenerated   = true;
    await assignment.save();

    res.json({ _id: assignment._id, estimatedTime, aiGenerated: true });
  } catch (err) {
    console.error('[estimate]', err.message);
    res.status(500).json({ message: 'Estimation failed', error: err.message });
  }
});

module.exports = router;