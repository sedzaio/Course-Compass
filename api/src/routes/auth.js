const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const auth = require('../middleware/auth');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  tls: { rejectUnauthorized: false }
});

const genCode = () => Math.floor(100000 + Math.random() * 900000).toString();

// POST /api/auth/send-code  { email }
router.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser.isVerified && existingUser.name) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const code = genCode();
    await User.findOneAndUpdate(
      { email },
      { verifyCode: code, isVerified: false },
      { upsert: true, returnDocument: 'after' }
    );
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Course Compass - Verification Code',
      html: `<h2>Your code: <strong>${code}</strong></h2>`
    });
    res.json({ message: 'Code sent to email.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/verify-code  { email, code }
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Email not found' });
    if (user.verifyCode !== code) return res.status(400).json({ message: 'Invalid code' });
    user.isVerified = true;
    user.verifyCode = undefined;
    await user.save();
    res.json({ message: 'Email verified.', verified: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/register  { name, email, password }
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.status(400).json({ message: 'Please verify your email first' });
    if (user.name) return res.status(400).json({ message: 'Email already registered' });
    user.name = name;
    user.password = await bcrypt.hash(password, 10);
    await user.save();
    res.status(201).json({ message: 'Registration complete. You can now log in.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) return res.status(401).json({ message: 'Invalid credentials or unverified email' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, studyPreferences: user.studyPreferences }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/forgot-password  { email }
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    const code = genCode();
    user.verifyCode = code;
    await user.save();
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Course Compass - Password Reset Code',
      html: `<h2>Your reset code: <strong>${code}</strong></h2>`
    });
    res.json({ message: 'Reset code sent to email.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/auth/reset-password  { email, code, newPassword }
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.verifyCode !== code) return res.status(400).json({ message: 'Invalid code' });
    user.password = await bcrypt.hash(newPassword, 10);
    user.verifyCode = undefined;
    await user.save();
    res.json({ message: 'Password reset successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT /api/auth/account  { name?, newPassword? }
router.put('/account', auth, async (req, res) => {
  try {
    const { name, newPassword } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (name && name.trim()) user.name = name.trim();
    if (newPassword && newPassword.length >= 6) {
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json({ message: 'Account updated.', user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;