# TopWatch

**Site:** [victorhugoantonio1.github.io/topwatch](https://victorhugoantonio1.github.io/topwatch/) · [Plugins](https://victorhugoantonio1.github.io/topwatch/plugins/)

Uma forma simplificada de acompanhar sua operação.

O TopWatch é uma barrinha discreta na borda da tela que mostra os **alertas do Zabbix**. Passou o mouse, ela abre. Tem alerta grave, a luz muda de cor e a barra diz qual é o host, sem você precisar abrir aba nenhuma.

![TopWatch aberto, com um alerta de Desastre em destaque, alertas de dois servidores Zabbix e o Vigia de olho](docs/preview.png)

Feito pra quem não quer ficar com uma aba do Zabbix aberta o dia inteiro. Outras integrações, como sistemas de chamados, entram por [plugins](#plugins).

## O que ela faz

- **Luz do TopWatch**: verde quando está tudo calmo, amarela/laranja/vermelha conforme a severidade do pior alerta aberto. Em Alta ou Desastre, um feixe gira em volta da luz.
- **Pílula inteligente**: recolhida, mostra a contagem (`3 alertas`) ou, se tiver algo grave, direto o que é (`Desastre · srv-app02`).
- **Card de destaque**: ao abrir, o alerta mais grave vem em cima com **Reconhecer** e **Abrir**. O Reconhecer deixa no Zabbix a mensagem "Alerta reconhecido e em tratativa (via TopWatch)" (dá pra mudar nas configurações) ou uma nota escrita na hora pelo ✎. O resto fica numa lista compacta.
- **Alertas e Histórico**: a aba Alertas mostra só o que ainda não foi reconhecido. A aba Histórico mostra o que está **em tratativa** (reconhecido e ainda ativo, com quem reconheceu, quando e a mensagem, inclusive de outras pessoas do time) e o que foi **resolvido nas últimas 24 h**, com quanto tempo durou. No topo de cada seção aparecem a **resposta média** (do alerta abrir até alguém reconhecer) e a **resolução média** (até resolver).
- **Vários Zabbix ao mesmo tempo**: cadastre quantos servidores quiser, de versões diferentes. Os alertas aparecem juntos, cada um com a etiqueta do servidor de onde veio, e o **Reconhecer** vai pro servidor certo. Se um cair, os outros continuam aparecendo.
- **Em qualquer borda e em qualquer monitor**: topo, embaixo ou nas laterais. Dá pra escolher nas configurações ou arrastar a barra: enquanto você arrasta, ela vira a cabeça do Vigia; ao soltar, gruda na borda mais próxima e se abre de novo em barra. Se ela se perder, a bandeja tem **Voltar a barra pro topo da tela principal**.
- **Aviso de alerta grave** (Alta ou Desastre): a barra cresce e mostra o alerta, notificação do Windows e som. Cada um liga e desliga nas configurações, e o som pode ser um arquivo seu (.wav, .mp3, .ogg).
- **Vigia**: um robozinho que segue o mouse, olha pra linha sob o cursor, leva susto com alerta novo, fica vermelho no Desastre, acena quando você reconhece e desliga quando está tudo calmo. Clique nele pra cutucar (três vezes rápido e ele dá glitch). Dá pra desligar nas configurações.

  ![O Vigia reagindo: olha a lista, glitch ao ser cutucado, alarme com um Desastre, aceno ao reconhecer e desliga quando fica tudo calmo](docs/vigia.gif)

- **Plugins**: cada integração instalada ganha a própria aba na barra e a própria seção nas configurações.
- **Sem conexão, sem pânico**: se o Zabbix não responder, a pílula mostra `Sem conexão · há X min`, os últimos alertas conhecidos continuam na tela (marcados como desatualizados) e o app tenta de novo com intervalos cada vez maiores, até 5 min. Ao voltar da suspensão ou desbloquear o PC, ele atualiza na hora.
- **Modo demo** com dados de exemplo, pra ver funcionando sem configurar nada. Pela bandeja, **Simular** cria um alerta de Alta ou de Desastre, ou resolve tudo, pra testar os avisos.
- **Vigia na bandeja**: o ícone perto do relógio é o Vigia em miniatura. O olho tem a cor do pior alerta, pisca de vez em quando e pulsa em Alta ou Desastre.
- `Ctrl` + `Alt` + `F` fixa a barra aberta; o ícone na bandeja esconde/mostra. **Atualizar agora** na bandeja busca os alertas sem esperar a próxima rodada.

## Instalar

Baixe o [**TopWatch.msi**](https://github.com/victorhugoantonio1/topwatch/releases/latest/download/TopWatch.msi) e abra. Ele pede permissão de administrador, instala para todos os usuários em Arquivos de Programas e cria o atalho. Não precisa instalar Node nem nada além dele. Sem administrador, use o [**TopWatch-Setup.exe**](https://github.com/victorhugoantonio1/topwatch/releases/latest/download/TopWatch-Setup.exe), que instala só pro seu usuário, ou o [**TopWatch-Portable.exe**](https://github.com/victorhugoantonio1/topwatch/releases/latest/download/TopWatch-Portable.exe), que roda sem instalar.

**Em empresas:** o mesmo `TopWatch.msi` pode ser distribuído pelo Intune ou por GPO (`msiexec /i TopWatch.msi /qn`). Computadores com a regra ASR do Defender que bloqueia executáveis pouco conhecidos não abrem o `.exe` baixado; nesse caso, a instalação é pela TI.

Como o instalador não é assinado digitalmente, o SmartScreen vai mostrar "Editor desconhecido": clique em **Mais informações → Executar assim mesmo**. O instalador é gerado pelo GitHub Actions a partir deste código (veja `.github/workflows/release.yml`).

Ou rode do código:

```bash
git clone https://github.com/victorhugoantonio1/topwatch.git
cd topwatch
npm install
npm start          # ou: npm run demo
```

Pra gerar o instalador localmente: `npm run dist` (sai em `dist/`).

## Configurar

Clique com o botão direito no ícone da bandeja → **Configurações…**

**Zabbix** (5.4 em diante; testado no 6.0 e no 7.0)

1. Em cada Zabbix: *Usuários → Tokens de API → Criar token*.
2. Use um usuário dedicado. Leitura basta pra ver os alertas; o botão **Reconhecer** precisa de permissão de escrita nos hosts. Se o perfil não puder comentar em problemas, ele reconhece sem a mensagem.
3. Em **+ Adicionar servidor Zabbix**, dê um nome (ex.: `Zabbix 6`), cole a URL do frontend (ex.: `https://zabbix.empresa.local`) e o token. Repita pra cada servidor.

A versão é detectada sozinha: até o 6.2 o token vai no corpo da requisição, do 6.4 em diante vai no cabeçalho `Authorization`. Se um proxy atrapalhar a detecção, force o modo no campo **Autenticação** daquele servidor. A severidade mínima vale pra todos.

Quem já usava um Zabbix só não precisa refazer nada: a configuração antiga vira o primeiro servidor da lista.

Servidor interno com certificado autoassinado? Marque "aceitar certificado autoassinado" naquele servidor. Use **Testar conexão** antes de salvar.

**Alertas graves:** escolha o que acontece em Alta ou Desastre (mostrar na barra, notificação do Windows, som) e, se quiser, troque o som por um arquivo seu. **Mensagem ao reconhecer** define o texto que vai pro Zabbix quando você clica em Reconhecer.

**Esquecer token:** cada campo de token tem um botão pra apagar o que está salvo. Ao parar de usar um servidor, revogue o token também no próprio Zabbix.

## Plugins

Plugins adicionam integrações com outros sistemas. Cada plugin ganha uma aba na barra e uma seção nas configurações.

**Instalar:** em Configurações → Plugins → **Instalar plugin…**, escolha a pasta do plugin (a que tem o `index.js`). Ele é copiado pra pasta de plugins do app e já aparece, sem reiniciar. **Abrir pasta de plugins** mostra onde eles ficam.

**Criar um plugin:** é uma pasta com um `index.js` que declara nome, aba e campos de configuração, e devolve os itens a mostrar. O formato completo está comentado no topo de [`src/plugins.js`](src/plugins.js). Pra desenvolver sem instalar, aponte a variável `TOPWATCH_PLUGINS` pra pasta onde estão os seus plugins.

## Segurança

- Tokens ficam criptografados com o `safeStorage` do Electron (DPAPI do Windows) e nunca voltam em texto puro pra tela.
- A interface roda isolada (`contextIsolation`, `sandbox`, sem Node), com CSP, e todo texto vindo das APIs entra como texto, nunca como HTML.
- Os botões só abrem links `http`/`https` que vieram dos próprios dados do Zabbix ou dos plugins.
- O app só conversa com os servidores que você configurar. Sem telemetria.
- Plugins rodam no processo principal, com acesso ao computador. Instale só plugins de quem você confia.

### Onde ficam os dados

Tudo fica no seu computador, em `%APPDATA%\TopWatch`. Não tem banco de dados nem servidor do TopWatch.

| Arquivo | O que guarda |
| --- | --- |
| `config.json` | configurações e servidores (tokens criptografados) |
| `history.json` | alertas resolvidos nas últimas 24 h (até 200) |
| `topwatch.log` | erros do app, pra diagnóstico (sem tokens; recomeça ao passar de 512 KB) |
| `sounds/` | o som de alerta que você escolheu |
| `plugins/` | plugins instalados |

Apagar a pasta com o app fechado volta tudo ao padrão.

## Como funciona

- **Ilha**: uma janela transparente, sem borda e sempre no topo que **deixa o mouse passar** (`setIgnoreMouseEvents` com `forward`). Quando o cursor entra na pílula, ela passa a aceitar cliques e expande; ao sair, volta a ser "fantasma".
- **Coleta**: o processo principal consulta as APIs a cada N segundos (sem CORS, com suporte a certificado autoassinado) e manda o estado pra interface via IPC.
- **Zabbix**: `apiinfo.version` pra descobrir como autenticar, `problem.get` (com os reconhecimentos) + `trigger.get` (pra pegar os hosts) em todos os servidores em paralelo, `user.get` pra mostrar o nome de quem reconheceu (se o perfil não puder ver usuários, o nome fica de fora) e `event.acknowledge` no botão Reconhecer.
- **Carga**: por padrão, uma rodada a cada 60 s (mínimo 30 s). Em cada rodada vai **um `problem.get` por servidor** (até 50 problemas, só campos básicos). O `trigger.get` e o `user.get` só saem quando aparece um trigger ou um usuário que o app ainda não conhece, porque ficam em cache. É mais leve que deixar um dashboard do Zabbix aberto.
- **Histórico**: o app compara uma rodada com a anterior; o alerta que sumiu do Zabbix entra como resolvido em `history.json`. Por isso a hora da resolução tem a precisão do intervalo de atualização.
- **Falhas**: erros de rede viram mensagens legíveis ("Conexão recusada em zabbix.empresa.local", "O certificado de … venceu"). Se a janela da barra travar ou cair, o app recarrega ela sozinho e registra o motivo em `topwatch.log`.
- **Plugins**: carregados da pasta `plugins` dos dados do app. Cada um é consultado em paralelo com o Zabbix; plugin com erro mostra o erro na aba dele e não derruba o resto.

```
main.js            processo principal: janelas, bandeja, coleta, IPC
preload.js         ponte mínima entre interface e processo principal
src/zabbix.js      cliente JSON-RPC do Zabbix (vários servidores, 5.4 a 7.x)
src/http.js        requisições HTTPS e mensagens de erro de rede legíveis
src/dock.js        cálculo de borda e monitor da barra
src/plugins.js     carregador de plugins (formato descrito no topo do arquivo)
src/config.js      configurações + tokens criptografados
src/demo.js        dados de exemplo
renderer/          interface da ilha, o Vigia (bot.js), a cabeça do arrasto (buddy.js) e a tela de configurações
test/              testes do cliente Zabbix, das configurações, dos plugins e das bordas
lab/zabbix/        Zabbix local no Docker + script que simula problemas pela API
scripts/           geradores dos ícones e do som de alerta, e montagem do site
site/              site do TopWatch (GitHub Pages); a demonstração usa a barra de verdade, de renderer/
```

Testes: `npm test`.

Quer testar contra um Zabbix de verdade sem mexer em produção? O [laboratório](lab/zabbix/README.md) sobe um Zabbix 7.0 no Docker e simula problemas pela API.

## Limitações conhecidas

- Feito e pensado para **Windows**. A versão para Linux está em desenvolvimento: hoje, lá, a janela não consegue deixar o mouse passar, então o retângulo da ilha fica clicável mesmo recolhido.
- Jogos em tela cheia exclusiva ficam por cima da barra (o que é bom). Em tela cheia "sem bordas", esconda pela bandeja ou pelo atalho.

## Licença

Desde 13/10/2026, o TopWatch é distribuído sob a [GNU AGPL-3.0](LICENSE). Você pode usar, estudar, modificar e redistribuir. Se distribuir uma versão modificada, ou oferecê-la pela rede, o código dela também tem que ser aberto sob a mesma licença.

As versões publicadas até o commit `af03e0c` continuam sob a licença MIT, como foram publicadas.

Copyright (c) 2026 Victor Hugo Antonio. Para licença comercial (uso sem as obrigações da AGPL) ou suporte, fale comigo pelo [LinkedIn](https://www.linkedin.com/in/vituhzzz/).
