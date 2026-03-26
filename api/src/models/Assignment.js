const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String },
  dueDate: { type: Date },
  status: { type: String, default: 'todo' },
  priority: { type: Number, default: 0 }
});

module.exports = mongoose.model('Assignment', assignmentSchema);
