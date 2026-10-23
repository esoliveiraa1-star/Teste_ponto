// Tela do diarista: abre pelo link individual, confirma o CPF e registra entrada/saída.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const token = new URLSearchParams(location.search).get('t');
  let cpfConfirmado = null; // só em memória: não é gravado no aparelho

  function mensagem(texto, tipo) {
    const el = $('msg');
    el.textContent = texto || '';
    el.className = 'msg' + (tipo ? ' ' + tipo : '');
    el.hidden = !texto;
  }

  function dataBR(iso) {
    return String(iso).split('-').reverse().join('/');
  }

  function rotuloStatus(status) {
    return status === 'DENTRO' ? 'Na unidade' : 'Fora da área';
  }

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

  function mascara(valor) {
    return valor.replace(/\D/g, '').slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function mostrarRegistro(el, reg) {
    el.textContent = '';
    el.className = 'valor';
    if (!reg) {
      el.classList.add('pendente');
      el.textContent = 'Pendente';
      return;
    }
    const hora = document.createElement('strong');
    hora.textContent = reg.hora;
    const selo = document.createElement('span');
    selo.className = 'selo ' + (reg.status === 'DENTRO' ? 'dentro' : 'fora');
    selo.textContent = rotuloStatus(reg.status);
    el.appendChild(hora);
    el.appendChild(selo);
  }

  function desenhar(info) {
    $('unidade').textContent = info.unidade;
    $('saudacao').textContent = 'Olá, ' + info.nome.split(' ')[0];
    $('data').textContent = dataBR(info.data);
    $('registros').hidden = false;
    mostrarRegistro($('entrada'), info.entrada);
    mostrarRegistro($('saida'), info.saida);

    const botao = $('acao');
    botao.disabled = false;
    if (!info.entrada) {
      botao.dataset.tipo = 'entrada';
      botao.textContent = 'Registrar entrada';
    } else if (!info.saida) {
      botao.dataset.tipo = 'saida';
      botao.textContent = 'Registrar saída';
    } else {
      botao.hidden = true;
      $('aviso').hidden = true;
      return 'completo';
    }
    botao.hidden = false;
    $('aviso').hidden = false;
    return 'pendente';
  }

  function posicao() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Este aparelho não permite localização.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, function (e) {
        const textos = {
          1: 'A permissão de localização foi negada. Ative a localização do navegador para este site e tente de novo.',
          2: 'Não foi possível obter sua localização. Vá para um local aberto e tente de novo.',
          3: 'A localização demorou demais. Tente de novo.'
        };
        reject(new Error(textos[e.code] || 'Erro ao obter a localização.'));
      }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
    });
  }

  function bloquear(texto) {
    $('confirmacao').hidden = true;
    $('acao').hidden = true;
    $('aviso').hidden = true;
    mensagem(texto, 'erro');
  }

  // 1) abre o link: só mostra unidade e data, sem dados pessoais
  async function carregar() {
    if (!token) {
      mensagem('Link inválido. Peça um novo link ao seu líder.', 'erro');
      return;
    }
    try {
      const info = await api('info', { token: token });
      if (!info.ok) { mensagem(info.erro, 'erro'); return; }
      $('unidade').textContent = info.unidade;
      $('data').textContent = dataBR(info.data);
      mensagem('');
      $('confirmacao').hidden = false;
      $('cpf').focus();
    } catch (e) {
      mensagem(e.message, 'erro');
    }
  }

  // 2) confirma o CPF no servidor
  async function confirmar(ev) {
    ev.preventDefault();
    const digitos = $('cpf').value.replace(/\D/g, '');
    if (!cpfValido(digitos)) {
      mensagem('CPF inválido. Confira os números digitados.', 'alerta'); // não gasta tentativa
      return;
    }
    const botao = $('confirmar');
    botao.disabled = true;
    mensagem('Conferindo…');
    try {
      const r = await api('confirmar', { token: token, cpf: digitos });
      if (!r.ok) {
        if (r.bloqueado) { bloquear(r.erro); return; }
        mensagem(r.erro, 'erro');
        botao.disabled = false;
        return;
      }
      cpfConfirmado = digitos;
      $('cpf').value = '';
      $('confirmacao').hidden = true;
      const estado = desenhar(r);
      mensagem(estado === 'completo' ? 'Tudo certo por hoje. Entrada e saída registradas.' : '', estado === 'completo' ? 'ok' : '');
    } catch (e) {
      mensagem(e.message, 'erro');
      botao.disabled = false;
    }
  }

  // 3) registra entrada ou saída com a localização
  async function registrar() {
    const botao = $('acao');
    const tipo = botao.dataset.tipo;
    botao.disabled = true;
    mensagem('Obtendo sua localização…');
    try {
      const pos = await posicao();
      mensagem('Registrando…');
      const r = await api('marcar', {
        token: token,
        cpf: cpfConfirmado,
        tipo: tipo,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precisao: pos.coords.accuracy
      });
      if (!r.ok) {
        if (r.bloqueado) { bloquear(r.erro); return; }
        mensagem(r.erro, 'erro');
        botao.disabled = false;
        return;
      }
      const nome = tipo === 'entrada' ? 'Entrada' : 'Saída';
      if (r.status === 'DENTRO') {
        mensagem(nome + ' registrada às ' + r.hora + '.', 'ok');
      } else {
        mensagem(nome + ' registrada às ' + r.hora + ', mas você está a ' + r.distancia +
          ' m da unidade. O registro foi salvo como fora da área.', 'alerta');
      }
      const info = await api('confirmar', { token: token, cpf: cpfConfirmado });
      if (info.ok) desenhar(info);
    } catch (e) {
      mensagem(e.message, 'erro');
      botao.disabled = false;
    }
  }

  $('cpf').addEventListener('input', function () { this.value = mascara(this.value); });
  $('confirmacao').addEventListener('submit', confirmar);
  $('acao').addEventListener('click', registrar);
  carregar();
})();
