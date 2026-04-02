// api/src/routes/assignments.js
const express    = require('express');
const router     = express.Router();
const Assignment = require('../models/Assignment');
const auth       = require('../middleware/auth');

// GET /api/assignments  — all for current user, course populated
router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment
      .find({ userId: req.userId })
      .populate('courseId', 'name color')
      .sort({ dueDate: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/assignments/course/:courseId
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const assignments = await Assignment
      .find({ userId: req.userId, courseId: req.params.courseId })
      .populate('courseId', 'name color')
      .sort({ dueDate: 1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/assignments
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
      completed:     false,
      source:        'manual'
    });
    await assignment.save();
    await assignment.populate('courseId', 'name color');
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/assignments/:id
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
    }

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true }
    ).populate('courseId', 'name color');

    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /api/assignments/:id
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

module.exports = router;