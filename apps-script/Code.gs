/**
 * Ponto de Diaristas - backend (Google Apps Script vinculado a uma planilha).
 *
 * Abas da planilha: Unidades, Links, Registros (criadas pela função setup).
 * Segredo do administrador: propriedade de script ADMIN_KEY.
 */

const TZ = 'America/Sao_Paulo';

const CABECALHOS = {
  Unidades: ['nome', 'latitude', 'longitude', 'raio_m'],
  Links: ['token', 'cpf', 'nome', 'unidade', 'data', 'entrada_em', 'entrada_status', 'saida_em', 'saida_status', 'criado_em'],
  Registros: ['data_hora', 'cpf', 'nome', 'unidade', 'tipo', 'latitude', 'longitude', 'precisao_m', 'distancia_m', 'raio_m', 'status', 'token']
};

// Colunas gravadas como texto puro (evita o Sheets converter CPF, datas e horas).
const COLUNAS_TEXTO = {
  Unidades: ['nome'],
  Links: ['token', 'cpf', 'nome', 'unidade', 'data', 'entrada_em', 'entrada_status', 'saida_em', 'saida_status', 'criado_em'],
  Registros: ['data_hora', 'cpf', 'nome', 'unidade', 'tipo', 'status', 'token']
};

/* ------------------------------------------------------------------ */
/* Instalação (rodar uma vez, manualmente, no editor do Apps Script)   */
/* ------------------------------------------------------------------ */

function setup() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(CABECALHOS).forEach(function (nome) {
    let aba = planilha.getSheetByName(nome);
    if (!aba) aba = planilha.insertSheet(nome);
    const cab = CABECALHOS[nome];
    aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    aba.setFrozenRows(1);
    (COLUNAS_TEXTO[nome] || []).forEach(function (campo) {
      const col = cab.indexOf(campo) + 1;
      aba.getRange(1, col, aba.getMaxRows(), 1).setNumberFormat('@');
    });
  });

  const unidades = planilha.getSheetByName('Unidades');
  if (unidades.getLastRow() < 2) {
    unidades.appendRow(['DC Aparecida de Goiânia (teste)', -16.757661819458008, -49.23505783081055, 150]);
  }

  if (!PropertiesService.getScriptProperties().getProperty('ADMIN_KEY')) {
    Logger.log('ATENÇÃO: defina a propriedade de script ADMIN_KEY (Configurações do projeto > Propriedades do script).');
  } else {
    Logger.log('Setup concluído.');
  }
}

/* ------------------------------------------------------------------ */
/* Entrada HTTP                                                         */
/* ------------------------------------------------------------------ */

function doGet() {
  return saida({ ok: true, servico: 'ponto-diaristas' });
}

function doPost(e) {
  let resp;
  try {
    const req = JSON.parse(e.postData.contents);
    switch (req.acao) {
      case 'info': resp = acaoInfo(req); break;
      case 'marcar': resp = acaoMarcar(req); break;
      case 'unidades': resp = acaoUnidades(req); break;
      case 'criar_links': resp = acaoCriarLinks(req); break;
      case 'painel': resp = acaoPainel(req); break;
      default: resp = erro('Ação inválida.');
    }
  } catch (err) {
    resp = erro('Erro interno: ' + err.message);
  }
  return saida(resp);
}

function saida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function erro(mensagem) {
  return { ok: false, erro: mensagem };
}

/* ------------------------------------------------------------------ */
/* Ações do colaborador                                                 */
/* ------------------------------------------------------------------ */

function acaoInfo(req) {
  const link = buscarLink(req.token);
  if (!link) return erro('Link inválido. Peça um novo link ao seu líder.');
  if (link.data !== hoje()) {
    return erro('Este link é do dia ' + dataBR(link.data) + ' e não vale para hoje.');
  }
  return {
    ok: true,
    nome: link.nome,
    unidade: link.unidade,
    data: link.data,
    entrada: link.entrada_em ? { hora: horaDe(link.entrada_em), status: link.entrada_status } : null,
    saida: link.saida_em ? { hora: horaDe(link.saida_em), status: link.saida_status } : null
  };
}

