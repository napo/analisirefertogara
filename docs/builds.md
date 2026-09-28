# Build e distribuzione multipiattaforma (Tauri 2)

Il workflow GitHub Actions `Build applicazioni Tauri` (`.github/workflows/build-apps.yml`) compila in modo automatizzato i pacchetti nativi per tutti i principali sistemi operativi: **Windows**, **macOS**, **Linux**, **Android** e **iPhone/iPad (iOS/iPadOS)**.

---

## 1. Trigger e rilascio automatico

- **Push su `main` e Pull Request**: compila tutti i target e pubblica gli artefatti direttamente nei dettagli dell'esecuzione GitHub Actions.
- **Push di un tag di versione (`v*`, es. `v0.1.0`, `v1.0.0`)**: al termine della compilazione su tutte le matrici, un job dedicato raccoglie automaticamente tutti gli eseguibili, gli installer e i pacchetti, e crea una **GitHub Release** pubblica contenente le note di rilascio generate automaticamente e tutti i file pronti per il download.
- **Workflow Dispatch (esecuzione manuale)**: consente di avviare la compilazione in qualsiasi momento dall'interfaccia GitHub Actions, con l'opzione aggiuntiva per la firma automatica App Store di iOS.

---

## 2. Pacchetti generati e modalità d'uso

### Windows (x64)
- **File generati**:
  - `Referto-Volley_*.exe` (installer NSIS)
  - `Referto-Volley_*.msi` (installer MSI per ambienti enterprise o standard)
- **Firma**: non richiede firma a pagamento obbligatoria. Al primo avvio, Windows SmartScreen potrebbe mostrare un avviso di sicurezza: è sufficiente cliccare su *"Ulteriori informazioni"* e quindi su *"Esegui comunque"*.

### macOS (Apple Silicon e Intel)
- **File generati**:
  - `Referto-Volley_*_aarch64.dmg` (per Mac con Apple Silicon M1/M2/M3/M4)
  - `Referto-Volley_*_x64.dmg` (per Mac con processori Intel)
- **Firma**: compilati con firma *ad-hoc* (`APPLE_SIGNING_IDENTITY: '-'`), utilizzabili senza account sviluppatore Apple a pagamento. Al primo avvio su macOS, Gatekeeper potrebbe bloccare l'apertura: è sufficiente fare clic con il tasto destro sull'applicazione in Applicazioni, scegliere *Apri* e confermare.

### Linux (x64)
- **File generati**:
  - `Referto-Volley_*.deb` (pacchetto per Debian, Ubuntu, Linux Mint e derivate)
  - `Referto-Volley_*.AppImage` (eseguibile portatile standalone, compatibile con qualsiasi distribuzione Linux x86_64)
- **Installazione**:
  - `.deb`: `sudo dpkg -i Referto-Volley_*.deb` o doppio clic nell'installatore pacchetti.
  - `.AppImage`: assegnare i permessi di esecuzione (`chmod +x Referto-Volley_*.AppImage`) ed eseguire direttamente.

### Android (Smartphones e Tablet)
- **File generati** (multipiattaforma arm64/armv7/x86_64, nominati come le altre build):
  - con la chiave di release configurata: `Referto.Volley_X.Z.0_android-universal.apk` (APK firmato, installabile) e `Referto.Volley_X.Z.0_android-universal.aab` (per Google Play);
  - senza chiave: `Referto.Volley_X.Z.0_android-universal-debug.apk` (installabile) più APK/AAB release con suffisso `-unsigned`.
