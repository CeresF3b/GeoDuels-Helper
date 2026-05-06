# 🗺️ GeoDuels-Helper Minimap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-3.6.0-green.svg)](geoduels-helper-minimap.user.js)

> Un userscript per la minimappa di [GeoDuels.io](https://geoduels.io), ottimizzato per le prestazioni e privo di conflitti.  
> Tracking in tempo reale, geocodifica inversa, polling adattivo e caching intelligente, il tutto senza interferire con il gioco.

⚠️ **Disclaimer**: Questo strumento è destinato esclusivamente all'uso in **singleplayer/pratica**. L'uso di strumenti automatizzati nelle modalità competitive può violare i Termini di Servizio di GeoDuels. Usa responsabilmente.

---

## ✨ Caratteristiche

- 🗺️ **Minimappa in tempo reale** – segue la tua posizione dall'iframe di Street View su una mappa Leaflet trascinabile.
- 📍 **Geocodifica inversa** – mostra il paese/città più vicino tramite OpenStreetMap Nominatim (con fallback offline).
- 🎨 **Compatibile con i temi** – si adatta automaticamente alla modalità chiara o scura.
- 🔄 **Cambio livelli** – passa tra i layer Standard, Satellite e Topografico.
- 🧠 **Cache intelligente** – cache LRU con scadenza per distanza/tempo per ridurre le chiamate API.
- ⚡ **Polling adattivo** – rallenta quando sei fermo (5s), accelera quando ti muovi (1s).
- 💾 **Persistenza della visuale** – ricorda lo zoom e il centro della mappa tra le sessioni.
- 🛡️ **Nessun conflitto** – isolamento CSS rigoroso, gestione sicura degli eventi e `AbortController` per tutte le richieste di rete.
- 🔌 **Chiusura di emergenza** – `Ctrl+Alt+K` disabilita istantaneamente lo script; la scorciatoia `M` attiva/disattiva la minimappa.
- 📱 **SPA‑safe** – pulizia automatica alla chiusura della pagina, nessun loop di `MutationObserver`, nessuna perdita di memoria.

---

## 🚀 Installazione

### Prerequisiti

- **Browser**: Chrome, Firefox, Edge o Brave.
- **Manager di userscript**: [Tampermonkey](https://www.tampermonkey.net/) (raccomandato), [Violentmonkey](https://violentmonkey.github.io/) o [Greasemonkey](https://www.greasespot.net/).

### Installazione rapida

1. **Clicca su questo link**: [geoduels-helper.user.js](https://raw.githubusercontent.com/CeresF3b/geoduels-helper/main/geoduels-helper.user.js)
2. Il tuo manager di userscript si aprirà → **conferma l'installazione**.
3. Visita [geoduels.io](https://geoduels.io) e avvia una partita singleplayer: il pulsante 🗺️ apparirà automaticamente.

### Installazione manuale

1. Scarica il file [`geoduels-helper.user.js`](geoduels-helper.user.js).
2. Apri la dashboard del tuo manager di userscript → **Crea nuovo script** → incolla il codice.
3. Assicurati che lo script sia abilitato per `https://geoduels.io/*`.

---

## 🕹️ Utilizzo

- **Attiva/Disattiva mappa**: clicca sul pulsante 🗺️ o premi `M` (quando non stai scrivendo in un campo di testo).
- **Trascina pulsante**: clicca e trascina il pulsante ovunque; la minimappa lo seguirà.
- **Zoom e Pan**: usa la rotella del mouse o il pinch-to-zoom sulla mappa. La visuale viene salvata automaticamente.
- **Cambia layer**: usa i pulsanti Std/Sat/Top all'interno della minimappa.
- **Nome posizione**: la barra inferiore mostra il nome del luogo, con un punto verde quando la connessione è attiva.

---

## ⌨️ Scorciatoie da Tastiera

| Scorciatoia | Azione |
| :--- | :--- |
| `M` | Attiva/Disattiva visibilità minimappa |
| `Ctrl+Alt+K` | **Kill script** – pulizia completa e disattivazione |

> [!NOTE]  
> Il tasto `M` viene ignorato mentre si scrive nei campi di testo per evitare interferenze.

---

## ⚙️ Configurazione

Apri lo script nel tuo manager e modifica l'oggetto `CFG` all'inizio del codice:

```javascript
const CFG = {
    DEBUG: false,                   // Abilita i log in console
    BTN_TOP: 100,                   // Posizione iniziale Y del pulsante (px)
    BTN_LEFT: 20,                   // Posizione iniziale X del pulsante (px)
    MAP_GAP: 8,                     // Spazio tra pulsante e mappa (px)
    POLL_INTERVAL: 2500,            // Intervallo di polling normale (ms)
    POLL_INTERVAL_FAST: 1000,       // Polling veloce quando ti muovi >50m
    POLL_INTERVAL_SLOW: 5000,       // Polling lento quando sei fermo (<10m)
    DISTANCE_THRESHOLD_SLOW: 10,    // Distanza (m) per il poll lento
    DISTANCE_THRESHOLD_FAST: 50,    // Distanza (m) per il poll veloce
    NOMINATIM_DEBOUNCE: 2500,       // Debounce chiamate API (ms)
    STATUS_RESET: 10000,            // Tempo prima del reset del punto di stato (ms)
    CACHE_DISTANCE_M: 120,          // Raggio di riutilizzo della cache (m)
    MAX_CACHE_SIZE: 60,             // Dimensione massima cache (LRU)
    CACHE_MAX_AGE_MS: 600000,       // Durata della cache (10 min)
    DEFAULT_ZOOM: 2,                // Zoom iniziale
    DEFAULT_CENTER: [0, 0],         // Centro iniziale
    ENABLE_KEYBOARD_TOGGLE: true,   // Abilita il tasto M
    ENABLE_LAYER_SWITCHER: true,    // Mostra selettore livelli
    PREFER_CANVAS_RENDERER: true,   // Usa canvas per un rendering fluido
    NOMINATIM_RETRIES: 2,           // Tentativi retry API
    NOMINATIM_RETRY_BACKOFF: 500,   // Ritardo iniziale retry (ms)
};
```

---

## 🧹 Sicurezza e Pulizia

- Tutti i timer e le chiamate fetch usano `AbortController`: nessuna richiesta rimane appesa.
- Alla chiusura della pagina o con `Ctrl+Alt+K`, lo script rimuove tutti gli elementi **DOM**, ferma i timer e distrugge l'istanza della mappa.
- Il **CSS** è rigorosamente isolato (`contain:strict`, `isolation:isolate`) per non influenzare mai l'interfaccia del gioco.

---

## ❓ Risoluzione dei Problemi

- **La minimappa non appare**: assicurati di essere in una partita con l'iframe di Street View visibile. Lo script attende il caricamento del gioco.
- **Nome del luogo non aggiornato**: muoviti di qualche metro; la cache è limitata per distanza e tempo.
- **Pulsante bloccato**: premi `Ctrl+Alt+K` per resettare tutto e ricarica la pagina.
- **Prestazioni**: imposta `DEBUG: true` nella configurazione per monitorare il comportamento del polling in console.

---

## 📜 Licenza

**MIT** © CeresF3b – sentiti libero di fare fork, modificare e condividere.

---

*Ottimizzato per stabilità e performance – buon divertimento!* 🗺️
