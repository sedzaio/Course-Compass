const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const auth = require('../middleware/auth');

// Get all courses
router.get('/', auth, async (req, res) => {
  try {
    const courses = await Course.find({ userId: req.userId });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a course
router.post('/', auth, async (req, res) => {
  try {
    const course = new Course({ userId: req.userId, ...req.body });
    await course.save();
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a course
router.put('/:id', auth, async (req, res) => {
  try {
    const course = await Course.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { returnDocument: 'after' }
    );
    res.json(course);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a course
router.delete('/:id', auth, async (req, res) => {
  try {
    await Course.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ message: 'Course deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
