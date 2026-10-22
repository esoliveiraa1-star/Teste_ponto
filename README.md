# Ponto de Diaristas

Check-in e check-out de diaristas por **geolocalização**, com link individual por colaborador e por dia.

- O líder (ou o administrador) cola a lista do dia e o sistema gera **um link por diarista**.
- O diarista abre o link no próprio celular e toca em **Entrada** ou **Saída**. O navegador envia a localização.
- O servidor grava a **hora do servidor** e a **distância até a unidade**, marcando o registro como `DENTRO` ou `FORA` da área.
- Registro fora da área **não é bloqueado**, só marcado (o GPS dentro de galpão costuma errar).

```
ponto-diaristas/
├── docs/              Páginas publicadas no GitHub Pages
│   ├── index.html     Tela do colaborador (abre pelo link ?t=TOKEN)
│   ├── admin.html     Gerar links e ver presenças
│   ├── app.js         Lógica da tela do colaborador
│   ├── admin.js       Lógica da administração
│   ├── api.js         Chamadas ao Apps Script
│   ├── config.js      URL do Apps Script (editar)
│   ├── style.css, manifest.json, sw.js, icon-*.png
└── apps-script/
    ├── Code.gs        Backend (Google Apps Script)
    └── appsscript.json
```

## Instalação

### 1. Planilha e backend

1. Crie uma **planilha nova** no Google Sheets.
2. Menu **Extensões > Apps Script**.
3. Cole o conteúdo de `apps-script/Code.gs` no arquivo `Code.gs`.
4. Em **Configurações do projeto**, marque *Mostrar o arquivo de manifesto "appsscript.json" no editor*, abra-o e cole o conteúdo de `apps-script/appsscript.json`.
5. Em **Configurações do projeto > Propriedades do script**, adicione:
   - `ADMIN_KEY` = uma senha forte (é a chave de acesso do `admin.html`).
6. No editor, selecione a função **`setup`** e clique em **Executar** (autorize quando pedido). Ela cria as abas `Unidades`, `Links` e `Registros` e cadastra a unidade de teste.
7. **Implantar > Nova implantação > Tipo: App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - Copie a URL que termina em `/exec`.

> Sempre que alterar o `Code.gs`: **Implantar > Gerenciar implantações > editar > Nova versão**. A URL continua a mesma.

### 2. Front-end

1. Abra `docs/config.js` e cole a URL `/exec` em `API_URL`.
2. Suba o projeto para o GitHub.
3. No repositório: **Settings > Pages > Branch `main` > pasta `/docs`**.
4. A página fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Unidades

Aba **Unidades** da planilha: `nome`, `latitude`, `longitude`, `raio_m`.
Unidade de teste já cadastrada: DC Aparecida de Goiânia, raio de 150 m. Para outra unidade, adicione uma linha (coordenada pelo Google Maps: botão direito no local > clicar nos números para copiar).

## Teste rápido

1. Abra `.../admin.html`, informe a `ADMIN_KEY`.
2. Escolha a unidade e a data, cole uma linha como `Maria Souza 529.982.247-25` (CPF de teste válido) e clique em **Gerar links**.
3. Abra o link no celular, **dentro da unidade**, e toque em **Registrar entrada**.
4. Confira em **Presenças do dia** e na aba `Registros` da planilha.
5. Repita fora da área para ver o status `FORA`.

## Regras do sistema

- O link vale **só no dia** para o qual foi gerado.
- Entrada e saída são registradas **uma vez cada**; a saída só libera depois da entrada.
- Hora gravada é a do **servidor** (fuso America/Sao_Paulo), não a do celular.
- Gerar link de novo para o mesmo CPF, unidade e data **reaproveita** o link existente.

## Limites e cuidados

- **Exige internet** no momento do registro (a hora e a validação ficam no servidor).
- Geolocalização reduz fraude, mas **não elimina**: GPS pode ser falseado e o link pode ser repassado. Use a aba `Registros` (distância, precisão) para conferir casos suspeitos.
- A URL do Apps Script fica visível no `config.js`. A proteção está no **token do link** e na **`ADMIN_KEY`**, não em esconder a URL. Nenhum dado de colaborador vai no código; tudo fica na planilha.
- GitHub Pages é público mesmo com repositório privado (salvo planos Enterprise). Não coloque dados pessoais em `docs/`.
- **LGPD:** CPF e localização são dados pessoais. A tela do colaborador já avisa o uso da localização; defina por quanto tempo os registros são mantidos e quem acessa a planilha.
- O `admin.html` guarda a chave no navegador do aparelho (localStorage). Use **Sair deste aparelho** em aparelhos compartilhados.
