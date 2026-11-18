const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  _id: { type: String, default: 'shared-draft' },
  title: { type: String, default: 'Sem título.md' },
  content: { type: String, required: true },
  documentId: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Draft', draftSchema);
