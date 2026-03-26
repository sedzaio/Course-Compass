const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String },
  isVerified: { type: Boolean, default: false },
  verifyCode: { type: String }
});

module.exports = mongoose.model('User', userSchema);