function acaoMarcar(req) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const link = buscarLink(req.token);
    if (!link) return erro('Link inválido. Peça um novo link ao seu líder.');
    if (link.data !== hoje()) {
      return erro('Este link é do dia ' + dataBR(link.data) + ' e não vale para hoje.');
    }

    const tipo = req.tipo;
    if (tipo !== 'entrada' && tipo !== 'saida') return erro('Tipo de registro inválido.');
    if (tipo === 'entrada' && link.entrada_em) return erro('A entrada já foi registrada às ' + horaDe(link.entrada_em) + '.');
    if (tipo === 'saida' && !link.entrada_em) return erro('Registre a entrada antes da saída.');
    if (tipo === 'saida' && link.saida_em) return erro('A saída já foi registrada às ' + horaDe(link.saida_em) + '.');

    if (typeof req.lat !== 'number' || typeof req.lng !== 'number' ||
        !isFinite(req.lat) || !isFinite(req.lng) ||
        Math.abs(req.lat) > 90 || Math.abs(req.lng) > 180) {
      return erro('Localização inválida. Tente de novo.');
    }
    const precisao = (typeof req.precisao === 'number' && isFinite(req.precisao)) ? Math.round(req.precisao) : '';

    const unidade = buscarUnidade(link.unidade);
    if (!unidade) return erro('Unidade não cadastrada: ' + link.unidade);

    const distancia = Math.round(distanciaMetros(req.lat, req.lng, unidade.lat, unidade.lng));
    const status = distancia <= unidade.raio ? 'DENTRO' : 'FORA';
    const momento = agora();

    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Registros').appendRow([
      momento, link.cpf, link.nome, link.unidade, tipo,
      req.lat, req.lng, precisao, distancia, unidade.raio, status, link.token
    ]);

    const abaLinks = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Links');
    const colInicio = CABECALHOS.Links.indexOf(tipo === 'entrada' ? 'entrada_em' : 'saida_em') + 1;
    abaLinks.getRange(link._linha, colInicio, 1, 2).setValues([[momento, status]]);

    return { ok: true, tipo: tipo, hora: horaDe(momento), status: status, distancia: distancia, raio: unidade.raio };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Ações do administrador                                               */
/* ------------------------------------------------------------------ */

function acaoUnidades(req) {
  if (!chaveOk(req.chave)) return erro('Chave de administrador inválida.');
  const nomes = lerTabela('Unidades').map(function (u) { return u.nome; }).filter(Boolean);
  return { ok: true, unidades: nomes };
}

function acaoCriarLinks(req) {
  if (!chaveOk(req.chave)) return erro('Chave de administrador inválida.');

  const unidade = buscarUnidade(req.unidade);
  if (!unidade) return erro('Unidade não cadastrada.');

  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.data || '') ? req.data : hoje();
  const pessoas = Array.isArray(req.pessoas) ? req.pessoas : [];
  if (!pessoas.length) return erro('Nenhuma pessoa informada.');
  if (pessoas.length > 200) return erro('Máximo de 200 pessoas por vez.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Links');
    const existentes = lerTabela('Links').filter(function (l) {
      return l.data === data && l.unidade === unidade.nome;
    });
    const novas = [];
    const links = [];
    const criadoEm = agora();

    pessoas.forEach(function (p) {
      const nome = String(p.nome || '').trim();
      const cpf = String(p.cpf || '').replace(/\D/g, '');
      if (!nome || !cpfValido(cpf)) {
        links.push({ nome: nome, cpf: cpf, erro: 'Nome ou CPF inválido.' });
        return;
      }
      // Se já existe link do mesmo CPF, na mesma unidade e data, reaproveita.
      let achado = existentes.filter(function (l) { return l.cpf === cpf; })[0];
      if (!achado) {
        const token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
        novas.push([token, cpf, nome, unidade.nome, data, '', '', '', '', criadoEm]);
        achado = { cpf: cpf, token: token };
        existentes.push(achado);
      }
      links.push({ nome: nome, cpf: cpf, token: achado.token });
    });

    if (novas.length) {
      aba.getRange(aba.getLastRow() + 1, 1, novas.length, CABECALHOS.Links.length).setValues(novas);
    }
    return { ok: true, unidade: unidade.nome, data: data, links: links };
  } finally {
    lock.releaseLock();
  }
}

