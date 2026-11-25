import { after, before, beforeEach, describe, it } from 'mocha';
import { expect } from 'chai';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import supertest from 'supertest';
import appModule from '../../../server.js';
import documentModel from '../../../src/models/document.js';
import fixtures from './fixtures/documents.js';

const { app } = appModule;
const Document = documentModel;
// Supertest envia requisições ao Express sem precisar abrir uma porta local.
const request = supertest(app);

let mongoServer;

describe('GET /api/documents', function () {
  before(async function () {
    // O banco temporário mantém o teste independente de uma instância externa.
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    // Aguarda a criação do índice único de título antes de inserir as fixtures.
    await Document.init();
  });

  beforeEach(async function () {
    // Limpa qualquer dado anterior e recarrega as fixtures para repetir o cenário.
    await Document.deleteMany({});
    await Document.insertMany(fixtures);
  });

  after(async function () {
    // Remove os dados e fecha a conexão e o banco temporário ao final da suíte.
    await Document.deleteMany({});
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('mostra os documentos mais recentes primeiro e desempata pelo título', async function () {
    // Faz uma chamada funcional à rota real, incluindo a leitura do banco.
    const response = await request.get('/api/documents');

    // Exibe o body retornado para facilitar a conferência no terminal.
    console.log('Body da resposta:', response.body);

    // Confirma que a rota respondeu com sucesso antes de validar o conteúdo.
    expect(response.status).to.equal(200);
    // Confirma que o body contém a lista completa de documentos cadastrados.
    expect(response.body).to.be.an('array').with.lengthOf(fixtures.length);
    const titles = response.body.map((document) => document.title);
    // Os dois documentos recentes empatam na data e são ordenados pelo título.
    expect(titles).to.deep.equal([
      'Lista de tarefas.md',
      'Reunião de equipe.md',
      'Bem-vindo.md'
    ]);

    // A rota de listagem retorna somente os campos necessários para a lista.
    for (const document of response.body) {
      expect(document).to.have.all.keys('_id', 'title', 'updatedAt');
    }
  });
});