- **Uso senza firma**: l'APK debug è **immediatamente installabile** su qualsiasi smartphone o tablet Android: è sufficiente scaricare il file `.apk` sul dispositivo, abilitare l'installazione da origini sconosciute nelle impostazioni del browser o del gestore file e installare.
- **Firma di produzione (opzionale)**: per pubblicare su Google Play Store o firmare con chiave privata propria, impostare i 4 secret di repository:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`

### iPhone e iPad (iOS / iPadOS)
- **File generati**:
  - `Referto-Volley-iOS-unsigned.ipa` (pacchetto IPA pronto per sideloading senza account a pagamento)
  - `Referto-Volley-iOS-dispositivo-non-firmato.tar.gz` (bundle Xcode per build da macOS)
  - `Referto-Volley-iOS-simulatore.tar.gz` (bundle per test su iOS Simulator)
- **Installazione su iPhone/iPad fisici**:
  - L'IPA non firmato può essere installato direttamente su qualsiasi iPhone o iPad tramite strumenti di sideloading standard come **AltStore**, **Sideloadly**, **TrollStore** o tramite **Xcode** collegando il dispositivo via USB.
- **Distribuzione App Store (opzionale)**:
  - Tramite esecuzione manuale `workflow_dispatch` con l'opzione `signed_ios: true`, è possibile firmare automaticamente l'IPA configurando i secret Apple: `APPLE_DEVELOPMENT_TEAM`, `APPLE_API_ISSUER`, `APPLE_API_KEY` e `APPLE_API_PRIVATE_KEY`.

---

## 3. Gestione versioni e identificativo

- **Identificativo applicazione**: `it.napolitano.refertovolley` (definito in `src-tauri/tauri.conf.json`).
- **Versione**: unica sorgente è il campo `version` del `package.json` nella radice (semver `X.Z.0`, mostrata come `X.Z` nel footer dell'app e nei PDF). `scripts/bump-version.mjs` la sincronizza in `webapp/package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` e `src-tauri/Cargo.lock`.
- **Aggiornamento automatico**: gli hook in `.githooks/` incrementano `Z` a ogni commit (`pre-commit`), partendo dal valore più alto fra `package.json` e l'ultimo tag `vX.Z` su GitHub, e creano il tag annotato `vX.Z` (`post-commit`). Con `push.followTags` il tag parte con la normale `git push` e avvia la Release. Attivazione, una volta per clone:
  ```bash
  npm run setup-hooks
  ```
- **Nuova versione major** (`X+1.0`): `npm run version:major`, poi commit dei file modificati (l'hook non incrementa di nuovo).
- **Commit senza nuova versione**: `SKIP_VERSION_BUMP=1 git commit ...`; con `git commit --amend` la versione non viene incrementata.

---

## Aggiornamenti automatici delle applicazioni

All’avvio le applicazioni installate controllano se è uscita una nuova versione e mostrano un avviso: l’utente sceglie **Aggiorna ora** o **Più tardi**. Il controllo si può disattivare nella pagina Informazioni. Viene chiesto a GitHub solo il numero dell’ultima versione: nessun dato delle gare lascia il dispositivo.

- **Windows, macOS, Linux (AppImage e .deb)**: plugin ufficiale `tauri-plugin-updater`. L’app legge `https://github.com/napo/analisirefertogara/releases/latest/download/latest.json`, scarica il pacchetto della propria piattaforma, ne verifica la firma con la chiave pubblica contenuta nell’app, lo installa e si riavvia. Su Linux l’aggiornamento del `.deb` chiede la password di amministratore (finestra `pkexec`).
- **Android e iPhone/iPad**: il plugin non esiste su mobile. L’app legge l’ultima release dall’API di GitHub e, se è più nuova, l’avviso apre il download dell’APK (o la pagina della release su iPhone): l’installazione si conferma come la prima volta.
- **Web**: sempre aggiornata, nessun controllo.

### Come viene prodotto

- `bundle.createUpdaterArtifacts: true` in `src-tauri/tauri.conf.json`: la build desktop produce, accanto a ogni installer, la firma `.sig` e su macOS l’archivio `.app.tar.gz`.
- `scripts/collect-desktop.mjs` raccoglie i pacchetti di ogni target in `desktop-dist/` con nomi senza spazi; l’archivio macOS prende l’architettura nel nome (`_aarch64`, `_x64`), altrimenti le due build Mac avrebbero lo stesso file.
- Nel job di release `scripts/updater-manifest.mjs` genera `latest.json` con le voci `windows-x86_64-nsis`/`-msi`, `darwin-aarch64-app`, `darwin-x86_64-app`, `linux-x86_64-appimage`, `linux-x86_64-deb` (più le voci generiche `<os>-<arch>`), solo per i pacchetti firmati, e lo pubblica nella release.

### Chiave di firma degli aggiornamenti

- Chiave privata e password: `~/.tauri-keys/referto-volley-updater.key` e `~/.tauri-keys/referto-volley-updater.password` sulla macchina del maintainer, e come secret del repository `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Chiave pubblica: `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
- **Conservarne una copia sicura** (come per il keystore Android): senza la chiave privata le applicazioni già installate non possono più aggiornarsi da sole e andrebbero reinstallate a mano.
- Senza i secret (per esempio nelle pull request da fork) la build desktop procede senza i file di aggiornamento.

## Archivio delle gare (.zrv)

Le applicazioni desktop registrano l’estensione `.zrv` ("zip referto volley", tipo `application/vnd.referto-volley+zip`). Il file è un archivio ZIP documentato; per ora si importa con **Ripristina archivio** dall’elenco dei referti o dallo Storico.
