const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const Document = require('./src/models/document');
const Draft = require('./src/models/draft');

const app = express();
const port = Number(process.env.PORT) || 3000;
const openApiPath = path.join(__dirname, 'openapi.yaml');

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (!req.is('application/json')) return res.status(415).json({ error: 'Envie o corpo no formato application/json.' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'O corpo da solicitação deve ser um objeto JSON.' });
  }
  return next();
});
app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'O corpo da solicitação excede o limite de 1 MB.' });
  if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
    return res.status(400).json({ error: 'O corpo da solicitação contém JSON inválido.' });
  }
  return next(error);
});
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'markdown-it', 'dist')));
app.use('/vendor/task-lists', express.static(path.join(__dirname, 'node_modules', 'markdown-it-task-lists', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

function isDuplicateKey(error) {
  return error && error.code === 11000;
}

function handleError(res, error) {
  if (isDuplicateKey(error)) {
    return res.status(409).json({ error: 'Já existe um documento com esse título.' });
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Erro interno ao processar a solicitação.' });
}

function validDocumentId(id) {
  return mongoose.isValidObjectId(id);
}

async function uniqueDefaultTitle() {
  const base = 'Sem título.md';
  if (!(await Document.exists({ title: base }))) return base;
  let suffix = 2;
  while (await Document.exists({ title: `Sem título (${suffix}).md` })) suffix += 1;
  return `Sem título (${suffix}).md`;
}

app.get('/api/documents', async (req, res) => {
  try {
    const documents = await Document.find({}, 'title updatedAt').sort({ updatedAt: -1, title: 1 }).lean();
    res.json(documents);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/documents', async (req, res) => {
  if (req.body.title !== undefined && typeof req.body.title !== 'string') {
    return res.status(400).json({ error: 'O título deve ser texto.' });
  }
  if (req.body.content !== undefined && typeof req.body.content !== 'string') {
    return res.status(400).json({ error: 'O conteúdo do documento deve ser texto.' });
  }
  try {
    const title = req.body.title === undefined ? await uniqueDefaultTitle() : req.body.title.trim();
    const content = typeof req.body.content === 'string' ? req.body.content : '';
    const document = await Document.create({
      title,
      content,
      versions: [{ title, content, savedAt: new Date() }]
    });
    await Draft.deleteOne({ _id: 'shared-draft' });
    res.status(201).json(document);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/documents/:id', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json(document);
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/documents/:id', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  if (typeof req.body.content !== 'string') {
    return res.status(400).json({ error: 'O conteúdo do documento deve ser texto.' });
  }
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });

    const title = req.body.title === undefined ? document.title : req.body.title.trim();
    document.title = title;
    document.content = req.body.content;
    document.versions.push({ title, content: req.body.content, savedAt: new Date() });
    document.versions = document.versions.slice(-3);
    await document.save();
    await Draft.deleteOne({ _id: 'shared-draft' });
    res.json(document);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/documents/:id/title', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  if (typeof req.body.title !== 'string') return res.status(400).json({ error: 'O título é obrigatório.' });
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
    document.title = req.body.title.trim();
    await document.save();
    res.json(document);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/documents/:id', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  try {
    const result = await Document.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/documents/:id/comments', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
    const author = typeof req.body.author === 'string' && req.body.author.trim() ? req.body.author.trim() : 'Anônimo';
    const comment = {
      selectedText: req.body.selectedText,
      author,
      text: req.body.text,
      resolved: false
    };
    document.comments.push(comment);
    await document.save();
    res.status(201).json(document.comments[document.comments.length - 1]);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/documents/:id/comments/:commentId/replies', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
    const comment = document.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });
    comment.replies.push({
      author: typeof req.body.author === 'string' && req.body.author.trim() ? req.body.author.trim() : 'Anônimo',
      text: req.body.text
    });
    await document.save();
    res.status(201).json(comment.replies[comment.replies.length - 1]);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/documents/:id/comments/:commentId', async (req, res) => {
  if (!validDocumentId(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
  if (typeof req.body.resolved !== 'boolean') return res.status(400).json({ error: 'Informe o estado do comentário.' });
  try {
    const document = await Document.findById(req.params.id);
    if (!document) return res.status(404).json({ error: 'Documento não encontrado.' });
    const comment = document.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });
    comment.resolved = req.body.resolved;
    await document.save();
    res.json(comment);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/draft', async (req, res) => {
  try {
    const draft = await Draft.findById('shared-draft').lean();
    if (!draft || !draft.content.trim()) return res.json(null);
    res.json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/draft', async (req, res) => {
  if (typeof req.body.content !== 'string') {
    return res.status(400).json({ error: 'O conteúdo do rascunho deve ser texto.' });
  }
  if (req.body.documentId !== undefined && req.body.documentId !== null && typeof req.body.documentId !== 'string') {
    return res.status(400).json({ error: 'O identificador do documento deve ser texto.' });
  }
  try {
    if (!req.body.content.trim()) {
      await Draft.deleteOne({ _id: 'shared-draft' });
      return res.status(204).end();
    }
    const draft = await Draft.findOneAndUpdate(
      { _id: 'shared-draft' },
      {
        title: req.body.title || 'Sem título.md',
        content: req.body.content,
        documentId: req.body.documentId || null
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json(draft);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/draft', async (req, res) => {
  try {
    await Draft.deleteOne({ _id: 'shared-draft' });
    res.status(204).end();
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/openapi.yaml', (req, res) => {
  res.type('application/yaml').sendFile(openApiPath, (error) => {
    if (error && !res.headersSent) handleError(res, error);
  });
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(YAML.parse(fs.readFileSync(openApiPath, 'utf8'))));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function seedExamples() {
  if (await Document.exists()) return;
  await Document.create([
    {
      title: 'Bem-vindo.md',
      content: '# Bem-vindo ao Editor Markdown\n\nEste é um documento simples para começar a escrever.\n\nUse a barra de ferramentas para formatar o texto.',
      versions: []
    },
    {
      title: 'Reunião de equipe.md',
      content: '# Reunião de equipe\n\nA equipe apresentou os resultados do trimestre e definiu as próximas prioridades.\n\n## Decisões\n\n- Publicar o novo site em maio\n- Revisar o planejamento na próxima semana',
      comments: [{
        selectedText: 'resultados do trimestre',
        author: 'Marina',
        text: 'Podemos incluir o link para o relatório final aqui?',
        resolved: false,
        replies: [{ author: 'Rafael', text: 'Sim, vou adicionar assim que estiver publicado.' }]
      }],
      versions: []
    },
    {
      title: 'Lista de tarefas.md',
      content: '# Lista de tarefas\n\n- [x] Definir o escopo do projeto\n- [ ] Criar os primeiros rascunhos\n- [ ] Revisar o conteúdo\n- [ ] Compartilhar com a equipe',
      versions: []
    }
  ]);
}

async function start() {
  const memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
  await Document.init();
  await seedExamples();
  app.listen(port, () => {
    console.log(`Editor Markdown disponível em http://localhost:${port}`);
  });
}

if (require.main === module) {
 start().catch((error) => {
   console.error('Não foi possível iniciar o servidor:', error);
   process.exitCode = 1;
 });
}

module.exports = { app };
