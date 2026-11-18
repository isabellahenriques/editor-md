const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  author: { type: String, required: true, trim: true, default: 'Anônimo' },
  text: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const commentSchema = new mongoose.Schema({
  selectedText: { type: String, required: true, trim: true },
  author: { type: String, required: true, trim: true, default: 'Anônimo' },
  createdAt: { type: Date, default: Date.now },
  text: { type: String, required: true, trim: true },
  resolved: { type: Boolean, default: false },
  replies: { type: [replySchema], default: [] }
}, { _id: true });

const versionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, default: '' },
  savedAt: { type: Date, default: Date.now }
}, { _id: true });

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'O título é obrigatório.'],
    trim: true,
    unique: true,
    minlength: [1, 'O título é obrigatório.']
  },
  content: { type: String, default: '' },
  comments: { type: [commentSchema], default: [] },
  versions: { type: [versionSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
