const mongoose = require('mongoose');

const canvasIntegrationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  canvasUrl: { type: String, required: true },
  token: { type: String, required: true },
  expiration: { type: Date },
  lastSync: { type: Date }
});

module.exports = mongoose.model('CanvasIntegration', canvasIntegrationSchema);
