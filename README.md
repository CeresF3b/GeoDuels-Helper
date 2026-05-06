# 🗺️ GeoDuels-Helper Minimap

[![License: **MIT**](https://img.shields.io/badge/License-**MIT**-blue.svg)](**LICENSE**) [![Version](https://img.shields.io/badge/version-3.6.0-green.svg)](geoduels-helper-minimap.user.js)

> A conflict‑free, performance‑optimised minimap userscript for [GeoDuels.io](https://geoduels.io). > Real‑time location tracking, reverse geocoding, adaptive polling, and intelligent caching – all without interfering with the game.

⚠️ **Disclaimer**: This tool is intended for **singleplayer/practice use only**. Using automated tools in competitive modes may violate GeoDuels' Terms of Service. Use responsibly.

---

## ✨ Features

- 🗺️ **Real‑time minimap** – follows your position from the Street View iframe onto a draggable Leaflet map.
- 📍 **Reverse geocoding** – shows the nearest country/city via OpenStreetMap Nominatim (with offline fallback).
- 🎨 **Theme‑aware** – automatically adapts to light/dark mode.
- 🔄 **Layer switching** – toggle between Standard, Satellite, and Topographic tiles.
- 🧠 **Smart caching** – **LRU** cache with distance/time expiration reduces **API** calls.
- ⚡ **Adaptive polling** – slows down when you’re stationary (5 s), speeds up when moving (1 s).
- 💾 **View persistence** – remembers zoom and center between sessions.
- 🛡️ **No conflicts** – strict **CSS** isolation, safe event handling, and `AbortController` for all network requests.
- 🔌 **Emergency kill** – `Ctrl+Alt+K` instantly disables the script; keyboard shortcut `M` toggles the minimap.
- 📱 ****SPA**‑safe** – auto‑cleanup on page unload, no `MutationObserver` loops, no memory leaks.

---

## 🚀 Installation

### Prerequisites

- Browser: Chrome, Firefox, Edge, or Brave
- Userscript manager: [Tampermonkey](https://[www.tampermonkey.net/](https://www.tampermonkey.net/)) (recommended), [Violentmonkey](https://violentmonkey.github.io/), or [Greasemonkey](https://[www.greasespot.net/](https://www.greasespot.net/))

### Quick install

## Click this link: `[https://raw.githubusercontent.com/CeresF3b/geoduels-helper/main/geoduels-helper.user.js`](https://raw.githubusercontent.com/CeresF3b/geoduels-helper/main/geoduels-helper.user.js`) ## Your userscript manager will open → confirm installation. ## Visit [geoduels.io](https://geoduels.io) and start a singleplayer game – the 🗺️ button will appear automatically.

### Manual install

## Download [`geoduels-helper.user.js`](geoduels-helper.user.js). ## Open your userscript manager dashboard → **Create new script** → paste the code. ## Ensure the script is enabled for `[https://geoduels.io/*`.](https://geoduels.io/*`.)

---

## 🕹️ Usage

- **Toggle minimap** – click the 🗺️ button or press `M` (when no text field is focused).
- **Drag button** – click‑and‑drag the button anywhere; the minimap follows.
- **Zoom & pan** – scroll wheel or pinch on the minimap. Your view is saved automatically.
- **Switch layers** – use the Std/Sat/Top buttons inside the minimap (if enabled).
- **Location name** – the bottom bar shows the reverse‑geocoded place name, with a green dot when connected.

---

## ⌨️ Keyboard Shortcuts

| Shortcut        | Action                           |
|-----------------|----------------------------------|
| `M`             | Toggle minimap visibility        |
| `Ctrl+Alt+K`    | **Kill script** – full cleanup   |

> `M` is ignored while typing in text fields to avoid interference.

---

## ⚙️ Configuration

Open the script in your userscript manager and edit the `**CFG**` object at the top:

```javascript
const **CFG** = {
    **DEBUG**: false,                   // Enable console logs
    BTN_TOP: **100**,                   // Button start Y (px)
    BTN_LEFT: 20,                   // Button start X (px)
    MAP_GAP: 8,                     // Gap between button and map (px)
    POLL_INTERVAL: **2500**,            // Normal polling interval (ms)
    POLL_INTERVAL_FAST: **1000**,       // Fast polling when moving >50m
    POLL_INTERVAL_SLOW: **5000**,       // Slow polling when stationary (<10m)
    DISTANCE_THRESHOLD_SLOW: 10,    // Distance (m) to use slow poll
    DISTANCE_THRESHOLD_FAST: 50,    // Distance (m) to use fast poll
    NOMINATIM_DEBOUNCE: **2500**,       // Debounce **API** calls (ms)
    STATUS_RESET: **10000**,            // Time before connection dot resets (ms)
    CACHE_DISTANCE_M: **120**,          // Cache reuse radius (m)
    MAX_CACHE_SIZE: 60,             // Max cached addresses (**LRU** eviction)
    CACHE_MAX_AGE_MS: **600000**,       // Cache entry lifetime (10 min)
    DEFAULT_ZOOM: 2,                // Initial zoom level (if no saved view)
    DEFAULT_CENTER: [0, 0],         // Initial center (if no saved view)
    ENABLE_KEYBOARD_TOGGLE: true,   // Allow M key toggle
    ENABLE_LAYER_SWITCHER: true,    // Show layer buttons
    PREFER_CANVAS_RENDERER: true,   // Use canvas for smoother rendering
    NOMINATIM_RETRIES: 2,           // **API** retry attempts
    NOMINATIM_RETRY_BACKOFF: **500**,   // Initial retry delay (ms)
};
```

---

## 🧹 Safety & Cleanup

- All timers and fetch calls use `AbortController` – no dangling requests.
- On page unload or `Ctrl+Alt+K`, the script removes all **DOM** elements, stops all timers, and destroys the map instance.
- **CSS** is strictly isolated (`contain:strict`, `isolation:isolate`) to never affect the game’s UI.

---

## ❓ Troubleshooting

- **Minimap doesn’t appear** – make sure you’re playing a game with a visible Street View iframe. The script waits for it.
- **Stale place name** – move a few metres; the cache is distance/time‑limited.
- **Button stuck** – press `Ctrl+Alt+K` to reset everything, then refresh.
- **Performance worries** – enable `**DEBUG**: true` to see polling behaviour in the console.

---

## 📜 License

**MIT** © CeresF3b – feel free to fork, modify, and share.

---

*Optimised for performance and stability – happy duelling!* 🗺️
