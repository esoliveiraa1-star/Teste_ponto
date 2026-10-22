// Tela do administrador: gera links individuais e acompanha as presenças.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const CHAVE_LS = 'ponto_chave';
  let chave = null;

  /* ---------- utilitários ---------- */

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function mensagem(texto, tipo) {
    const m = $('msg');
    m.textContent = texto || '';
    m.className = 'msg' + (tipo ? ' ' + tipo : '');
    m.hidden = !texto;
  }

  function dataBR(iso) { return String(iso).split('-').reverse().join('/'); }

  function hojeISO() { return new Date().toLocaleDateString('sv-SE'); }

  function cpfValido(cpf) {
    cpf = String(cpf).replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let t = 9; t < 11; t++) {
      let soma = 0;
      for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
      if (((soma * 10) % 11) % 10 !== Number(cpf[t])) return false;
    }
    return true;
  }

  // Aceita "Nome 123.456.789-09", "Nome;12345678909", linhas coladas de planilha etc.
  function lerLinhas(texto) {
    return texto.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      const m = l.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
      if (!m) return { original: l, nome: l, cpf: '' };
      const nome = l.replace(m[1], ' ').replace(/[;,\t|]+/g, ' ').replace(/\s+/g, ' ').trim();
      return { original: l, nome: nome, cpf: m[1].replace(/\D/g, '') };
    });
  }

  function urlDoLink(token) {
    return new URL('index.html?t=' + encodeURIComponent(token), location.href).href;
  }

  async function copiar(texto, botao) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      window.prompt('Copie o texto abaixo:', texto);
      return;
    }
    const antes = botao.textContent;
    botao.textContent = 'Copiado';
    setTimeout(function () { botao.textContent = antes; }, 1500);
  }

  /* ---------- login ---------- */

  async function entrar(k) {
    const r = await api('unidades', { chave: k });
    if (!r.ok) throw new Error(r.erro);
    chave = k;
    try { localStorage.setItem(CHAVE_LS, k); } catch (e) {}

    const sel = $('unidadeSel');
    sel.textContent = '';
    r.unidades.forEach(function (u) {
      const o = el('option', '', u);
      o.value = u;
      sel.appendChild(o);
    });
    $('dataSel').value = hojeISO();
    $('login').hidden = true;
    $('admin').hidden = false;
    mensagem('');
    carregarPainel();
  }

  $('formLogin').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    try {
      await entrar($('chave').value);
    } catch (e) {
      mensagem(e.message, 'erro');
    }
  });

  $('sair').addEventListener('click', function () {
    try { localStorage.removeItem(CHAVE_LS); } catch (e) {}
    chave = null;
    $('chave').value = '';
    $('admin').hidden = true;
    $('login').hidden = false;
  });

  /* ---------- gerar links ---------- */

  function desenharResultado(r, ignoradas) {
    const area = $('resultado');
    area.textContent = '';

    const links = r.links.filter(function (l) { return l.token; });
    const falhas = r.links.filter(function (l) { return !l.token; });

    if (links.length) {
      const topo = el('div', 'barra');
      const todos = el('button', 'secundario', 'Copiar todos');
      todos.type = 'button';
      todos.addEventListener('click', function () {
        copiar(links.map(function (l) { return l.nome + ' - ' + urlDoLink(l.token); }).join('\n'), todos);
      });
      topo.appendChild(todos);
      area.appendChild(topo);
    }

    links.forEach(function (l) {
      const url = urlDoLink(l.token);
      const linha = el('div', 'item-link');
      linha.appendChild(el('span', '', l.nome));
      const acoes = el('div', 'acoes');

      const bCopiar = el('button', 'secundario', 'Copiar link');
      bCopiar.type = 'button';
      bCopiar.addEventListener('click', function () { copiar(url, bCopiar); });

      const texto = 'Olá, ' + l.nome.split(' ')[0] + '! Seu link de ponto de ' + dataBR(r.data) +
        ' (' + r.unidade + '): ' + url;
      const wa = el('a', 'secundario', 'WhatsApp');
      wa.href = 'https://wa.me/?text=' + encodeURIComponent(texto);
      wa.target = '_blank';
      wa.rel = 'noopener';

      acoes.appendChild(bCopiar);
      acoes.appendChild(wa);
      linha.appendChild(acoes);
      area.appendChild(linha);
    });

    falhas.concat(ignoradas).forEach(function (f) {
      const linha = el('div', 'item-link item-erro');
      linha.appendChild(el('span', '', 'Ignorada: ' + (f.original || f.nome) + ' (nome ou CPF inválido)'));
      area.appendChild(linha);
    });
  }

  $('formLinks').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const linhas = lerLinhas($('pessoas').value);
    if (!linhas.length) { mensagem('Cole ao menos uma pessoa.', 'alerta'); return; }

    const validas = linhas.filter(function (p) { return p.nome && cpfValido(p.cpf); });
    const ignoradas = linhas.filter(function (p) { return !(p.nome && cpfValido(p.cpf)); });
    if (!validas.length) {
      desenharResultado({ links: [] }, ignoradas);
      mensagem('Nenhuma linha válida. Confira nome e CPF.', 'erro');
      return;
    }

    mensagem('Gerando links…');
    try {
      const r = await api('criar_links', {
        chave: chave,
        unidade: $('unidadeSel').value,
        data: $('dataSel').value,
        pessoas: validas.map(function (p) { return { nome: p.nome, cpf: p.cpf }; })
      });
      if (!r.ok) { mensagem(r.erro, 'erro'); return; }
      desenharResultado(r, ignoradas);
      mensagem(r.links.filter(function (l) { return l.token; }).length + ' link(s) pronto(s).', 'ok');
      carregarPainel();
    } catch (e) {
      mensagem(e.message, 'erro');
    }
  });

  /* ---------- painel ---------- */

  function celula(reg) {
    const td = el('td');
    if (!reg) { td.appendChild(el('span', 'pendente', 'Pendente')); return td; }
    td.appendChild(el('strong', '', reg.hora));
    td.appendChild(el('span', 'selo ' + (reg.status === 'DENTRO' ? 'dentro' : 'fora'),
      reg.status === 'DENTRO' ? 'Na unidade' : 'Fora da área'));
    return td;
  }

  async function carregarPainel() {
    try {
      const r = await api('painel', { chave: chave, unidade: $('unidadeSel').value, data: $('dataSel').value });
      if (!r.ok) { mensagem(r.erro, 'erro'); return; }
      const corpo = $('corpo');
      corpo.textContent = '';
      if (!r.itens.length) {
        const tr = el('tr');
        const td = el('td', 'pendente', 'Nenhum link gerado para esta unidade e data.');
        td.colSpan = 3;
        tr.appendChild(td);
        corpo.appendChild(tr);
        return;
      }
      r.itens.forEach(function (i) {
        const tr = el('tr');
        tr.appendChild(el('td', '', i.nome));
        tr.appendChild(celula(i.entrada));
        tr.appendChild(celula(i.saida));
        corpo.appendChild(tr);
      });
    } catch (e) {
      mensagem(e.message, 'erro');
    }
  }

  $('atualizar').addEventListener('click', carregarPainel);
  $('unidadeSel').addEventListener('change', carregarPainel);
  $('dataSel').addEventListener('change', carregarPainel);

  /* ---------- início ---------- */

  (async function () {
    let salva = null;
    try { salva = localStorage.getItem(CHAVE_LS); } catch (e) {}
    if (salva) {
      try { await entrar(salva); } catch (e) { mensagem(e.message, 'erro'); }
    }
  })();
})();
