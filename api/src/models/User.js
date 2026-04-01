const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:       { type: String, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String },
  isVerified: { type: Boolean, default: false },
  verifyCode: { type: String },

  // Canvas integration
  canvasToken:    { type: String, default: null },
  canvasUrl:      { type: String, default: null },
  canvasLastSync: { type: Date,   default: null }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);