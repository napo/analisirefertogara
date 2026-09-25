# Build Tauri e firma

## Output GitHub Actions

Il workflow `Build applicazioni Tauri` produce artefatti scaricabili dall’esecuzione. Non crea release pubbliche, non invia pacchetti agli store e non richiede secret per le build standard. I progetti Android e Xcode vengono generati a ogni esecuzione dalla CLI Tauri 2.11.5 e dalle icone del repository; `src-tauri/gen` non viene versionato.

L’identificativo delle app è `it.napolitano.refertovolley`. La versione si trova in `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml`: aggiornale insieme per una release. Non cambiare l’identificativo dopo la distribuzione se vuoi conservare l’associazione all’archivio locale.

## Windows, macOS e Linux

- Windows: gli installer non hanno una firma Authenticode.
- macOS: i DMG contengono app firmate ad hoc, senza certificato Developer ID e senza notarizzazione. Gatekeeper può richiedere un’autorizzazione esplicita all’apertura. Per distribuzione notarizzata servono certificati Apple e configurazione aggiuntiva.
- Linux: DEB e AppImage x64 sono costruiti su Ubuntu 22.04. L’AppImage può richiedere FUSE sul sistema di destinazione.

## Android

L’APK debug è installabile per prove e ha identificativo `it.napolitano.refertovolley.debug`. La chiave debug è generata sul runner, quindi può cambiare tra esecuzioni: per aggiornamenti stabili usa una release firmata con la stessa chiave. Disinstallare un’app può cancellarne l’archivio: esporta prima un backup.

Gli APK/AAB release sono **non firmati** se non configuri i seguenti repository secret:

| Secret | Contenuto |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Keystore JKS codificato in base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Password del keystore |
| `ANDROID_KEY_ALIAS` | Alias della chiave |
| `ANDROID_KEY_PASSWORD` | Password della chiave |

Con tutti e quattro i secret il workflow configura Gradle tramite `scripts/android-signing.py` e firma la release. Un insieme incompleto fa fallire il job con un messaggio esplicito. Il keystore temporaneo viene eliminato a fine job e non è incluso negli artefatti. Conserva la chiave per firmare gli aggiornamenti. Un AAB è destinato alla distribuzione tramite store, non all’installazione diretta come un APK.

Riferimento: [firma Android in Tauri](https://v2.tauri.app/distribute/sign/android/).

## iPhone e iPad

Le build standard non richiedono account Apple:

- `simulatore`: app per simulatore ARM64, non installabile su iPhone/iPad fisici.
- `dispositivo-non-firmato`: IPA ARM64 generato con `--no-sign`, da firmare prima dell’installazione su dispositivi. Non è un pacchetto immediatamente installabile né pronto per App Store.

Gli output Xcode sono compressi in `.tar.gz` per conservarne permessi e collegamenti. Entrambi i target supportano iPhone e iPad tramite il progetto iOS generato da Tauri.

Per l’IPA firmato configura:

| Secret | Contenuto |
| --- | --- |
| `APPLE_DEVELOPMENT_TEAM` | Team ID Apple Developer |
| `APPLE_API_ISSUER` | Issuer ID della chiave App Store Connect |
| `APPLE_API_KEY` | Key ID della chiave App Store Connect |
| `APPLE_API_PRIVATE_KEY` | Contenuto completo della chiave privata `.p8`, con righe originali |

Registra l’identificativo app nel tuo account Apple e configura una chiave App Store Connect con i permessi necessari alla firma automatica. Avvia **Run workflow** con `signed_ios` attivo. Il job usa `app-store-connect` come metodo di esportazione e il numero di esecuzione come build number; produce un IPA firmato ma **non lo carica su App Store Connect**. L’IPA per App Store non equivale a una distribuzione ad hoc su qualunque dispositivo.

Non inserire le chiavi nel repository o nelle issue. Il file `.p8` temporaneo viene rimosso a fine job.

Riferimento: [firma iOS in Tauri](https://v2.tauri.app/distribute/sign/ios/).

## Dati e verifiche sui dispositivi

Ogni app conserva l’archivio IndexedDB nella propria WebView: è distinto da quello del sito e dalle altre piattaforme. Per trasferire le gare usa il backup JSON. Le risorse del frontend, inclusi font e worker PDF, sono incorporate nei pacchetti.

Prima di distribuire una release verifica sul dispositivo: apertura e importazione del PDF, salvataggio e riapertura della gara, generazione del report PDF, esportazione/ripristino del backup e apertura del PDF originale. Le API web per selezione e download dei file dipendono dalla WebView della piattaforma; una build riuscita da sola non costituisce una verifica di questi flussi su iOS/Android.
