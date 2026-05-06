# 🗺️ GeoDuels-Helper Minimap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Version](https://img.shields.io/badge/version-3.6.0-green.svg)](geoduels-helper-minimap.user.js)

> A conflict-free, performance-optimized minimap userscript for [GeoDuels.io](https://geoduels.io).  
> Real-time location tracking, reverse geocoding, adaptive polling, and intelligent caching—all without interfering with the game.

⚠️ **Disclaimer**: This tool is intended for **singleplayer/practice use only**. Using automated tools in competitive modes may violate GeoDuels' Terms of Service. Use responsibly.

---

## ✨ Features

- 🗺️ **Real-time minimap** – follows your position from the Street View iframe onto a draggable Leaflet map.
- 📍 **Reverse geocoding** – shows the nearest country/city via OpenStreetMap Nominatim (with offline fallback).
- 🎨 **Theme-aware** – automatically adapts to light or dark mode.
- 🔄 **Layer switching** – toggle between Standard, Satellite, and Topographic layers.
- 🧠 **Smart caching** – LRU cache with distance/time expiration to reduce API calls.
- ⚡ **Adaptive polling** – slows down when stationary (5s), speeds up when moving (1s).
- 💾 **View persistence** – remembers your zoom level and center between sessions.
- 🛡️ **No conflicts** – strict CSS isolation, safe event handling, and `AbortController` for all network requests.
- 🔌 **Emergency kill** – `Ctrl+Alt+K` instantly disables the script; the `M` shortcut toggles visibility.
- 📱 **SPA-safe** – auto-cleanup on page unload, no `MutationObserver` loops, and no memory leaks.

---

## 🚀 Installation

### Prerequisites

- **Browser**: Chrome, Firefox, Edge, or Brave.
- **Userscript manager**: [Tampermonkey](https://www.tampermonkey.net/) (recommended), [Violentmonkey](https://violentmonkey.github.io/), or [Greasemonkey](https://www.greasespot.net/).

### Quick Install

1. **Click this link**: [geoduels-helper.user.js](https://raw.githubusercontent.com/CeresF3b/geoduels-helper/main/geoduels-helper.user.js)
2. Your userscript manager will open → **confirm installation**.
3. Visit [geoduels.io](https://geoduels.io) and start a singleplayer game—the 🗺️ button will appear automatically.

### Manual Install

1. Download the [`geoduels-helper.user.js`](geoduels-helper.user.js) file.
2. Open your userscript manager dashboard → **Create new script** → paste the code.
3. Ensure the script is enabled for `https://geoduels.io/*`.

---

## 🕹️ Usage

- **Toggle map**: Click the 🗺️ button or press `M` (when not typing in a text field).
- **Drag button**: Click and drag the button anywhere; the minimap will follow.
- **Zoom & Pan**: Use the mouse wheel or pinch-to-zoom on the map. Your view is saved automatically.
- **Switch layers**: Use the Std/Sat/Top buttons inside the minimap.
- **Location name**: The bottom bar shows the geocoded place name, with a green dot when the connection is active.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `M` | Toggle minimap visibility |
| `Ctrl+Alt+K` | **Kill script** – full cleanup and deactivation |

> [!NOTE]  
> The `M` key is ignored while typing in text fields to avoid interference.

---

## ⚙️ Configuration

Open the script in your manager and edit the `CFG` object at the top of the code:

```javascript
const CFG = {
    DEBUG: false,                   // Enable console logs
    BTN_TOP: 100,                   // Initial button Y position (px)
    BTN_LEFT: 20,                   // Initial button X position (px)
    MAP_GAP: 8,                     // Gap between button and map (px)
    POLL_INTERVAL: 2500,            // Normal polling interval (ms)
    POLL_INTERVAL_FAST: 1000,       // Fast polling when moving >50m
    POLL_INTERVAL_SLOW: 5000,       // Slow polling when stationary (<10m)
    DISTANCE_THRESHOLD_SLOW: 10,    // Distance (m) for slow poll
    DISTANCE_THRESHOLD_FAST: 50,    // Distance (m) for fast poll
    NOMINATIM_DEBOUNCE: 2500,       // API call debounce (ms)
    STATUS_RESET: 10000,            // Time before status dot resets (ms)
    CACHE_DISTANCE_M: 120,          // Cache reuse radius (m)
    MAX_CACHE_SIZE: 60,             // Max cache size (LRU)
    CACHE_MAX_AGE_MS: 600000,       // Cache lifetime (10 min)
    DEFAULT_ZOOM: 2,                // Initial zoom level
    DEFAULT_CENTER: [0, 0],         // Initial center coordinates
    ENABLE_KEYBOARD_TOGGLE: true,   // Enable M key toggle
    ENABLE_LAYER_SWITCHER: true,    // Show layer selection buttons
    PREFER_CANVAS_RENDERER: true,   // Use canvas for smooth rendering
    NOMINATIM_RETRIES: 2,           // API retry attempts
    NOMINATIM_RETRY_BACKOFF: 500,   // Initial retry delay (ms)
};
```

---

## 🧹 Safety & Cleanup

- All timers and fetch calls use `AbortController`: no requests are left hanging.
- On page unload or via `Ctrl+Alt+K`, the script removes all **DOM** elements, stops timers, and destroys the map instance.
- **CSS** is strictly isolated (`contain:strict`, `isolation:isolate`) to ensure it never affects the game's UI.

---

## ❓ Troubleshooting

- **Minimap doesn't appear**: Ensure you are in a game with the Street View iframe visible. The script waits for the game to load.
- **Location name not updating**: Move a few meters; the cache is limited by both distance and time.
- **Button stuck**: Press `Ctrl+Alt+K` to reset everything and refresh the page.
- **Performance concerns**: Set `DEBUG: true` in the config to monitor polling behavior in the console.

---

## 📜 License

**MIT** © CeresF3b – feel free to fork, modify, and share.

---

*Optimized for stability and performance – happy dueling!* 🗺️
