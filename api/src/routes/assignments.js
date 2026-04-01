const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');

// Get all assignments
router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ userId: req.userId });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get assignments by course
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ userId: req.userId, courseId: req.params.courseId });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create an assignment
router.post('/', auth, async (req, res) => {
  try {
    const { courseId, ...rest } = req.body;
    const assignment = new Assignment({
      userId: req.userId,
      courseId: courseId || null,
      ...rest
    });
    await assignment.save();
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update an assignment
router.put('/:id', auth, async (req, res) => {
  try {
    const update = { ...req.body };
    if ('courseId' in update && !update.courseId) update.courseId = null;

    const assignment = await Assignment.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      update,
      { new: true }
    );
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete an assignment
router.delete('/:id', auth, async (req, res) => {
  try {
    const deleted = await Assignment.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) return res.status(404).json({ message: 'Assignment not found' });
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;