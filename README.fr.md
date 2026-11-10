<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Connectez Feishu, Lark, DingTalk, WeCom, WeChat, QQ, Telegram, Discord et Slack à votre agent local DeepSeek Harness**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Journal des modifications](CHANGELOG.md) · [Licence](LICENSE)

  [![Licence : Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![Paquet npm](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![Téléchargements npm](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 ou supérieur](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Canaux](https://img.shields.io/badge/channels-9-238636.svg)](#-canaux-pris-en-charge)
</div>

> DSH IM Connect est une extension pour DeepSeek Harness (DSH) maintenue par la communauté, et non un produit officiel de DeepSeek AI.

## Aperçu des fonctionnalités

Même loin de votre poste de travail, assignez des tâches à votre DSH local via votre application de messagerie préférée, suivez les réponses, répondez aux questions et gérez l'approbation des outils au sein du même fil de discussion.

- **Prise en charge des plateformes majeures** : DingTalk, Feishu, Lark, WeChat, WeCom, QQ, Telegram, Discord et Slack.
- **Gestion multicompte indépendante** : Ajoutez plusieurs comptes sur un même service en configurant individuellement l'espace de travail, le modèle, l'effort de raisonnement, les autorisations et le mode de transmission.
- **Interactions fluides sur mobile** : Envoyez des instructions, consultez les résultats et répondez aux choix multiples. Les utilisateurs autorisés peuvent valider ou rejeter l'exécution des outils en message direct.
- **Sessions isolées et organisées** : Chaque conversation est rattachée à une session dédiée, consultable dans l'onglet « Canaux » de l'interface web.
- **Connexion rapide par QR code ou identifiants** : Gérez vos accès dans « Paramètres → Assistant IM » et pilotez la réception des messages par compte.
- **Contrôle d'accès rigoureux** : Déclenchement par mention (@) dans les groupes et politique d'admission personnalisée pour les messages privés.

## Qui peut piloter l'assistant ?

Chaque message entrant est authentifié avant le traitement des commandes ou l'approbation des outils.

| Cas d'usage | Comportement |
|---|---|
| Groupe sans mention (@) du bot | Message ignoré sans réponse ni notification d'approbation ; mentionner d'autres membres ne déclenche rien |
| Groupe avec mention explicite (@) du bot | Aucune liaison préalable requise : tout participant peut assigner une tâche |
| Message privé de l'utilisateur ayant scanné le QR | Les utilisateurs de WeChat, Feishu, Lark et QQ ayant scanné le QR code sont automatiquement ajoutés à la liste blanche |
| Message privé d'autres utilisateurs | Placé en file d'attente d'approbation dans les paramètres jusqu'à validation par un administrateur |
| Message privé après liaison QR sans identité transmise | Les liaisons QR de DingTalk et WeCom ne renvoient que les accès bot ; une validation dans les paramètres reste nécessaire |
| Message privé via identifiants manuels | Telegram, Discord, Slack ainsi que DingTalk, WeCom et QQ configurés manuellement nécessitent une approbation par utilisateur |
| Message privé sans identifiant (userId) | Rejeté systématiquement |
| Approbation d'outils | Répondez simplement `Approuver` ou `Refuser` (`Approve` / `Deny`) dans la conversation liée ; fonctionne en groupe comme en privé. Sans réponse sous 5 minutes, l'action est annulée en toute sécurité |
| Sélection interactive | Répondez avec le numéro de l'option ou son libellé ; séparez par des virgules pour les sélections multiples. En groupe, seul l'initiateur peut répondre |

## 📡 Canaux pris en charge

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

| Canal | Méthode de liaison | Réception | Envoi |
|---|---|---|---|
| **🔔 DingTalk** | QR Code / Manuel | Webhook | Webhook / Cartes interactives |
| **🐦 Feishu** | QR Code / Manuel | Long Polling / Événements | Open API / Messages interactifs |
| **🌐 Lark** | QR Code / Manuel | Long Polling / Événements | Open API / Messages interactifs |
| **💬 WeChat** | QR Code | Scrutation officielle | Protocole de synchronisation natif |
| **🏢 WeCom** | QR Code / Manuel | Rappel interne | Webhook / Messages enrichis |
| **🐧 QQ** | QR Code / Manuel | WebSocket officiel / Webhook | OpenAPI / Markdown enrichi |
| **✈️ Telegram** | Jeton de bot | Long Polling (getUpdates) | Telegram Bot API / Citations repliables |
| **🎮 Discord** | Jeton de bot | Passerelle WebSocket | API REST |
| **💬 Slack** | Bot Token & App Token | Socket Mode WebSocket | Web API / Block Kit |

## Entrée d'images et de fichiers

Transmettez captures d'écran, schémas ou pièces jointes (PDF, code, texte) directement dans la discussion. Le modèle de vision DSH les exploitera immédiatement. Les fichiers produits par vos tâches (archives ZIP, rapports, images) vous sont renvoyés sous forme de fichiers téléchargeables.

## Menu d'actions rapides

Saisissez `/menu` dans la conversation pour faire apparaître des boutons d'action permettant de basculer de session ou d'ajuster les modèles en un clic.

## Configuration de l'extension

Gérée depuis le panneau **Extensions → @michengai/dsh-im-connect** :

### 1. Emplacement du raccourci (`location`)
- **Défaut** : Paramètres uniquement (`settings`)
- **Options** : `both` (barre latérale et paramètres), `sidebar` (barre latérale seule), ou `settings` (menu des paramètres uniquement).

### 2. Afficher les sessions IM dans l'arbre des tâches (`taskTreeSessions`)
- **Défaut** : Désactivé (`false`)
- **Fonction** : Isole les échanges de messagerie de l'arborescence principale de développement pour préserver la lisibilité de vos projets.

### 3. Règle de déclenchement dans les groupes Telegram (`mentionPolicy` / `freeChatGroups`)
- **Défaut** : `addressed` (répond uniquement aux mentions @ et aux réponses directes).
- **Fonction** : Définissez une liste blanche de groupes pour autoriser les échanges continus sans mention explicite.

### 4. Affichage repliable de la réflexion (`thinkingDisplay`)
- **Défaut** : Désactivé (`off`)
- **Fonction** : Transmet le cheminement de pensée du modèle sous forme de bloc de citation repliable Telegram (`<blockquote expandable>`).

## Utilisation et commandes

Ouvrez **Paramètres → Assistant IM**, cliquez sur **Ajouter un compte** et configurez l'espace de travail, le modèle, les droits et le mode d'envoi.

| Objectif | Action | Remarques |
| --- | --- | --- |
| Ajouter un compte | Cliquez sur **Ajouter un compte** sous le canal souhaité | Plusieurs comptes autorisés |
| Modifier les réglages | Cliquez sur Paramètres sur la ligne du compte | Prise en compte immédiate |
| Pause de la réception | Désactivez le commutateur **Recevoir les messages** | Les identifiants sont conservés |
| Nouvelle session | Envoyez `/new` ou `/clear` | Démarre une session propre sur ce canal |
| État / Aide | Envoyez `/status` ou `/help` | Affiche la session active et les commandes |
| Profils d'agent | `/presets`, `/preset <numéro/ID>` | Bascule vers un profil prédéfini |
| Modèle et raisonnement | `/models`, `/model <nom>`, `/reasoning [niveau]` | Ajuste dynamiquement le modèle |
| Gestion des sessions | `/sessions`, `/session <numéro/ID>`, `/rename <titre>`, `/fork` | Liste, bascule, renomme ou duplique une session |
| Récupération des envois | `/delivery`, `/delivery retry <ID>` | Réexpédie les messages interrompus |

### Titrage automatique des sujets Telegram

Les sujets de forums Telegram sont automatiquement titrés à partir de la première réponse de l'assistant. Vous pouvez synchroniser le titre à tout moment avec `/rename <titre>`.

### Réponses fragmentées (Segments)

Permet de découper les longues réponses en plusieurs messages successifs pour une lecture plus naturelle sur smartphone (actuellement disponible sur QQ).

### Rotation de session après inactivité

Si aucun échange n'a eu lieu depuis une durée définie (ex. 1h, 6h), le message suivant ouvre automatiquement une nouvelle session propre.

### Intégration de Slack

1. Créez une application sur Slack API (`api.slack.com/apps`).
2. Dans **OAuth & Permissions → Bot Token Scopes**, octroyez les droits pour les messages, fichiers, réactions et mentions.
3. Installez l'application dans votre espace de travail et copiez le Bot Token (`xoxb-`).
4. Activez le **Socket Mode** et générez un jeton applicatif (`xapp-`).
5. Renseignez les deux jetons dans DSH pour établir une connexion WebSocket sécurisée.

## Sécurité et limites d'accès

- **API de gestion** : Déployée sur `/api/dsh-im-connect` sous l'authentification native de DSH.
- **Stockage des secrets** : Les jetons sont chiffrés et protégés dans les coffres système de l'hôte.
- **Validation des outils** : Autorisez les actions d'un simple message sans basculer sur la console web.

## Développement et tests

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-im-connect.git
cd dsh-im-connect
npm install
npm test
dsh plugin --profile web add .
```

## Licence

Consultez les recommandations de sécurité dans [SECURITY.md](SECURITY.md).
Distribué sous [Licence Apache 2.0](LICENSE).
