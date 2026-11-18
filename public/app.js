(() => {
  const editor = document.querySelector('#editor');
  const markdownSource = document.querySelector('#markdown-source');
  const documentList = document.querySelector('#document-list');
  const currentTitle = document.querySelector('#current-title');
  const status = document.querySelector('#save-status');
  const commentsList = document.querySelector('#comments-list');
  const commentDialog = document.querySelector('#comment-dialog');
  const commentForm = document.querySelector('#comment-form');
  const toast = document.querySelector('#toast');
  const md = window.markdownit({ html: false, linkify: true, breaks: false }).use(window.markdownitTaskLists, { enabled: true });

  md.inline.ruler.before('emphasis', 'highlight', (state, silent) => {
    const match = state.src.slice(state.pos).match(/^(==|\+\+)(.+?)\1/);
    if (!match) return false;
    if (!silent) {
      state.push(match[1] === '==' ? 'mark_open' : 'underline_open', match[1] === '==' ? 'mark' : 'u', 1);
      const text = state.push('text', '', 0);
      text.content = match[2];
      state.push(match[1] === '==' ? 'mark_close' : 'underline_close', match[1] === '==' ? 'mark' : 'u', -1);
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.mark_open = () => '<mark>';
  md.renderer.rules.mark_close = () => '</mark>';
  md.renderer.rules.underline_open = () => '<u>';
  md.renderer.rules.underline_close = () => '</u>';

  let activeDocument = null;
  let isMarkdownView = false;
  let draftTimer;
  let toastTimer;
  let selectedTextForComment = '';

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    if (!response.ok) {
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      throw new Error(data?.error || `A solicitação falhou (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function getContent() {
    return isMarkdownView ? markdownSource.value : htmlToMarkdown(editor);
  }

  function htmlToMarkdown(root) {
    function inline(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\u00a0/g, ' ');
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const children = [...node.childNodes].map(inline).join('');
      switch (node.tagName) {
        case 'STRONG': case 'B': return `**${children}**`;
        case 'EM': case 'I': return `*${children}*`;
        case 'U': return `++${children}++`;
        case 'S': case 'DEL': case 'STRIKE': return `~~${children}~~`;
        case 'MARK': return `==${children}==`;
        case 'CODE': return node.parentElement?.tagName === 'PRE' ? children : `\`${children}\``;
        case 'A': return `[${children}](${node.getAttribute('href') || ''})`;
        case 'BR': return '  \n';
        default: return children;
      }
    }
    function block(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.trim() ? node.nodeValue : '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName;
      if (/^H[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}\n\n`;
      if (tag === 'P' || tag === 'DIV') return `${inline(node).trim()}\n\n`;
      if (tag === 'BLOCKQUOTE') return `${inline(node).trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      if (tag === 'PRE') return `\`\`\`\n${node.innerText.replace(/\n$/, '')}\n\`\`\`\n\n`;
      if (tag === 'HR') return '---\n\n';
      if (tag === 'UL' || tag === 'OL') {
        const items = [...node.children].filter((child) => child.tagName === 'LI');
        return items.map((item, index) => {
          const checkbox = item.querySelector(':scope > input[type="checkbox"]');
          const prefix = checkbox ? `- [${checkbox.checked ? 'x' : ' '}] ` : tag === 'OL' ? `${index + 1}. ` : '- ';
          const text = [...item.childNodes].filter((child) => child.tagName !== 'UL' && child.tagName !== 'OL')
            .map(inline).join('').trim();
          const nested = [...item.children].filter((child) => child.tagName === 'UL' || child.tagName === 'OL')
            .map(block).join('').trimEnd();
          return `${prefix}${text}${nested ? `\n${nested.split('\n').map((line) => `  ${line}`).join('\n')}` : ''}`;
        }).join('\n') + '\n\n';
      }
      return [...node.childNodes].map(block).join('');
    }
    return [...root.childNodes].map(block).join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  function renderDocument(document) {
    activeDocument = document;
    currentTitle.textContent = document?.title || 'Novo documento';
    const content = document?.content || '';
    markdownSource.value = content;
    editor.innerHTML = md.render(content);
    renderDocumentList();
    renderComments(document?.comments || []);
    setStatus(document?._id ? 'Todas as alterações salvas' : 'Rascunho local');
  }

  async function renderDocumentList() {
    try {
      const documents = await api('/api/documents');
      documentList.replaceChildren();
      documents.forEach((item) => {
        const button = document.createElement('button');
        button.className = `document-item${activeDocument?._id === item._id ? ' active' : ''}`;
        button.title = item.title;
        button.textContent = item.title;
        button.addEventListener('click', () => openDocument(item._id));
        documentList.append(button);
      });
    } catch (error) {
      notify(error.message);
    }
  }

  async function openDocument(id) {
    try {
      renderDocument(await api(`/api/documents/${id}`));
    } catch (error) {
      notify(error.message);
    }
  }

  function renderComments(comments) {
    commentsList.replaceChildren();
    document.querySelector('#comment-count').textContent = comments.length;
    if (!comments.length) {
      const empty = document.createElement('div');
      empty.className = 'comments-empty';
      empty.textContent = 'Nenhum comentário por aqui. Selecione um trecho para iniciar uma conversa.';
      commentsList.append(empty);
      return;
    }
    comments.forEach((comment) => {
      const card = document.createElement('article');
      card.className = `comment-card${comment.resolved ? ' resolved' : ''}`;
      const quote = document.createElement('blockquote');
      quote.className = 'comment-quote';
      quote.textContent = `“${comment.selectedText}”`;
      card.append(quote);

      const meta = document.createElement('div');
      meta.className = 'comment-meta';
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = (comment.author || '?').slice(0, 1).toUpperCase();
      const author = document.createElement('strong');
      author.textContent = comment.author || 'Anônimo';
      const date = document.createElement('span');
      date.textContent = new Date(comment.createdAt).toLocaleDateString('pt-BR');
      meta.append(avatar, author, date);
      if (comment.resolved) {
        const resolved = document.createElement('span');
        resolved.className = 'resolved-label';
        resolved.textContent = 'Resolvido';
        meta.append(resolved);
      }
      card.append(meta);

      const text = document.createElement('p');
      text.className = 'comment-text';
      text.textContent = comment.text;
      card.append(text);

      (comment.replies || []).forEach((reply) => {
        const item = document.createElement('div');
        item.className = 'reply-item';
        const replyAuthor = document.createElement('div');
        replyAuthor.className = 'reply-author';
        replyAuthor.textContent = `${reply.author} · ${new Date(reply.createdAt).toLocaleDateString('pt-BR')}`;
        const replyText = document.createElement('p');
        replyText.className = 'reply-text';
        replyText.textContent = reply.text;
        item.append(replyAuthor, replyText);
        card.append(item);
      });

      const actions = document.createElement('div');
      actions.className = 'comment-actions';
      const replyButton = document.createElement('button');
      replyButton.textContent = 'Responder';
      replyButton.addEventListener('click', () => showReplyForm(card, comment._id));
      const resolveButton = document.createElement('button');
      resolveButton.textContent = comment.resolved ? 'Reabrir' : 'Resolver';
      resolveButton.addEventListener('click', () => updateComment(comment._id, !comment.resolved));
      actions.append(replyButton, resolveButton);
      card.append(actions);
      commentsList.append(card);
    });
  }

  function showReplyForm(card, commentId) {
    if (!activeDocument?._id) return notify('Salve o documento antes de responder.');
    if (card.querySelector('.reply-form')) return;
    const form = document.createElement('form');
    form.className = 'reply-form';
    const input = document.createElement('input');
    input.required = true;
    input.maxLength = 1000;
    input.placeholder = 'Escreva uma resposta...';
    const submit = document.createElement('button');
    submit.textContent = 'Enviar resposta';
    form.append(input, submit);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/documents/${activeDocument._id}/comments/${commentId}/replies`, {
          method: 'POST', body: JSON.stringify({ text: input.value })
        });
        await openDocument(activeDocument._id);
      } catch (error) {
        notify(error.message);
      }
    });
    card.append(form);
    input.focus();
  }

  async function updateComment(commentId, resolved) {
    try {
      await api(`/api/documents/${activeDocument._id}/comments/${commentId}`, {
        method: 'PATCH', body: JSON.stringify({ resolved })
      });
      await openDocument(activeDocument._id);
    } catch (error) {
      notify(error.message);
    }
  }

  function scheduleDraftSave() {
    setStatus('Salvando rascunho...');
    clearTimeout(draftTimer);
    draftTimer = setTimeout(async () => {
      try {
        const content = getContent();
        await api('/api/draft', {
          method: 'PUT',
          body: JSON.stringify({
            title: activeDocument?.title || 'Sem título.md',
            content,
            documentId: activeDocument?._id || null
          })
        });
        setStatus(activeDocument?._id ? 'Alterações não salvas' : 'Rascunho salvo');
        await checkDraft();
      } catch (error) {
        setStatus('Falha ao salvar rascunho');
        notify(error.message);
      }
    }, 700);
  }

  async function checkDraft() {
    const draft = await api('/api/draft');
    document.querySelector('#draft-banner').classList.toggle('hidden', !draft?.content?.trim());
    return draft;
  }

  async function saveDocument() {
    const content = getContent();
    const title = activeDocument?.title || 'Sem título.md';
    try {
      const saved = activeDocument?._id
        ? await api(`/api/documents/${activeDocument._id}`, { method: 'PUT', body: JSON.stringify({ title, content }) })
        : await api('/api/documents', {
          method: 'POST',
          body: JSON.stringify(title === 'Sem título.md' ? { content } : { title, content })
        });
      renderDocument(saved);
      await checkDraft();
      notify('Documento salvo.');
    } catch (error) {
      notify(error.message);
    }
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  function safeFileName() {
    return (activeDocument?.title || 'Sem título.md').replace(/\.md$/i, '') || 'Sem título';
  }

  editor.addEventListener('input', scheduleDraftSave);
  editor.addEventListener('change', scheduleDraftSave);
  markdownSource.addEventListener('input', () => {
    editor.innerHTML = md.render(markdownSource.value);
    scheduleDraftSave();
  });
  document.querySelector('#new-document').addEventListener('click', async () => {
    try {
      await api('/api/draft', { method: 'DELETE' });
      renderDocument(null);
      editor.focus();
      await checkDraft();
    } catch (error) { notify(error.message); }
  });
  document.querySelector('#save-button').addEventListener('click', saveDocument);
  document.querySelector('#rename-button').addEventListener('click', async () => {
    if (!activeDocument?._id) {
      notify('Salve o documento para poder renomeá-lo.');
      return;
    }
    const title = window.prompt('Novo título do documento:', activeDocument.title);
    if (title === null) return;
    try {
      const renamed = await api(`/api/documents/${activeDocument._id}/title`, {
        method: 'PATCH', body: JSON.stringify({ title })
      });
      renderDocument(renamed);
    } catch (error) { notify(error.message); }
  });
  document.querySelector('#open-file').addEventListener('click', () => document.querySelector('#file-input').click());
  document.querySelector('#file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    renderDocument({ title: file.name, content: await file.text() });
    event.target.value = '';
  });

  document.querySelector('#export-button').addEventListener('click', () => document.querySelector('#export-options').classList.toggle('hidden'));
  document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => {
    const content = getContent();
    const filename = safeFileName();
    document.querySelector('#export-options').classList.add('hidden');
    if (button.dataset.export === 'markdown') download(`${filename}.md`, content, 'text/markdown;charset=utf-8');
    if (button.dataset.export === 'word') {
      const html = md.render(content);
      download(`${filename}.doc`, `<!doctype html><html><meta charset="utf-8"><body>${html}</body></html>`, 'application/msword');
    }
    if (button.dataset.export === 'pdf') {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return notify('Permita a abertura de janelas para salvar como PDF.');
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title></title><style>body{max-width:760px;margin:50px auto;font:16px/1.7 Georgia,serif}pre{white-space:pre-wrap}</style><body></body></html>`);
      printWindow.document.title = filename;
      printWindow.document.body.innerHTML = md.render(content);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  }));

  document.querySelector('#view-toggle').addEventListener('click', (event) => {
    if (isMarkdownView) {
      editor.innerHTML = md.render(markdownSource.value);
      editor.classList.remove('hidden');
      markdownSource.classList.add('hidden');
      event.currentTarget.textContent = 'Ver .md';
    } else {
      markdownSource.value = htmlToMarkdown(editor);
      editor.classList.add('hidden');
      markdownSource.classList.remove('hidden');
      event.currentTarget.textContent = 'Ver formatado';
    }
    isMarkdownView = !isMarkdownView;
  });

  document.querySelector('#style-picker').addEventListener('change', (event) => {
    editor.focus();
    document.execCommand('formatBlock', false, event.target.value);
    event.target.value = 'p';
    scheduleDraftSave();
  });
  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => {
    editor.focus();
    const command = button.dataset.command;
    if (command === 'highlight') document.execCommand('hiliteColor', false, '#fff0a8');
    else if (command === 'inlineCode') document.execCommand('insertHTML', false, `<code>${window.getSelection().toString() || 'código'}</code>`);
    else document.execCommand(command, false, null);
    scheduleDraftSave();
  }));
  document.querySelector('#checklist-button').addEventListener('click', () => {
    editor.focus();
    document.execCommand('insertHTML', false, '<ul><li><input type="checkbox"> Tarefa</li></ul><p><br></p>');
    scheduleDraftSave();
  });

  document.querySelector('#find-button').addEventListener('click', () => {
    document.querySelector('#find-bar').classList.toggle('hidden');
    document.querySelector('#find-input').focus();
  });
  let findResults = [];
  let findIndex = 0;
  function searchDocument() {
    const query = document.querySelector('#find-input').value;
    const text = getContent();
    const count = query ? [...text.matchAll(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))].length : 0;
    document.querySelector('#find-count').textContent = count ? `${Math.min(findIndex + 1, count)} de ${count}` : '0 resultados';
    findResults = [];
    if (count && isMarkdownView) {
      const source = markdownSource.value.toLowerCase();
      const normalizedQuery = query.toLowerCase();
      let from = 0;
      let index;
      while ((index = source.indexOf(normalizedQuery, from)) !== -1) {
        findResults.push(index);
        from = index + query.length;
      }
      if (findResults.length) {
        findIndex %= findResults.length;
        const start = findResults[findIndex];
        markdownSource.focus();
        markdownSource.setSelectionRange(start, start + query.length);
      }
    } else if (count) {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const normalizedQuery = query.toLowerCase();
      let node;
      while ((node = walker.nextNode())) {
        const lower = node.nodeValue.toLowerCase();
        let from = 0;
        let index;
        while ((index = lower.indexOf(normalizedQuery, from)) !== -1) {
          findResults.push({ node, index, length: query.length });
          from = index + query.length;
        }
      }
      if (findResults.length) {
        findIndex = findIndex % findResults.length;
        const result = findResults[findIndex];
        const range = document.createRange();
        range.setStart(result.node, result.index);
        range.setEnd(result.node, result.index + result.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }
  document.querySelector('#find-input').addEventListener('input', () => { findIndex = 0; searchDocument(); });
  document.querySelector('#find-next').addEventListener('click', () => { findIndex += 1; searchDocument(); });
  document.querySelector('#find-prev').addEventListener('click', () => { findIndex = Math.max(0, findIndex - 1); searchDocument(); });
  document.querySelector('#close-find').addEventListener('click', () => document.querySelector('#find-bar').classList.add('hidden'));

  document.querySelector('#add-comment').addEventListener('click', () => {
    if (!activeDocument?._id) {
      notify('Salve o documento antes de comentar.');
      return;
    }
    const selection = isMarkdownView ? markdownSource.value.slice(markdownSource.selectionStart, markdownSource.selectionEnd) : window.getSelection().toString();
    if (!selection.trim()) {
      notify('Selecione um trecho do documento para comentar.');
      return;
    }
    selectedTextForComment = selection.trim();
    document.querySelector('#selection-preview').textContent = `“${selectedTextForComment}”`;
    commentDialog.classList.remove('hidden');
    document.querySelector('#comment-text').focus();
  });
  function closeCommentDialog() {
    commentDialog.classList.add('hidden');
    commentForm.reset();
  }
  document.querySelector('#cancel-comment').addEventListener('click', closeCommentDialog);
  document.querySelector('#cancel-comment-secondary').addEventListener('click', closeCommentDialog);
  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api(`/api/documents/${activeDocument._id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          selectedText: selectedTextForComment,
          author: document.querySelector('#comment-author').value.trim() || 'Anônimo',
          text: document.querySelector('#comment-text').value
        })
      });
      closeCommentDialog();
      await openDocument(activeDocument._id);
      notify('Comentário adicionado.');
    } catch (error) { notify(error.message); }
  });
  document.querySelector('#close-comments').addEventListener('click', () => {
    document.querySelector('#comments-panel').classList.add('hidden');
    document.querySelector('#show-comments').classList.remove('hidden');
  });
  document.querySelector('#show-comments').addEventListener('click', () => {
    document.querySelector('#comments-panel').classList.remove('hidden');
    document.querySelector('#show-comments').classList.add('hidden');
  });
  document.querySelector('#restore-draft').addEventListener('click', async () => {
    try {
      const draft = await api('/api/draft');
      if (!draft?.content?.trim()) return checkDraft();
      if (draft.documentId) {
        const document = await api(`/api/documents/${draft.documentId}`);
        renderDocument({ ...document, title: draft.title, content: draft.content });
      } else {
        renderDocument({ title: draft.title, content: draft.content });
      }
      await api('/api/draft', { method: 'DELETE' });
      await checkDraft();
    } catch (error) { notify(error.message); }
  });
  document.querySelector('#discard-draft').addEventListener('click', async () => {
    try {
      await api('/api/draft', { method: 'DELETE' });
      document.querySelector('#draft-banner').classList.add('hidden');
      notify('Rascunho descartado.');
    } catch (error) { notify(error.message); }
  });

  async function initialize() {
    try {
      const documents = await api('/api/documents');
      if (documents.length) await openDocument(documents[0]._id);
      else renderDocument(null);
      await checkDraft();
    } catch (error) {
      notify(error.message);
      setStatus('API indisponível');
    }
  }
  initialize();
})();
