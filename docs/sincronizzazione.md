# Sincronizzazione con Google Drive, Dropbox e OneDrive

Chi usa l'app può collegare il proprio servizio cloud, dispositivo per dispositivo: le gare vengono copiate nel file `RefertoVolley.zrv` del suo spazio e tenute allineate tra i dispositivi collegati allo stesso account. Il codice viene da [volleyreportxls](https://github.com/napo/volleyreportxls) ed è in `webapp/src/sync/`.

**Finché i client qui sotto non sono configurati in `webapp/src/config.js`, la sincronizzazione è nascosta.**

## Come funziona

- **File**: un `.zrv` come quelli dell'esportazione, importabile a mano, senza PDF, con in più `sincronizzazione.json` (le cancellazioni).
- **PDF** (`sync/pdfs.js`): un file per ogni referto accanto all'archivio, con il nome dell'id della gara (`pdf/<id>.pdf` su Dropbox e OneDrive; su Drive, nella cartella dell'app, riconosciuti da `appProperties`). Il PDF non cambia mai: viaggia una volta sola, mentre lo `.zrv` viaggia a ogni modifica. Ciò che si scarica deve essere un PDF con l'impronta del suo id; quando una gara eliminata non ha più altre copie, il suo PDF viene eliminato.
- **Quando**: all'avvio, 4 secondi dopo ogni modifica, al ritorno nell'app (se l'ultima sincronizzazione ha più di 30 secondi), ogni 5 minuti con l'app aperta, al ritorno della rete.
- **Unione** (`sync/merge.js`): ogni gara ha la data dell'ultima modifica (`updatedAt`), ogni cancellazione lascia una traccia datata (tenuta 400 giorni). Se una gara è cambiata da una parte sola vince quella; se è cambiata da entrambe vince la modifica più recente e l'altra versione resta come copia con un nuovo id.
- **Concorrenza**: prima di caricare il file l'app controlla che la versione remota non sia cambiata; altrimenti ripete il giro. Le modifiche fatte durante una sincronizzazione non vengono sovrascritte.
- **Nessun server**: i token restano sul dispositivo e i dati vanno direttamente dal dispositivo al servizio. Un dispositivo usa un solo servizio alla volta.

## Accesso per piattaforma

| Piattaforma | Google Drive | Dropbox e OneDrive |
|---|---|---|
| Web | Google Identity Services: il token dura un'ora, poi serve un tocco | Finestra con PKCE e `public/oauth-callback.html` |
| Windows, macOS, Linux | Browser di sistema e ritorno su `127.0.0.1`, PKCE (`src-tauri/src/oauth.rs`) | Come Google, con indirizzo di ritorno registrato |
| Android | Play services (`src-tauri/plugins/google-auth`) | Non disponibile: serve un link https che riapra l'app |
| iOS | Non disponibile | Non disponibile |

## Configurazione (una volta)

Ovunque l'indirizzo è `https://refertogara.volleyserve.it` (`WEB_APP_URL` in `config.js`). Usa client propri, tutti con il nome «Referto Volley», non quelli di VolleyReport.

### Google

1. Progetto su <https://console.cloud.google.com>, poi abilita **Google Drive API**.
2. **Branding**: nome «Referto Volley», email di assistenza, home page, privacy `https://refertogara.volleyserve.it/privacy.html`, dominio autorizzato verificato in Search Console.
3. **Audience**: esterno, poi **Pubblica l'app** (in test i refresh token scadono dopo 7 giorni e solo gli utenti di test accedono).
4. **Accesso ai dati**: solo `.../auth/drive.file`, ambito non sensibile.
5. **Client**: Applicazione web (origini `https://refertogara.volleyserve.it` e `http://localhost:3000`, nessun redirect); App desktop; Android con pacchetto `it.napolitano.refertovolley` e SHA-1 del certificato (un secondo client per gli APK di debug).
6. Copia gli ID in `GOOGLE_OAUTH`. Il secret desktop non va nel repository: `VITE_GOOGLE_DESKTOP_CLIENT_SECRET` in `.env.local` e `gh secret set GOOGLE_DESKTOP_CLIENT_SECRET`.

### Dropbox

App con accesso circoscritto, tipo cartella dell'app, client pubblici consentiti, autorizzazioni `files.content.read`, `files.content.write`, `files.metadata.read`. Indirizzi di ritorno: `https://refertogara.volleyserve.it/oauth-callback.html` e `http://localhost:53682/`. La chiave va in `DROPBOX_OAUTH`.

### OneDrive

App in Microsoft Entra, solo account personali, autorizzazioni `Files.ReadWrite.AppFolder` e `offline_access`. Piattaforma SPA: `https://refertogara.volleyserve.it/oauth-callback.html`; piattaforma Mobile e desktop: `http://localhost`. L'ID va in `ONEDRIVE_OAUTH`.

## Privacy

Collegare un servizio è una scelta esplicita, presentata con una schermata che spiega cosa succede. Finché non si collega, l'app non contatta il servizio. «Scollega» lascia i dati sul dispositivo, cancella i token, revoca l'accesso dove possibile e, se richiesto, sposta il file nel cestino. Informativa: `webapp/public/privacy.html`.
