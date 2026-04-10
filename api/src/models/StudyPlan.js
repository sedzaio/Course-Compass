// api/src/models/StudyPlan.js
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
  title:        { type: String, required: true },
  courseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  date:         { type: String, required: true },
  from:         { type: String, required: true },
  to:           { type: String, required: true },
  hours:        { type: Number, required: true },
  completed:    { type: Boolean, default: false },
  skipped:      { type: Boolean, default: false },
}, { _id: true });

const warningSchema = new mongoose.Schema({
  assignmentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
  title:          { type: String },
  scheduledHours: { type: Number },
  neededHours:    { type: Number },
  message:        { type: String },
}, { _id: false });

const unscheduledSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment' },
  title:        { type: String },
  reason:       { type: String },
  // 'critical' = window trapped this week, must fix availability now
  // 'soft'     = window extends beyond this week, can try another week
  severity:     { type: String, enum: ['critical', 'soft'], default: 'soft' },
}, { _id: false });

const studyPlanSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weekStart:   { type: String, required: true },
  generatedAt: { type: Date, default: Date.now },
  sessions:    [sessionSchema],
  warnings:    [warningSchema],
  unscheduled: [unscheduledSchema],
}, { timestamps: true });

// one plan per user per week — regenerate replaces it
studyPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('StudyPlan', studyPlanSchema, 'studyplan');
