# 🗺️ GeoDuels-Helper Minimap

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.3.1-green.svg)](geoduels-helper.user.js)

> A production-grade minimap userscript for [GeoDuels.io](https://geoduels.io) featuring real-time location tracking, reverse geocoding, and freeze-proof design.

⚠️ **Disclaimer**: This tool is intended for **singleplayer/practice use only**. Using automated tools in competitive modes may violate GeoDuels' Terms of Service. Use responsibly.

---

## ✨ Features

- 🗺️ **Real-time minimap**: Shows your current Street View location on an interactive Leaflet map
- 📍 **Reverse geocoding**: Displays country/city name via OpenStreetMap Nominatim API
- 🎨 **Theme-aware**: Automatically adapts to light/dark mode
- ⌨️ **Keyboard toggle**: Press `M` to show/hide minimap (configurable)
- 🔄 **Layer switching**: Toggle between Standard, Satellite, and Topographic maps
- 💾 **View persistence**: Remembers your last map position and zoom level
- 🧠 **Smart caching**: Reduces API calls by caching nearby location names
- 🛡️ **Freeze-proof**: Zero MutationObserver loops, safe for React/SPA sites
- 🔌 **Emergency kill**: Press `Ctrl+Alt+K` to instantly disable the script

---

## 🚀 Installation

### Prerequisites
- Browser: Chrome, Firefox, Edge, or Brave
- Userscript manager: [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)

### Steps
1. Install Tampermonkey or Violentmonkey from your browser's extension store
2. Click the extension icon → **Dashboard** → **Utilities** → **Import**
3. Paste the raw URL:  
   `https://raw.githubusercontent.com/CeresF3b/geoduels-helper/main/geoduels-helper.user.js`
4. Click **Install** → Confirm → Enable the script
5. Visit [geoduels.io](https://geoduels.io) and start a singleplayer game
6. Click the 🗺️ button or press `M` to toggle the minimap

### Manual Installation
1. Download [`geoduels-helper.user.js`](geoduels-helper.user.js)
2. Open your userscript manager dashboard
3. Click **Create new script** → Paste the code → Save
4. Ensure the script is enabled for `https://geoduels.io/*`

---

## ⚙️ Configuration

Edit the `CFG` object at the top of the script to customize behavior:

```javascript
const CFG = {
    DEBUG: false,                  // Enable console logging
    BTN_TOP: 100,                  // Button Y position (px)
    BTN_LEFT: 20,                  // Button X position (px)
    MAP_GAP: 8,                    // Gap between button and map (px)
    POLL_INTERVAL: 2500,           // Position check frequency (ms)
    NOMINATIM_DEBOUNCE: 2500,      // API request debounce (ms)
    CACHE_DISTANCE_M: 120,         // Cache reuse radius (meters)
    MAX_CACHE_SIZE: 50,            // Max cached locations (prevents memory leak)
    ENABLE_KEYBOARD_TOGGLE: true,  // Enable 'M' key toggle
    ENABLE_LAYER_SWITCHER: true,   // Show layer buttons
    // ... more options in script
};
