<p align="center">
  <a href="https://onenas.atlasflux.my">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="onenas logo">
    </picture>
  </a>
</p>
<p align="center">AI-kodeagent med åpen kildekode.</p>
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

### Installasjon

```bash
# YOLO
curl -fsSL https://onenas.atlasflux.my/install | bash

# Pakkehåndterere
npm i -g onenas-code@latest        # eller bun/pnpm/yarn
scoop install onenas             # Windows
choco install onenas             # Windows
brew install anomalyco/tap/onenas # macOS og Linux (anbefalt, alltid oppdatert)
brew install onenas              # macOS og Linux (offisiell brew-formel, oppdateres sjeldnere)
sudo pacman -S onenas            # Arch Linux (Stable)
paru -S onenas-bin               # Arch Linux (Latest from AUR)
mise use -g onenas               # alle OS
nix run nixpkgs#onenas           # eller github:muhdnabil66/onenas-code for nyeste dev-branch
```

> [!TIP]
> Fjern versjoner eldre enn 0.1.x før du installerer.

### Desktop-app (BETA)

onenas er også tilgjengelig som en desktop-app. Last ned direkte fra [releases-siden](https://github.com/muhdnabil66/onenas-code/releases) eller [onenas.ai/download](https://onenas.atlasflux.my/download).

| Plattform             | Nedlasting                         |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `onenas-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `onenas-desktop-mac-x64.dmg`     |
| Windows               | `onenas-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm` eller AppImage      |

```bash
# macOS (Homebrew)
brew install --cask onenas-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/onenas-desktop
```

#### Installasjonsmappe

Installasjonsskriptet bruker følgende prioritet for installasjonsstien:

1. `$onenas_INSTALL_DIR` - Egendefinert installasjonsmappe
2. `$XDG_BIN_DIR` - Sti som følger XDG Base Directory Specification
3. `$HOME/bin` - Standard brukerbinar-mappe (hvis den finnes eller kan opprettes)
4. `$HOME/.onenas/bin` - Standard fallback

```bash
# Eksempler
onenas_INSTALL_DIR=/usr/local/bin curl -fsSL https://onenas.atlasflux.my/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://onenas.atlasflux.my/install | bash
```

### Agents

onenas har to innebygde agents du kan bytte mellom med `Tab`-tasten.

- **build** - Standard, agent med full tilgang for utviklingsarbeid
- **plan** - Skrivebeskyttet agent for analyse og kodeutforsking
  - Nekter filendringer som standard
  - Spør om tillatelse før bash-kommandoer
  - Ideell for å utforske ukjente kodebaser eller planlegge endringer

Det finnes også en **general**-subagent for komplekse søk og flertrinnsoppgaver.
Den brukes internt og kan kalles via `@general` i meldinger.

Les mer om [agents](https://onenas.atlasflux.my/docs/agents).

### Dokumentasjon

For mer info om hvordan du konfigurerer onenas, [**se dokumentasjonen**](https://onenas.atlasflux.my/docs).

### Bidra

Hvis du vil bidra til onenas, les [contributing docs](./CONTRIBUTING.md) før du sender en pull request.

### Bygge på onenas

Hvis du jobber med et prosjekt som er relatert til onenas og bruker "onenas" som en del av navnet; for eksempel "onenas-dashboard" eller "onenas-mobile", legg inn en merknad i README som presiserer at det ikke er bygget av onenas-teamet og ikke er tilknyttet oss på noen måte.

---

**Bli med i fellesskapet** [Discord](https://discord.gg/onenas) | [X.com](https://x.com/onenas)
