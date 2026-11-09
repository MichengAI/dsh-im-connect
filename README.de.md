<p align="center">
  <img src="assets/branding/dsh-banner.png" alt="DSH IM Connect" width="100%">
</p>

<div align="center">

  # DSH IM Connect

  **Verbinden Sie Feishu, Lark, DingTalk, WeCom, WeChat, QQ, Telegram, Discord und Slack mit Ihrem lokalen DeepSeek Harness-Agenten**

  [简体中文](README.zh-CN.md) · [English](README.en.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

  [Änderungsprotokoll](CHANGELOG.md) · [Lizenz](LICENSE)

  [![Lizenz: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
  [![npm-Paket](https://img.shields.io/npm/v/%40michengai%2Fdsh-im-connect.svg?label=npm%20package)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![npm-Downloads](https://img.shields.io/npm/dt/%40michengai%2Fdsh-im-connect.svg?label=npm%20downloads)](https://www.npmjs.com/package/@michengai/dsh-im-connect)
  [![DSH Web Plugin](https://img.shields.io/badge/DSH%20Web-Plugin-0f766e.svg)](https://github.com/MichengAI/dsh-im-connect)
  [![Node.js 22 oder neuer](https://img.shields.io/badge/Node.js-22%20or%20later-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Kanäle](https://img.shields.io/badge/channels-9-238636.svg)](#-unterstützte-kanäle)
</div>

> DSH IM Connect ist ein von der Community gepflegtes Plugin für DeepSeek Harness (DSH) und kein offizielles Produkt von DeepSeek AI.

## Funktionsübersicht

Auch wenn Sie nicht am Computer sitzen, können Sie über Ihren gewohnten Messenger Aufgaben an Ihr lokales DSH übergeben, Antworten erhalten, Rückfragen beantworten und Werkzeug-Genehmigungen direkt im Chat durchführen.

- **Unterstützung führender Messenger**: DingTalk, Feishu, Lark, WeChat, WeCom, QQ, Telegram, Discord und Slack.
- **Individuelle Kontenverwaltung**: Fügen Sie mehrere Konten pro Dienst hinzu und konfigurieren Sie Arbeitsbereich, Modell, Denkaufwand, Berechtigungen und Versandmodi individuell.
- **Mobile Aufgabensteuerung**: Aufgaben senden, Antworten lesen und Auswahlen treffen. Autorisierte Benutzer können Tool-Aufrufe direkt in privaten Chats genehmigen oder ablehnen.
- **Isolierte Sitzungen**: Jeder Messenger-Chat ist einer eigenen Sitzung zugeordnet und im Web-Arbeitsbereich unter „Kanäle“ einsehbar.
- **Einfache Verbindung via QR-Code oder Anmeldedaten**: Schnell eingerichtet unter „Einstellungen → IM-Assistent“ mit vollständiger Kontrolle über den Nachrichtenempfang.
- **Präzise Zugriffskontrolle**: Gruppenchats reagieren auf @Erwähnungen; Direktnachrichten folgen den hinterlegten Richtlinien.

## Wer kann den Assistenten steuern?

Eingehende Nachrichten werden anhand des Absenders geprüft, bevor Befehle oder Werkzeug-Genehmigungen ausgeführt werden.

| Anwendungsfall | Verhalten |
|---|---|
| Gruppe ohne @Erwähnung des Bots | Wird ignoriert; keine Antwort oder Genehmigungsanfrage. Erwähnungen anderer Mitglieder lösen nichts aus |
| Gruppe mit expliziter @Erwähnung | Keine Kopplung erforderlich: Jedes Gruppenmitglied kann Aufgaben anstoßen |
| Direktnachricht vom QR-Scanner | Nutzer von WeChat, Feishu, Lark und QQ, die den QR-Code gescannt haben, landen automatisch auf der Whitelist |
| Direktnachricht von anderen Nutzern | Landet in der Warteliste der Einstellungen, bis ein Administrator die Freigabe erteilt |
| Direktnachricht nach QR-Kopplung ohne Identität | QR-Kopplungen bei DingTalk und WeCom liefern nur Bot-Zugangsdaten; der Nutzer muss freigegeben werden |
| Direktnachricht mit manuellen Anmeldedaten | Telegram, Discord, Slack sowie manuell konfigurierte Konten erfordern für jeden privaten Chat eine Freigabe |
| Direktnachricht ohne userId | Wird abgewiesen |
| Werkzeug-Genehmigung | Antworten Sie mit `Genehmigen` oder `Ablehnen` (`Approve` / `Deny`) im verknüpften Chat. Erfolgt innerhalb von 5 Minuten keine Antwort, wird die Aktion sicher abgebrochen |
| Interaktive Auswahl | Antworten Sie mit der Ziffer oder dem Text der gewünschten Option. Bei Gruppenchats darf nur der Aufgabeninitiator antworten |

## 📡 Unterstützte Kanäle

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

| Kanal | Kopplungsmethode | Empfang | Versand |
|---|---|---|---|
| **🔔 DingTalk** | QR-Code / Manuell | Webhook | Webhook / Interaktive Karten |
| **🐦 Feishu** | QR-Code / Manuell | Long Polling / Events | Open API / Interaktive Nachrichten |
| **🌐 Lark** | QR-Code / Manuell | Long Polling / Events | Open API / Interaktive Nachrichten |
| **💬 WeChat** | QR-Code | Offizielles Synchron-Polling | Natives Synchronisationsprotokoll |
| **🏢 WeCom** | QR-Code / Manuell | Interne Rückrufe | Webhook / Formatierte Karten |
| **🐧 QQ** | QR-Code / Manuell | Offizielles WebSocket / Webhook | OpenAPI / Rich Markdown |
| **✈️ Telegram** | Bot-Token | Long Polling (getUpdates) | Telegram Bot API / Einklappbare Zitate |
| **🎮 Discord** | Bot-Token | Gateway-WebSocket | REST-API |
| **💬 Slack** | Bot-Token & App-Token | Socket Mode WebSocket | Web-API / Block Kit |

## Bild- und Dateiverarbeitung

Senden Sie Screenshots, Diagramme oder Dokumente direkt in den Chat. Das Vision-Modell von DSH verarbeitet sie unmittelbar zusammen mit Ihren Arbeitsanweisungen. Generierte Ergebnisse (ZIP-Archive, Berichte, Bilder) werden als herunterladbare Dateien zurückgesendet.

## Schnelles Aktionsmenü

Geben Sie `/menu` im Chat ein, um interaktive Schaltflächen aufzurufen, mit denen Sie Sitzungen wechseln oder Modelle mit einem Fingertipp anpassen können.

## Plugin-Konfiguration

Erreichbar über die Verwaltung unter **Plugins → @michengai/dsh-im-connect**:

### 1. Position der Verknüpfung (`location`)
- **Standard**: Nur Einstellungen (`settings`)
- **Optionen**: `both` (Seitenleiste & Einstellungen), `sidebar` (nur Seitenleiste) oder `settings` (nur globales Einstellungsmenü).

### 2. IM-Sitzungen im Aufgabenbaum anzeigen (`taskTreeSessions`)
- **Standard**: Deaktiviert (`false`)
- **Funktion**: Filtert Messenger-Chats aus der Hauptbaumansicht heraus, um die Übersichtlichkeit im täglichen Entwicklungsalltag zu wahren.

### 3. Update-Sperre über Cordis-Konfiguration (`updater` / `onlineUpdate`)
- **Standard**: Nicht gesperrt (`undefined`)
- **Funktion**: Für isolierte Unternehmensnetzwerke kann der interne Update-Endpunkt über `cordis.patch.yml` dauerhaft deaktiviert werden:
  ```yaml
  - id: im-connect
    config:
      updater: false # oder onlineUpdate: false
  ```
  Nach der Sperrung liefert der Endpunkt HTTP 403 und überlässt die Versionsverwaltung vollständig dem offiziellen DSH-Paketmanager.

### 4. Auslöserichtlinie für Telegram-Gruppen (`mentionPolicy` / `freeChatGroups`)
- **Standard**: `addressed` (reagiert nur auf @Erwähnungen oder direkte Antworten).
- **Funktion**: Erlaubt die Festlegung von Whitelist-Gruppen für die direkte Kommunikation ohne @Erwähnung.

### 5. Einklappbare Denkprozess-Anzeige (`thinkingDisplay`)
- **Standard**: Aus (`off`)
- **Funktion**: Übermittelt den Denkprozess des Modells auf Telegram als einklappbaren Zitatblock (`<blockquote expandable>`).

## Nutzung und Befehle

Öffnen Sie **Einstellungen → IM-Assistent**, wählen Sie **Konto hinzufügen** und konfigurieren Sie Arbeitsbereich, Modell, Berechtigungen und Versandmodus.

| Ziel | Aktion | Hinweise |
| --- | --- | --- |
| Konto hinzufügen | Auf **Konto hinzufügen** unter dem gewünschten Kanal klicken | Mehrere Konten pro Kanal möglich |
| Einstellungen bearbeiten | Auf „Einstellungen“ in der Kontozeile klicken | Sofort wirksam |
| Empfang anhalten | Schalter **Nachrichten empfangen** deaktivieren | Zugangsdaten bleiben erhalten |
| Neue Sitzung | `/new` oder `/clear` senden | Startet eine frische Sitzung |
| Status / Hilfe | `/status` oder `/help` senden | Zeigt aktive Sitzung und Befehle |
| Agenten-Voreinstellungen | `/presets`, `/preset <Nummer/ID>` | Wechselt das Agentenprofil |
| Modell & Denkaufwand | `/models`, `/model <Name>`, `/reasoning [Stufe]` | Passt das Modell zur Laufzeit an |
| Sitzungsverwaltung | `/sessions`, `/session <Nummer/ID>`, `/rename <Titel>`, `/fork` | Sitzungen auflisten, wechseln, umbenennen oder forken |
| Zustellwiederherstellung | `/delivery`, `/delivery retry <ID>` | Sendet unterbrochene Nachrichten erneut |

### Automatische Telegram-Themenbenennung

Foren-Themen in Telegram werden automatisch anhand des ersten Antworttitels benannt. Eine manuelle Synchronisation ist jederzeit über `/rename <Titel>` möglich.

### Segmentierte Antworten

Ermöglicht das Aufteilen langer Antworten in mehrere aufeinanderfolgende kurze Nachrichten für bessere Lesbarkeit auf Smartphones (derzeit auf QQ aktiv).

### Automatische Sitzungsrotation

Wenn seit der letzten Nachricht eine konfigurierte Zeitspanne vergangen ist (z. B. 1 Stunde, 6 Stunden), startet die nächste Nachricht automatisch eine neue Sitzung.

### Slack-Anbindung

1. Erstellen Sie eine App unter Slack API (`api.slack.com/apps`).
2. Unter **OAuth & Permissions → Bot Token Scopes** Berechtigungen für Nachrichten, Dateien, Reaktionen und Erwähnungen erteilen.
3. Installieren Sie die App und kopieren Sie das Bot-Token (`xoxb-`).
4. Aktivieren Sie den **Socket Mode** und generieren Sie ein App-Level-Token (`xapp-`).
5. Hinterlegen Sie beide Token in DSH für eine sichere WebSocket-Verbindung.

## Sicherheit und Zugriffsgrenzen

- **Verwaltungs-API**: Läuft unter `/api/dsh-im-connect` mit nativer Sitzungsauthentifizierung.
- **Schlüsselspeicher**: Anmeldedaten werden verschlüsselt im Tresor des Hosts verwaltet.
- **Werkzeug-Genehmigung**: Erlaubt die sichere Autorisierung direkt im Chat ohne Browser-Wechsel.

## Entwicklung und Tests

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
git clone https://github.com/MichengAI/dsh-im-connect.git
cd dsh-im-connect
npm install
npm test
dsh plugin --profile web add .
```

## Lizenz

Sicherheitsrichtlinien finden Sie unter [SECURITY.md](SECURITY.md).
Lizenziert unter [Apache License 2.0](LICENSE).
