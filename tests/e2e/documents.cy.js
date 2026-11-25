describe('Listagem de documentos', () => {
  // Nomes e ordem dos documentos de exemplo carregados pela aplicação.
  const documentos = [
    'Reunião de equipe.md',
    'Bem-vindo.md',
    'Lista de tarefas.md',
  ];

  beforeEach(() => {
    // Abre a aplicação antes de cada cenário; o frontend carrega a lista pela API.
    cy.visit('/');
  });

  it('deve exibir o painel com o título "Documentos"', () => {
    // Confirma que a área da lista e seu cabeçalho estão visíveis.
    cy.get('.documents-panel').should('be.visible');
    cy.get('.documents-panel .panel-heading h2').should('have.text', 'Documentos');
  });

  it('deve exibir o botão de criar documento', () => {
    // Além de estar visível, o botão deve manter texto e nomes acessíveis esperados.
    cy.get('#new-document')
      .should('be.visible')
      .and('have.text', '+')
      .and('have.attr', 'title', 'Criar documento')
      .and('have.attr', 'aria-label', 'Criar documento');
  });

  it('deve listar todos os documentos esperados', () => {
    // Primeiro valida a quantidade de itens exibidos na barra lateral.
    cy.get('#document-list .document-item').should('have.length', documentos.length);

    // Depois confere o texto e o atributo title de cada documento.
    documentos.forEach((nome, index) => {
      cy.get('#document-list .document-item')
        .eq(index)
        .should('have.text', nome)
        .and('have.attr', 'title', nome);
    });
  });

  it('deve exibir os documentos na ordem correta', () => {
    // Lê os títulos renderizados e compara a ordem visível com a esperada.
    cy.get('#document-list .document-item').then(($itens) => {
      const nomes = [...$itens].map((el) => el.textContent.trim());
      expect(nomes).to.deep.equal(documentos);
    });
  });

 
});