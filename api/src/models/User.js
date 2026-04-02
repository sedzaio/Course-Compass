const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:       { type: String, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String },
  isVerified: { type: Boolean, default: false },
  verifyCode: { type: String },

  // Canvas integration
  canvasToken:         { type: String, default: null },
  canvasUrl:           { type: String, default: null },
  canvasLastSync:      { type: Date,   default: null },
  canvasSyncFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
  canvasNextSync:      { type: Date,   default: null },

  // User preferences
  preferences: {
    firstDayOfWeek: { type: String, enum: ['sunday', 'monday'], default: 'sunday' },
    theme:          { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
  }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);