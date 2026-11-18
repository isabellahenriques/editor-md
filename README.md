# Editor Markdown

## O que é esta aplicação

Um editor colaborativo simples de documentos Markdown. O site e a API são públicos, sem login ou contas; todos os visitantes compartilham os mesmos documentos e o mesmo rascunho enquanto a aplicação está em execução.

## Como instalar

Requisitos: Node.js 20 ou superior e npm.

```bash
npm install
```

Na primeira inicialização, `mongodb-memory-server` baixa o binário do MongoDB compatível com o sistema operacional, caso ele ainda não esteja disponível localmente.

## Como executar

```bash
npm start
```

Em desenvolvimento, com reinicialização automática:

```bash
npm run dev
```

O servidor usa a porta `3000` por padrão. Para escolher outra porta, defina a variável de ambiente `PORT`.

## Dados de teste incluídos

Na primeira execução de cada processo, a base em memória é preenchida com três documentos:

- **Bem-vindo.md**: texto introdutório simples.
- **Reunião de equipe.md**: notas de reunião com um comentário e uma resposta.
- **Lista de tarefas.md**: checklist com tarefas concluídas e pendentes.

Os dados ficam em memória e são recriados quando o servidor reinicia. Eles não são persistidos entre execuções.

## Regras de negócio

- Título obrigatório e exclusivo. Um novo documento recebe `Sem título.md`; se esse nome já existir, a aplicação escolhe o próximo título livre, por exemplo `Sem título (2).md`.
- Comentários guardam trecho selecionado, autor, data, texto, estado e respostas. Resolver não apaga o comentário: ele permanece visível e pode ser reaberto.
- Cada salvamento de documento cria uma versão; apenas as três versões mais recentes são mantidas.
- Existe um rascunho compartilhado. A interface só oferece a recuperação quando há conteúdo; salvar um documento ou descartar o rascunho remove esse rascunho.
- Como não há autenticação, documentos, comentários e rascunho são acessíveis e editáveis por qualquer visitante.

## URLs importantes

- Aplicação: [http://localhost:3000](http://localhost:3000)
- API de documentos: [http://localhost:3000/api/documents](http://localhost:3000/api/documents)
- Rascunho: [http://localhost:3000/api/draft](http://localhost:3000/api/draft)
- Especificação OpenAPI em YAML: [http://localhost:3000/api/openapi.yaml](http://localhost:3000/api/openapi.yaml)
- Documentação interativa Swagger: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Recursos do editor

Criação, listagem, abertura, edição, renomeação e exclusão de documentos; abrir e salvar Markdown; exportar para Word ou PDF; estilos de parágrafo, títulos, citação e código; negrito, itálico, sublinhado, riscado e grifo; listas com marcadores, numeradas e de tarefas; comentários em seleções com respostas e resolução; código em linha; linha horizontal; localizar; alternância entre Markdown e visualização formatada.
