const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  canvasId:  { type: String, default: null },
  title:     { type: String, required: true },
  code:      { type: String },
  instructor: { type: String },
  color:     { type: String, default: '#81A6C6' },
  semester:  { type: String },
  isActive:  { type: Boolean, default: true }
});

module.exports = mongoose.model('Course', courseSchema);