# Statistiche di Referto Volley

Aggiornate il 16/11/2026, ogni lunedì in automatico. I dati vengono da GitHub: l'app non invia nulla. Lo storico è in `github-stats.json`.

## In breve

- **Uso delle app desktop:** 0,8 controlli di aggiornamento al giorno con la v0.36.
- **Visite al repository:** 8 nella settimana del 09/11/2026, contro 18 della precedente.
- **Repository:** 0 stelle, 1 fork.

## Uso delle app, versione per versione

Ogni app desktop legge `latest.json` all'avvio, se il controllo aggiornamenti è attivo: i **controlli** sono avvii, non persone. Conta soprattutto il valore **al giorno**. Non comprendono la versione web e le app Android. Le versioni rimaste le più recenti per meno di un giorno non sono elencate, salvo l'ultima.

| Versione | Uscita | Giorni come ultima | Controlli | Al giorno | Windows | macOS | Linux | Android | iOS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v0.16 | 28/09/2026 | 1,8 | 4 | 2,2 | 4 | 3 | 4 | 2 | 1 |
| v0.18 | 30/09/2026 | 4,3 | 17 | 4,0 | 11 | 2 | 5 | 7 | 1 |
| v0.22 | 05/10/2026 | 2,4 | 2 | 0,8 | 2 | 3 | 4 | 3 | 1 |
| v0.24 | 07/10/2026 | 16,2 | 26 | 1,6 | 12 | 3 | 6 | 5 | 1 |
| v0.25 | 23/10/2026 | 8,0 | 17 | 2,1 | 14 | 6 | 6 | 5 | 6 |
| v0.33 | 02/11/2026 | 8,7 | 5 | 0,6 | 4 | 2 | 5 | 5 | 1 |
| v0.36 | 11/11/2026 | 5,2 | 4 | 0,8 | 3 | 2 | 3 | 5 | 1 |

Le colonne per piattaforma sono i download dei pacchetti di installazione. Anche una versione appena uscita ne ha qualcuno per piattaforma, per prove o bot: conta ciò che supera quella soglia.

```mermaid
xychart-beta
  title "Controlli di aggiornamento al giorno"
  x-axis ["v0.16", "v0.18", "v0.22", "v0.24", "v0.25", "v0.33", "v0.36"]
  y-axis "Numero" 0 --> 4
  bar [2.2, 4, 0.8, 1.6, 2.1, 0.6, 0.8]
```

## Visite al repository

```mermaid
xychart-beta
  title "Visite per settimana"
  x-axis ["12/10", "19/10", "26/10", "02/11", "09/11"]
  y-axis "Numero" 0 --> 44
  bar [4, 10, 44, 18, 8]
```

| Settimana dal | Visite | Persone* |
| --- | --- | --- |
| 12/10/2026 | 4 | 3 |
| 19/10/2026 | 10 | 9 |
| 26/10/2026 | 44 | 16 |
| 02/11/2026 | 18 | 9 |
| 09/11/2026 | 8 | 3 |

\* Somma delle persone diverse di ogni giorno: chi torna in due giorni conta due volte.

## Pagine più viste
Ultimi 14 giorni.

| Pagina | Visite | Persone |
| --- | --- | --- |
| `/` | 11 | 6 |
| `/releases` | 8 | 6 |
| `/tree/stats` | 6 | 2 |
| `/blob/main/README.md` | 2 | 1 |
| `/releases/tag/v0.33` | 2 | 1 |

## Clonazioni

Copie del codice: 400 in 5 settimane. Sono in gran parte automatismi, quindi non indicano quante persone usano l'app.

