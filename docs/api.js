// Comunicação com o Apps Script + registro do service worker.
(function () {
  const cfg = window.PONTO_CONFIG || {};

  // POST com text/plain evita preflight de CORS no Apps Script.
  window.api = async function (acao, dados) {
    if (!cfg.API_URL || cfg.API_URL.indexOf('COLE_AQUI') === 0) {
      throw new Error('Configure a URL do Apps Script em config.js.');
    }
    let resp;
    try {
      resp = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ acao: acao }, dados || {}))
      });
    } catch (e) {
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    }
    if (!resp.ok) throw new Error('Servidor indisponível (' + resp.status + ').');
    try {
      return await resp.json();
    } catch (e) {
      throw new Error('Resposta inválida do servidor.');
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
