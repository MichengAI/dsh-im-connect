<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Feishu、Lark、DingTalk、WeCom、WeChat、QQ、Telegram、Discord、Slack をローカルの DeepSeek Harness に接続**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [更新履歴](CHANGELOG.md) · [ライセンス](LICENSE)

  [![ライセンス: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm package](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![npm ダウンロード数](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Channels](https://img.shields.io/badge/channels-9-238636.svg)](#-対応チャネル)
</div>

> DSH IM Connect はコミュニティによって保守されている DeepSeek Harness (DSH) プラグインであり、DeepSeek AI の公式製品ではありません。

## 機能概要

PCの前にいなくても、普段お使いのメッセージングアプリからローカルの DSH にタスクを依頼し、同一チャット内で返信の確認、質問への回答、ツールの実行承認を行えます。

- **主要なメッセージングプラットフォームに対応**: DingTalk、Feishu、Lark、WeChat、WeCom、QQ、Telegram、Discord、Slack。
- **アカウントごとの個別設定**: 同一プラットフォームで複数のアカウントを追加可能。ワークスペース、モデル、推論強度、権限、プライベートアクセス設定、送信方式を個別に選択できます。
- **スマートフォンからタスクを操作**: 指示の送信、返信の確認、単一・複数選択の質問への回答が可能。承認済みユーザーはプライベートチャットでツールの承認・拒否を行えます。
- **チャット履歴を独立管理**: メッセージングチャットごとに独立したセッションが割り当てられ、Web ワークスペースの「チャンネル」から振り返ることができます。
- **QRコードまたは認証情報で簡単接続**: 「設定 → IM アシスタント」で接続し、アカウントごとにメッセージ受信を制御できます。
- **アクセス権限の柔軟な制御**: グループチャットは @メンションで起動し、ダイレクトメッセージ (DM) はアカウントのアクセス設定に従います。

## アシスタントを操作できるユーザー

受信メッセージは送信者を確認した上で、コマンド、ツール承認、インジェクションの処理を行います。

| 利用シナリオ | 動作 |
|---|---|
| ボットへの @メンションがないグループチャット | 無視され、返信や承認リクエストは生成されません。他のメンバーへの @メンションでも反応しません |
| ボットへの @メンションがあるグループチャット | 連携不要で、誰でもタスクを指示できます |
| DM（QRコードをスキャンしたユーザー） | WeChat / Feishu / Lark / QQ のスキャン者は自動的にホワイトリストに登録され、直接対話可能です |
| DM（その他のユーザー） | 承認待ちリストに入り、管理者が設定画面で承認するまで利用できません |
| DM（ユーザー情報が返されないQR連携） | DingTalk / WeCom のクイック連携はボット情報のみを取得するため、スキャン者も設定画面での承認が必要です |
| DM（手動で認証情報を入力した場合） | Telegram、Discord、Slack、および手動設定の DingTalk / WeCom / QQ では、すべてのDMで事前の承認が必要です |
| DM（userId が欠落している場合） | 拒否されます |
| ツールの実行承認 | そのセッションにバインドされているチャットで「承認 / 拒否」と返信します。DM・グループの双方で有効で、Web画面を開く必要はありません。5分以内に返信がない場合はキャンセル扱いとなり、その間のテキストは次のターンに持ち越されません |
| インタラクティブな選択 | 元のチャットで選択肢の番号またはテキストを返信します。複数選択はカンマ区切りで入力でき、自由記述の回答も可能です。グループではタスク開始者のみ回答できます |

WeChat はQRコード連携のみでDMにのみ対応しているため、スキャンした**同一の WeChat アカウント**ですぐに利用できます。別のアカウントから送信された場合は設定画面の承認待ちリストに表示されます。

## 📡 対応チャネル

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

| チャネル | 接続方式 | 受信方法 | 送信方法 |
|---|---|---|---|
| **🔔 DingTalk** | QRコードスキャン / 手動凭証 | Webhook | Webhook / カード返信 |
| **🐦 Feishu** | QRコードスキャン / 手動凭証 | 長時間ポーリング / イベント | Open API / カードメッセージ |
| **🌐 Lark** | QRコードスキャン / 手動凭証 | 長時間ポーリング / イベント | Open API / カードメッセージ |
| **💬 WeChat** | QRコードスキャン | 公式同期ポーリング | 組み込み同期プロトコル |
| **🏢 WeCom** | QRコードスキャン / 手動凭証 | 内部コールバック | Webhook / カードメッセージ |
| **🐧 QQ** | QRコードスキャン / 手動凭証 | 公式 WebSocket / Webhook | OpenAPI / リッチテキスト |
| **✈️ Telegram** | Bot Token | 長時間ポーリング (getUpdates) | Telegram Bot API / 折畳引用 |
| **🎮 Discord** | Bot Token | Gateway WebSocket | REST API |
| **💬 Slack** | Bot Token & App Token | Socket Mode WebSocket | Web API / Block Kit |

## 画像の入力

日常のスクリーンショット、写真、図面をチャットに送信すると、自動的に DSH のビジョンモデルに渡され、分析・回答が行われます。

- チャットで画像を直接送信できます。
- 画像と一緒にテキストを送信すると、画像の指示プロンプトとして認識されます。

## ファイルの入力

PDF、コードファイル、ドキュメントなどの添付ファイルを直接送信して解析できます。

## ファイルの配信

DSH が作業成果としてファイルを生成した場合（ZIP、画像、テキストなど）、チャットアプリへ直接ファイルとして返送されます。

## アクションメニュー

チャット内で `/menu` と入力すると、対話型ボタンメニューが表示され、セッションの切り替えや新規作成、モデルの変更がワンタップで行えます。

## メッセージの進捗通知

モデルの推論中やツールの実行中に、進行状況や思考プロセスがチャット内にリアルタイムで表示されます。

## 接続診断

各アカウントの詳細設定画面から「接続テスト」を実行すると、ネットワーク疎通性、認証の有効性、API権限が数秒で自己診断されます。

## スクリーンショット

| 設定パネル | チャンネル一覧 | アカウント設定 |
|---|---|---|
| ![設定](assets/screenshots/im-settings.png) | ![チャンネル](assets/screenshots/im-channels.png) | ![アカウント](assets/screenshots/im-account.png) |

## DSH プロダクトエコシステム

DSH IM Connect は DeepSeek Harness の公式拡張規約に従い、ワークスペース、セッション、言語、権限システムと緊密に連携します。

## 前提条件

- **Node.js**: 22 以降
- **DeepSeek Harness**: 0.2.0-rc.1 以降（Web および Desktop）
- 各メッセージングプラットフォームの有効なボットアカウントまたは認証情報

## インストール

### エージェントに依頼してインストール（推奨）

DSH のチャット入力欄で以下のように依頼します：
> 「DSH IM Connect プラグインをインストールして」

### 公式 npm レジストリから手動インストール

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
dsh plugin --profile web add @michengai/dsh-im-connect --registry=https://registry.npmjs.org/
```

## プラグイン設定

設定は「プラグイン」→「@michengai/dsh-im-connect」の管理パネルから行えます。

### 1. ナビゲーションの表示位置 (`location`)
- **デフォルト**: 設定のみ (`settings`)
- **機能**: 左側サイドバー常駐アイコン、または「設定 → IM アシスタント」の表示場所を切り替えます。
  - **両方表示 (`both`)**: 左側メインサイドバーと設定画面の両方にエントリーを保持します。
  - **サイドバーのみ (`sidebar`)**: 左側メインサイドバーにのみ表示します。
  - **設定のみ (`settings`)**: サイドバーアイコンを解除し、「設定 → IM アシスタント」のみに表示します。

### 2. タスクツリーに IM セッションを表示 (`taskTreeSessions`)
- **デフォルト**: 無効 (`false`)
- **機能**: メインワークスペースのタスクツリーに IM セッションを表示するかどうかを切り替えます。無効にすることで、高頻度なチャットが通常の開発タスク一覧を圧迫するのを防ぎます。


### 4. Telegram グループ起動ポリシー (`mentionPolicy` / `freeChatGroups`)
- **デフォルト**: `addressed`（ボットへの @メンションまたは返信時のみ応答）
- **機能**: グループチャットで @メンションなしでも応答させたい場合、「設定 → IM アシスタント → Telegram アカウント詳細」から設定できます。
  - **特定グループのみ**: `freeChatGroups` にグループIDをカンマ区切りで入力します。
  - **すべてのグループ**: `mentionPolicy` を `always` に設定します。

### 5. 思考プロセスの折りたたみ表示 (`thinkingDisplay`)
- **デフォルト**: オフ (`off`)
- **機能**: モデルの思考プロセスを Telegram の折りたたみ引用ブロック（`<blockquote expandable>`）として送信し、タップで展開できるようにします。

## 使用方法

「設定 → IM アシスタント」を開き、対象チャネルの「アカウント追加」を選択し、ワークスペース、モデル、権限、アクセスモード、送信方式を設定します。

| 目的 | 操作 | 備考 |
| --- | --- | --- |
| アカウント追加 | チャネル下の「アカウント追加」をクリックし、QRスキャンまたは認証情報を入力 | 同一チャネルに複数アカウントを追加可能 |
| 設定変更 | アカウント行の「設定」をクリックし、ワークスペースやモデルを変更 | 即時反映 |
| 受信一時停止 | アカウント行の「メッセージ受信」トグルをオフ | 認証情報は保持されます |
| IM から指示送信 | チャットアプリから直接メッセージを送信 | セッションごとに独立 |
| 入力の結合 | 末尾に `..` を付けると追加入力を待機、`!!` で即時送信 | デフォルト結合時間は約5秒 |
| 新規セッション | `/new` または `/clear` を送信 | 新しいセッションを作成して切り替え |
| 状態 / ヘルプ | `/status` または `/help` を送信 | 現在のセッションと利用可能コマンド一覧 |
| プリセット選択 | `/presets`, `/preset <番号/ID>` | エージェントプリセットの切り替え |
| モデル / 推論 | `/models`, `/model <名前>`, `/reasoning [強度]` | モデルおよび推論強度の動的変更 |
| セッション管理 | `/sessions`, `/session <番号/ID>`, `/rename <名前>`, `/fork` | セッション一覧、切り替え、名前変更、分岐 |
| 配信復旧 | `/delivery`, `/delivery retry <ID>` | 配信失敗メッセージの再送 |

### Telegram トピック命名

Telegram のフォーラムトピックは最初のセッションタイトルから自動的に命名されます。手動変更は `/rename <タイトル>` で即時同期できます。

### 分割送信（セグメント返信）

長文の返信を段落ごとに複数の短いメッセージに分割して順次送信します（現在 QQ に対応）。

### アイドルセッションの自動ローテーション

前回の発言から一定時間（例：30分、2時間など）が経過した場合、次回の発言時に自動的に新しいセッションを開始します。

### Slack の接続手順

1. Slack API (`api.slack.com/apps`) で新規アプリを作成します。
2. **Bot Token Scopes** に `chat:write`, `reactions:write`, `files:read`, `files:write`, `im:history`, `channels:history`, `groups:history`, `app_mentions:read` を付与します。
3. アプリをワークスペースにインストールし、`xoxb-` で始まるボットトークンを取得します。
4. **Socket Mode** を有効化し、`connections:write` 権限のアプリレベルトークン (`xapp-`) を生成します。
5. **Event Subscriptions** を有効化し、ボットイベントを購読します。
6. DSH の設定画面に両トークンを入力して接続します。

## 権限とセキュリティ境界

コマンド実行権限とDMアクセス承認は独立して管理されます。
- **管理 API**: `/api/dsh-im-connect` は DSH の標準セッション検証に従い、外部からの不正アクセスを遮断します。
- **秘密情報**: トークンや秘密鍵は DSH のセキュアストレージに保管され、ブラウザやログに平文で漏洩することはありません。
- **ツール承認**: セッションにバインドされたチャット内で安全に承認でき、Web を開く手間を省きます。

## 開発

### ソースコードからのインストール

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-im-connect.git
cd dsh-im-connect
npm install
npm test
dsh plugin --profile web add .
```

### サイドバー協調プロトコル

IM とオートメーションプラグインは `sidebar.workspaces` スロットと `__dshNativeTabs` レジストリを介してタブを協調共有します。

## テストと検証

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
npm test
```

## ライセンス

セキュリティガイドラインは [SECURITY.md](SECURITY.md) を参照してください。

本プロジェクトは [Apache License 2.0](LICENSE) のもとで公開されています。