function acaoPainel(req) {
  if (!chaveOk(req.chave)) return erro('Chave de administrador inválida.');
  const data = /^\d{4}-\d{2}-\d{2}$/.test(req.data || '') ? req.data : hoje();
  const alvo = req.unidade ? String(req.unidade).trim().toLowerCase() : '';

  const itens = lerTabela('Links')
    .filter(function (l) {
      return l.data === data && (!alvo || l.unidade.trim().toLowerCase() === alvo);
    })
    .map(function (l) {
      return {
        nome: l.nome,
        cpf: '***.' + l.cpf.slice(3, 6) + '.' + l.cpf.slice(6, 9) + '-**',
        token: l.token,
        entrada: l.entrada_em ? { hora: horaDe(l.entrada_em), status: l.entrada_status } : null,
        saida: l.saida_em ? { hora: horaDe(l.saida_em), status: l.saida_status } : null
      };
    })
    .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

  return { ok: true, data: data, itens: itens };
}

/* ------------------------------------------------------------------ */
/* Acesso a dados                                                       */
/* ------------------------------------------------------------------ */

function lerTabela(nomeAba) {
  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  if (!aba) throw new Error('Aba "' + nomeAba + '" não encontrada. Execute a função setup.');
  const cab = CABECALHOS[nomeAba];
  const ultima = aba.getLastRow();
  if (ultima < 2) return [];
  const textos = COLUNAS_TEXTO[nomeAba] || [];
  const valores = aba.getRange(2, 1, ultima - 1, cab.length).getValues();
  return valores.map(function (linha, i) {
    const obj = { _linha: i + 2 };
    cab.forEach(function (campo, c) {
      let v = linha[c];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, TZ, campo === 'data' ? 'yyyy-MM-dd' : 'dd/MM/yyyy HH:mm:ss');
      } else if (textos.indexOf(campo) >= 0) {
        v = String(v);
      }
      obj[campo] = v;
    });
    return obj;
  });
}

function buscarLink(token) {
  if (!token || typeof token !== 'string') return null;
  const achados = lerTabela('Links').filter(function (l) { return l.token === token; });
  return achados.length ? achados[0] : null;
}

function buscarUnidade(nome) {
  const alvo = String(nome || '').trim().toLowerCase();
  if (!alvo) return null;
  const achadas = lerTabela('Unidades').filter(function (u) {
    return String(u.nome).trim().toLowerCase() === alvo;
  });
  if (!achadas.length) return null;
  const u = achadas[0];
  const lat = Number(u.latitude), lng = Number(u.longitude), raio = Number(u.raio_m);
  if (!isFinite(lat) || !isFinite(lng) || !isFinite(raio) || raio <= 0) return null;
  return { nome: String(u.nome).trim(), lat: lat, lng: lng, raio: raio };
}

function chaveOk(chave) {
  const esperada = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!esperada && typeof chave === 'string' && chave === esperada;
}

/* ------------------------------------------------------------------ */
/* Utilitários                                                          */
/* ------------------------------------------------------------------ */

function hoje() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function agora() {
  return Utilities.formatDate(new Date(), TZ, 'dd/MM/yyyy HH:mm:ss');
}

function horaDe(dataHora) {
  const partes = String(dataHora || '').split(' ');
  return partes[1] ? partes[1].slice(0, 5) : '';
}

function dataBR(iso) {
  return String(iso).split('-').reverse().join('/');
}

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function cpfValido(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(cpf[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(cpf[t])) return false;
  }
  return true;
}
