<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Conecte Feishu, Lark, DingTalk, WeCom, WeChat, QQ, Telegram, Discord e Slack à sua instância local do DeepSeek Harness**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Notas de versão](CHANGELOG.md) · [Licença](LICENSE)

  [![Licença: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![Pacote npm](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![Downloads npm](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 ou superior](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Canais](https://img.shields.io/badge/channels-9-238636.svg)](#-canais-suportados)
</div>

> DSH IM Connect é um plugin para DeepSeek Harness (DSH) mantido pela comunidade e não é um produto oficial da DeepSeek AI.

## Visão geral dos recursos

Mesmo longe do computador, você pode atribuir tarefas ao seu DSH local através do seu aplicativo de mensagens favorito, acompanhar respostas, responder a perguntas e gerenciar a aprovação de ferramentas no mesmo chat.

- **Conexão com as principais plataformas**: DingTalk, Feishu, Lark, WeChat, WeCom, QQ, Telegram, Discord e Slack.
- **Configuração individual por conta**: Adicione várias contas no mesmo serviço, escolhendo separadamente o espaço de trabalho, modelo, esforço de raciocínio, permissões e método de envio.
- **Interação simplificada no celular**: Envie instruções, leia retornos e responda enquetes interativas. Usuários aprovados podem autorizar ou negar ferramentas em conversas privadas.
- **Sessões organizadas e isoladas**: Cada conversa de aplicativo possui uma sessão dedicada, acessível na aba "Canais" do espaço de trabalho web.
- **Conexão rápida por QR code ou credenciais**: Configure em "Configurações → Assistente IM" com total controle sobre o recebimento de mensagens.
- **Controle de acesso rigoroso**: Grupos respondem apenas a menções (@), e mensagens diretas seguem regras de aprovação personalizadas.

## Quem pode acionar o assistente?

As mensagens recebidas são verificadas pelo remetente antes do processamento de comandos ou aprovações.

| Caso de uso | Comportamento |
|---|---|
| Grupo sem menção (@) ao bot | Ignorado; nenhuma resposta ou solicitação de aprovação é gerada |
| Grupo com menção explícita (@) ao bot | Sem necessidade de vinculação prévia: qualquer participante pode enviar tarefas |
| Mensagem direta de quem escaneou o QR | Usuários de WeChat, Feishu, Lark e QQ que escanearam o QR code entram automaticamente na lista de permissões |
| Mensagem direta de outros usuários | Entra na lista de espera das configurações até aprovação por um administrador |
| Mensagem direta após QR sem identificação | A vinculação rápida do DingTalk e WeCom retorna apenas credenciais do bot; aprovação em configurações necessária |
| Mensagem direta via credenciais manuais | Telegram, Discord, Slack e conexões manuais exigem aprovação individual para cada conversa privada |
| Mensagem direta sem userId | Rejeitada |
| Aprovação de ferramentas | Responda `Aprovar` ou `Rejeitar` (`Approve` / `Deny`) diretamente no chat vinculado. Sem resposta em 5 minutos, a ação é cancelada com segurança |
| Seleção interativa | Responda com o número ou texto da opção. Em grupos, apenas quem iniciou a tarefa pode responder |

## 📡 Canais suportados

<p align="center">
  <code>🔔 DingTalk</code>&nbsp;
  <code>🐦 Feishu</code>&nbsp;
  <code>🌐 Lark</code>&nbsp;
  <code>💬 WeChat</code>&nbsp;
  <code>🏢 WeCom</code>&nbsp;
  <code>🐧 QQ</code>&nbsp;
  <code>✈️ Telegram</code>&nbsp;
  <code>🎮 Discord</code>&nbsp;
  <code>💬 Slack</code>
</p>

| Canal | Método de conexão | Recepção | Envio |
|---|---|---|---|
| **🔔 DingTalk** | QR Code / Manual | Webhook | Webhook / Cartões interativos |
| **🐦 Feishu** | QR Code / Manual | Long Polling / Eventos | Open API / Cartões interativos |
| **🌐 Lark** | QR Code / Manual | Long Polling / Eventos | Open API / Cartões interativos |
| **💬 WeChat** | QR Code | Sondagem oficial sincronizada | Protocolo de sincronização nativo |
| **🏢 WeCom** | QR Code / Manual | Callback interno | Webhook / Cartões formatados |
| **🐧 QQ** | QR Code / Manual | WebSocket oficial / Webhook | OpenAPI / Markdown avançado |
| **✈️ Telegram** | Token de Bot | Long Polling (getUpdates) | Telegram Bot API / Citações expansíveis |
| **🎮 Discord** | Token de Bot | Gateway WebSocket | REST API |
| **💬 Slack** | Bot Token & App Token | Socket Mode WebSocket | Web API / Block Kit |

## Entrada de imagens e arquivos

Envie capturas de tela, fotos ou documentos (PDF, código, texto) diretamente para a conversa. O modelo de visão do DSH os analisará em conjunto com suas instruções. Arquivos gerados (arquivos ZIP, relatórios, imagens) são enviados de volta ao chat como anexos nativos.

## Menu de ações rápidas

Digite `/menu` no chat para exibir botões interativos que permitem trocar de sessão ou ajustar modelos com apenas um toque.

## Configurações do plugin

Acessível no painel em **Plugins → @michengai/dsh-im-connect**:

### 1. Localização do atalho (`location`)
- **Padrão**: Apenas configurações (`settings`)
- **Opções**: `both` (barra lateral e configurações), `sidebar` (apenas barra lateral) ou `settings` (apenas configurações).

### 2. Exibir sessões de IM na árvore de tarefas (`taskTreeSessions`)
- **Padrão**: Desativado (`false`)
- **Função**: Oculta conversas de mensagens da árvore de tarefas principal, evitando poluição visual no espaço de trabalho diário.

### 3. Bloqueio de atualizações via Cordis (`updater` / `onlineUpdate`)
- **Padrão**: Desbloqueado (`undefined`)
- **Função**: Para ambientes corporativos fechados, desative pontos de atualização em `cordis.patch.yml`:
  ```yaml
  - id: im-connect
    config:
      updater: false # ou onlineUpdate: false
  ```
  Ao bloquear, o endpoint retorna HTTP 403, delegando o ciclo de vida ao gerenciador oficial do DSH.

### 4. Política de acionamento em grupos do Telegram (`mentionPolicy` / `freeChatGroups`)
- **Padrão**: `addressed` (responde apenas a menções @ ou respostas diretas).
- **Função**: Permite cadastrar grupos em lista branca para responder a todas as mensagens sem exigir menção.

### 5. Bloco recolhível de raciocínio (`thinkingDisplay`)
- **Padrão**: Desativado (`off`)
- **Função**: Envia a cadeia de pensamento no Telegram dentro de uma citação expansível (`<blockquote expandable>`).

## Uso e comandos

Abra **Configurações → Assistente IM**, clique em **Adicionar conta** e configure o espaço de trabalho, modelo, permissões e modo de envio.

| Objetivo | Ação | Notas |
| --- | --- | --- |
| Adicionar conta | Clique em **Adicionar conta** sob o canal desejado | Várias contas permitidas |
| Editar configurações | Clique em Configurações na linha da conta | Aplicado imediatamente |
| Pausar recebimento | Desative a chave **Receber mensagens** | As credenciais são mantidas |
| Nova sessão | Envie `/new` ou `/clear` | Inicia uma sessão limpa |
| Status / Ajuda | Envie `/status` ou `/help` | Exibe a sessão ativa e comandos |
| Perfis de agente | `/presets`, `/preset <número/ID>` | Altera o perfil de agente |
| Modelo e raciocínio | `/models`, `/model <nome>`, `/reasoning [nível]` | Ajusta o modelo dinamicamente |
| Gerenciar sessões | `/sessions`, `/session <número/ID>`, `/rename <título>`, `/fork` | Lista, alterna, renomeia ou duplica sessões |
| Recuperação de envio | `/delivery`, `/delivery retry <ID>` | Reenvia mensagens interrompidas |

### Nomenclatura automática de tópicos no Telegram

Os tópicos em fóruns do Telegram são nomeados automaticamente a partir do primeiro título da sessão. A sincronização manual pode ser feita com `/rename <título>`.

### Respostas segmentadas

Permite dividir respostas extensas em várias mensagens curtas sucessivas para leitura mais confortável no celular (disponível no QQ).

### Rotação de sessão por inatividade

Se decorrer um longo intervalo desde a última mensagem (ex. 1h, 6h), a mensagem seguinte iniciará automaticamente uma nova sessão.

### Conexão com Slack

1. Crie um aplicativo na Slack API (`api.slack.com/apps`).
2. Em **OAuth & Permissions → Bot Token Scopes**, conceda as permissões de mensagens, arquivos, reações e menções.
3. Instale o app em seu workspace e copie o Bot Token (`xoxb-`).
4. Ative o **Socket Mode** e gere um App-Level Token (`xapp-`).
5. Informe ambos os tokens no DSH para uma conexão WebSocket segura.

## Segurança e limites de acesso

- **API de gerenciamento**: Opera sob `/api/dsh-im-connect` com autenticação nativa do DSH.
- **Armazenamento de segredos**: Os tokens são protegidos nos cofres seguros do host.
- **Aprovação de ferramentas**: Permite autorizar comandos diretamente no chat sem acessar o navegador.

## Desenvolvimento e testes

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-im-connect.git
cd dsh-im-connect
npm install
npm test
dsh plugin --profile web add .
```

## Licença

Consulte as diretrizes de segurança em [SECURITY.md](SECURITY.md).
Distribuído sob a [Licença Apache 2.0](LICENSE).
