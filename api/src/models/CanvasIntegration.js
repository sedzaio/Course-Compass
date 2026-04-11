const mongoose = require('mongoose');

const canvasIntegrationSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  canvasUrl: { type: String, required: true },
  token:     { type: String, required: true },
  lastSync:  { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('CanvasIntegration', canvasIntegrationSchema);