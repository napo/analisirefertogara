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
- **File generati**:
  - `app-*-debug.apk` (APK di debug, multipiattaforma arm64/armv7/x86_64)
  - `app-*-release.apk` e `app-*.aab` (generati se configurata la chiave di release)
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
