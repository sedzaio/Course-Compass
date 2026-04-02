// api/src/models/Assignment.js
const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  dueDate: {
    type: Date,
    default: null
  },
  completed: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    enum: ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'],
    default: 'assignment'
  },
  estimatedTime: {
    type: Number, 
    default: null
  },
  canvasId: {
    type: String,
    default: null
  },
  source: {
    type: String,
    enum: ['manual', 'canvas'],
    default: 'manual'
  }
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);