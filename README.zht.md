<p align="center">
  <a href="https://onenas.atlasflux.my">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="onenas logo">
    </picture>
  </a>
</p>
<p align="center">開源的 AI Coding Agent。</p>
<p align="center">
  <a href="https://onenas.atlasflux.my/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/onenas-code"><img alt="npm" src="https://img.shields.io/npm/v/onenas-code?style=flat-square" /></a>
  <a href="https://github.com/muhdnabil66/onenas-code/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/muhdnabil66/onenas-code/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![onenas Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://onenas.atlasflux.my)

---

### 安裝

```bash
# 直接安裝 (YOLO)
curl -fsSL https://onenas.atlasflux.my/install | bash

# 套件管理員
npm i -g onenas-code@latest        # 也可使用 bun/pnpm/yarn
scoop install onenas             # Windows
choco install onenas             # Windows
brew install anomalyco/tap/onenas # macOS 與 Linux（推薦，始終保持最新）
brew install onenas              # macOS 與 Linux（官方 brew formula，更新頻率較低）
sudo pacman -S onenas            # Arch Linux (Stable)
paru -S onenas-bin               # Arch Linux (Latest from AUR)
mise use -g onenas               # 任何作業系統
nix run nixpkgs#onenas           # 或使用 github:muhdnabil66/onenas-code 以取得最新開發分支
```

> [!TIP]
> 安裝前請先移除 0.1.x 以前的舊版本。

### 桌面應用程式 (BETA)

onenas 也提供桌面版應用程式。您可以直接從 [發佈頁面 (releases page)](https://github.com/muhdnabil66/onenas-code/releases) 或 [onenas.ai/download](https://onenas.atlasflux.my/download) 下載。

| 平台                  | 下載連結                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `onenas-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `onenas-desktop-mac-x64.dmg`     |
| Windows               | `onenas-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, 或 AppImage        |

```bash
# macOS (Homebrew Cask)
brew install --cask onenas-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/onenas-desktop
```

#### 安裝目錄

安裝腳本會依據以下優先順序決定安裝路徑：

1. `$onenas_INSTALL_DIR` - 自定義安裝目錄
2. `$XDG_BIN_DIR` - 符合 XDG 基礎目錄規範的路徑
3. `$HOME/bin` - 標準使用者執行檔目錄 (若存在或可建立)
4. `$HOME/.onenas/bin` - 預設備用路徑

```bash
# 範例
onenas_INSTALL_DIR=/usr/local/bin curl -fsSL https://onenas.atlasflux.my/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://onenas.atlasflux.my/install | bash
```

### Agents

onenas 內建了兩種 Agent，您可以使用 `Tab` 鍵快速切換。

- **build** - 預設模式，具備完整權限的 Agent，適用於開發工作。
- **plan** - 唯讀模式，適用於程式碼分析與探索。
  - 預設禁止修改檔案。
  - 執行 bash 指令前會詢問權限。
  - 非常適合用來探索陌生的程式碼庫或規劃變更。

此外，onenas 還包含一個 **general** 子 Agent，用於處理複雜搜尋與多步驟任務。此 Agent 供系統內部使用，亦可透過在訊息中輸入 `@general` 來呼叫。

了解更多關於 [Agents](https://onenas.atlasflux.my/docs/agents) 的資訊。

### 線上文件

關於如何設定 onenas 的詳細資訊，請參閱我們的 [**官方文件**](https://onenas.atlasflux.my/docs)。

### 參與貢獻

如果您有興趣參與 onenas 的開發，請在提交 Pull Request 前先閱讀我們的 [貢獻指南 (Contributing Docs)](./CONTRIBUTING.md)。

### 基於 onenas 進行開發

如果您正在開發與 onenas 相關的專案，並在名稱中使用了 "onenas"（例如 "onenas-dashboard" 或 "onenas-mobile"），請在您的 README 中加入聲明，說明該專案並非由 onenas 團隊開發，且與我們沒有任何隸屬關係。

---

**加入我們的社群** [飞书](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=52ao9352-5623-4fa0-b7dd-3407c392c1af&qr_code=true) | [X.com](https://x.com/onenas)
