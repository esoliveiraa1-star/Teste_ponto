// Tela do colaborador: abre pelo link individual e registra entrada/saída.
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const token = new URLSearchParams(location.search).get('t');

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

  async function carregar() {
    if (!token) {
      mensagem('Link inválido. Peça um novo link ao seu líder.', 'erro');
      return;
    }
    try {
      const info = await api('info', { token: token });
      if (!info.ok) { mensagem(info.erro, 'erro'); return; }
      const estado = desenhar(info);
      if (estado === 'completo') {
        mensagem('Tudo certo por hoje. Entrada e saída registradas.', 'ok');
      } else {
        mensagem('');
      }
    } catch (e) {
      mensagem(e.message, 'erro');
    }
  }

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
        tipo: tipo,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        precisao: pos.coords.accuracy
      });
      if (!r.ok) {
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
      const info = await api('info', { token: token });
      if (info.ok) {
        const estado = desenhar(info);
        if (estado === 'completo') $('aviso').hidden = true;
      }
    } catch (e) {
      mensagem(e.message, 'erro');
      botao.disabled = false;
    }
  }

  $('acao').addEventListener('click', registrar);
  carregar();
})();
