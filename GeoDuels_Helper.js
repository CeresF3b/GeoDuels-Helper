// ==UserScript==
// @name         GeoDuels-Helper Minimap
// @namespace    https://geoduels.io/
// @version      3.3.1
// @description  Production-grade minimap for GeoDuels.io. Optimized state management, scoped theme observation, centralized timer cleanup, zero observer loops, freeze-proof design. Shows your current location on a mini Leaflet map with reverse geocoding.
// @author       CeresF3b
// @match        https://geoduels.io/*
// @match        https://*.geoduels.io/*
// @match        https://geoduels.io
// @grant        none
// @license      MIT
// @run-at       document-idle
// @icon         https://www.google.com/s2/favicons?domain=geoduels.io&sz=64
// @supportURL   https://github.com/CeresF3b/geoduels-helper/issues
// @homepageURL  https://github.com/CeresF3b/geoduels-helper
// ==/UserScript==

(function() {
    'use strict';

    // ========================================================================
    // CONFIGURATION - Edit these values to customize behavior
    // ========================================================================
    const CFG = {
        DEBUG: false,                  // Set true for console logging
        BTN_TOP: 100,                  // Button Y position (px from top)
        BTN_LEFT: 20,                  // Button X position (px from left)
        MAP_GAP: 8,                    // Gap between button and minimap (px)
        POLL_INTERVAL: 2500,           // Position polling frequency (ms)
        NOMINATIM_DEBOUNCE: 2500,      // Debounce for reverse geocoding API (ms)
        STATUS_RESET: 10000,           // Reset "connected" status after inactivity (ms)
        NOMINATIM_ERR_RESET: 45000,    // Reset error counter after success period (ms)
        CACHE_DISTANCE_M: 120,         // Max distance (m) to reuse cached location name
        NOMINATIM_ERR_MAX: 4,          // Max consecutive API errors before "unavailable"
        FETCH_TIMEOUT_MS: 5000,        // Timeout for Nominatim API requests (ms)
        MAX_CACHE_SIZE: 50,            // Max entries in location cache (prevents memory leak)
        DEFAULT_ZOOM: 2,               // Default map zoom level
        DEFAULT_CENTER: [0, 0],        // Default map center [lat, lng]
        ENABLE_KEYBOARD_TOGGLE: true,  // Enable 'M' key toggle
        ENABLE_LAYER_SWITCHER: true,   // Show map layer selection buttons
        PREFER_CANVAS_RENDERER: true   // Use Canvas instead of SVG for performance
    };

    // ========================================================================
    // STATE & RESOURCE MANAGEMENT
    // ========================================================================
    const State = {
        initialized: false,
        isTabVisible: true,
        interacting: false,
        visible: false,
        placeName: 'Unknown',
        nomErrors: 0,
        lastPos: null,
        cache: new Map(),              // Location name cache: Map<"lat,lng", {lat,lng,name,ts}>
        map: null,                     // Leaflet map instance
        marker: null,                  // Current position marker
        markerIcon: null,              // Custom marker icon definition
        els: {},                       // Cached DOM element references
        timers: {},                    // Centralized timer registry: { key: timerId }
        observers: {}                  // Cached MutationObserver references for cleanup
    };

    // Logging utilities (respect CFG.DEBUG)
    const log = (...args) => CFG.DEBUG && console.log('[GeoDuels-Helper]', ...args);
    const warn = (...args) => console.warn('[GeoDuels-Helper]', ...args);

    // ========================================================================
    // TIMER MANAGEMENT - Centralized registration & cleanup
    // ========================================================================
    const registerTimer = (key, id) => { State.timers[key] = id; return id; };
    
    const clearTimer = (key) => {
        const id = State.timers[key];
        if (id) {
            if (typeof id === 'number') clearInterval(id);
            else clearTimeout(id);
            State.timers[key] = null;
        }
    };
    
    const clearAllTimers = () => Object.keys(State.timers).forEach(clearTimer);

    // ========================================================================
    // OBSERVER MANAGEMENT - Safe creation & cleanup
    // ========================================================================
    const registerObserver = (key, observer) => { 
        if (State.observers[key]) State.observers[key].disconnect(); 
        State.observers[key] = observer; 
        return observer; 
    };
    
    const clearAllObservers = () => Object.values(State.observers).forEach(obs => obs?.disconnect());

    // ========================================================================
    // CORE UTILITIES
    // ========================================================================
    
    /**
     * Finds the Google Street View iframe dynamically
     * @returns {HTMLIFrameElement|null} The streetview iframe or null
     */
    const findStreetViewIframe = () => 
        document.querySelector('iframe[src*="google.com/maps/embed/v1/streetview"]');

    /**
     * Calculates distance between two coordinates using Haversine formula
     * @returns {number} Distance in meters
     */
    const haversine = (lat1, lng1, lat2, lng2) => {
        const R = 6371e3, φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180,
              Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    /**
     * Checks if cached location is close enough to reuse its name
     */
    const isCacheValid = (nLat, nLng, oLat, oLng) => 
        haversine(nLat, nLng, oLat, oLng) < CFG.CACHE_DISTANCE_M;

    /**
     * Saves current map view to localStorage with error handling
     */
    const saveMapView = () => {
        if (!State.map) return;
        try {
            const center = State.map.getCenter();
            localStorage.setItem('gd_mc', JSON.stringify({ lat: center.lat, lng: center.lng }));
            localStorage.setItem('gd_mz', State.map.getZoom());
            log('MapView saved');
        } catch (e) { warn('localStorage write failed', e); }
    };

    /**
     * Loads saved map view from localStorage with validation
     * @returns {{center: [number, number], zoom: number}|null}
     */
    const loadMapView = () => {
        try {
            const c = JSON.parse(localStorage.getItem('gd_mc')), 
                  z = +localStorage.getItem('gd_mz');
            if (c?.lat && c?.lng && !isNaN(z)) return { center: [c.lat, c.lng], zoom: z };
        } catch (e) { warn('localStorage read failed', e); }
        return null;
    };

    /**
     * Extracts current position from Street View iframe URL
     * @returns {{lat: number, lng: number}|null}
     */
    const getCurrentPosition = () => {
        const iframe = findStreetViewIframe();
        if (!iframe?.src) return null;
        try {
            const url = new URL(iframe.src);
            // Pattern 1: location=lat,lng (Google embed format)
            const loc = url.searchParams.get('location');
            if (loc) {
                const [lat, lng] = loc.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
            }
            // Pattern 2: separate lat/lng parameters
            const la = url.searchParams.get('lat') || url.searchParams.get('latitude'),
                  lo = url.searchParams.get('lng') || url.searchParams.get('lon');
            if (la && lo) return { lat: +la, lng: +lo };
        } catch (e) { warn('Position extraction failed', e); }
        return null;
    };

    /**
     * Fetch wrapper with timeout and automatic AbortController cleanup
     */
    const fetchWithTimeout = (url, opts = {}, timeout = CFG.FETCH_TIMEOUT_MS) => {
        const ctrl = new AbortController();
        const id = setTimeout(() => ctrl.abort(), timeout);
        registerTimer('fetchAbort', id);
        return fetch(url, { ...opts, signal: ctrl.signal })
            .finally(() => clearTimer('fetchAbort'));
    };

    // ========================================================================
    // STYLES & DOM INJECTION
    // ========================================================================
    const injectStyles = () => {
        if (document.getElementById('gd-styles')) return;
        const s = document.createElement('style'); 
        s.id = 'gd-styles';
        const mapTop = CFG.BTN_TOP + 46 + CFG.MAP_GAP;
        
        s.textContent = `
:root{--gd-b:#3b82f6;--gd-bg:#fff;--gd-t:#111;--gd-br:#e5e7eb;--gd-sh:0 6px 16px rgba(0,0,0,.2);--gd-ok:#22c55e;--gd-err:#ef4444}
[data-theme=dark],.dark{--gd-bg:#1f2937;--gd-t:#f9fafb;--gd-br:#374151}
#gw{position:fixed;top:${mapTop}px;left:${CFG.BTN_LEFT}px;z-index:99999;width:380px;height:300px;border-radius:14px;background:var(--gd-bg);box-shadow:var(--gd-sh);display:none;opacity:0;transform:scale(.97);transition:opacity .2s,transform .2s;overflow:hidden;border:1px solid var(--gd-br)}
#gw.v{display:block;opacity:1;transform:scale(1)}
#gm{width:100%;height:100%;border-radius:14px}
#gt{position:absolute;top:0;left:0;right:0;padding:7px 10px;background:var(--gd-bg);color:var(--gd-t);font-size:12px;font-weight:600;text-align:center;z-index:1002;pointer-events:none;user-select:none}
#gi{position:absolute;bottom:0;left:0;right:0;padding:9px 12px;background:rgba(17,24,39,.96);color:#fff;font-size:13px;z-index:1001;display:flex;align-items:center;justify-content:space-between;pointer-events:none;user-select:none}
#gtx{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gdt{width:9px;height:9px;border-radius:50%;background:var(--gd-err);margin-left:9px;border:2px solid #fff;flex-shrink:0}
#gi.c #gdt{background:var(--gd-ok)}
#gl{position:absolute;top:32px;left:9px;z-index:1001;display:flex;gap:5px;scrollbar-width:none}
#gl::-webkit-scrollbar{display:none}
.glb{background:var(--gd-bg);color:var(--gd-t);border:1px solid var(--gd-br);border-radius:7px;padding:3px 9px;cursor:pointer;font-size:10px;transition:all .12s;pointer-events:auto;user-select:none;touch-action:manipulation}
.glb.a,.glb:hover{background:var(--gd-b);color:#fff;border-color:var(--gd-b)}
#bw{position:fixed;top:${CFG.BTN_TOP}px;left:${CFG.BTN_LEFT}px;z-index:100000}
#gb{width:46px;height:46px;background:var(--gd-b);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--gd-sh);font-size:20px;transition:transform .12s,background .15s;user-select:none;touch-action:manipulation}
#gb:hover{transform:scale(1.06);background:#2563eb}
#gb:active{transform:scale(.98)}
.gmk div{background:var(--gd-b)!important;width:13px!important;height:13px!important;border-radius:50%!important;border:3px solid #fff!important;box-shadow:0 2px 6px rgba(0,0,0,.35)!important}
`;
        document.head.appendChild(s);
    };

    // ========================================================================
    // LEAFLET LOADER - Dynamic script injection with deduplication
    // ========================================================================
    let leafletLoading = false;
    
    const loadLeaflet = (cb) => {
        if (window.L) { cb(); return; }
        if (leafletLoading) { 
            // If already loading, attach callback to existing load
            const originalOnLoad = document.querySelector('script[src*="leaflet.js"]')?.onload;
            document.querySelector('script[src*="leaflet.js"]')?.addEventListener('load', cb, { once: true });
            return; 
        }
        leafletLoading = true;
        
        const link = document.createElement('link'); 
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.onerror = () => { warn('Leaflet CSS failed'); leafletLoading = false; };
        document.head.appendChild(link);
        
        const sc = document.createElement('script'); 
        sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        sc.onload = () => { leafletLoading = false; cb(); };
        sc.onerror = () => { warn('Leaflet JS failed'); leafletLoading = false; };
        document.head.appendChild(sc);
    };

    // ========================================================================
    // UI BUILDER - Creates DOM elements with cached references
    // ========================================================================
    const buildUI = () => {
        if (State.els.wrap) return;
        
        const wrap = document.createElement('div'); 
        wrap.id = 'gw'; 
        document.body.appendChild(wrap);
        State.els.wrap = wrap;

        const tl = document.createElement('div'); 
        tl.id = 'gt'; 
        tl.textContent = '🗺️ GeoDuels Minimap'; 
        wrap.appendChild(tl);
        
        const mc = document.createElement('div'); 
        mc.id = 'gm'; 
        wrap.appendChild(mc);

        const inf = document.createElement('div'); 
        inf.id = 'gi'; 
        inf.className = 'd'; // disconnected state
        
        const tx = document.createElement('span'); 
        tx.id = 'gtx'; 
        tx.textContent = '📍 Waiting for location...';
        
        const dt = document.createElement('span'); 
        dt.id = 'gdt';
        
        inf.append(tx, dt); 
        wrap.appendChild(inf);
        
        // Cache DOM references for performance
        Object.assign(State.els, { info: inf, infoText: tx, statusDot: dt });

        if (CFG.ENABLE_LAYER_SWITCHER) {
            const lc = document.createElement('div'); 
            lc.id = 'gl'; 
            wrap.appendChild(lc); 
            State.els.layerCtrl = lc;
        }
        
        loadLeaflet(() => setupMap());
    };

    // ========================================================================
    // MAP SETUP - Initializes Leaflet with optimized options
    // ========================================================================
    const setupMap = () => {
        if (State.map) return;
        
        State.markerIcon = L.divIcon({ 
            className: 'gmk', 
            html: '<div></div>', 
            iconSize: [17,17], 
            iconAnchor: [8,8] 
        });
        
        const sv = loadMapView(), 
              ctr = sv?.center || CFG.DEFAULT_CENTER, 
              zm = sv?.zoom || CFG.DEFAULT_ZOOM;

        State.map = L.map('gm', {
            attributionControl: false, 
            zoomControl: false, 
            dragging: true, 
            scrollWheelZoom: true,
            worldCopyJump: true, 
            maxBoundsViscosity: 1, 
            preferCanvas: CFG.PREFER_CANVAS_RENDERER,
            fadeAnimation: false, 
            zoomAnimation: false, 
            markerZoomAnimation: false, 
            updateWhenIdle: true
        }).setView(ctr, zm);

        // Track user interaction to avoid auto-centering during manual control
        const onStart = () => State.interacting = true;
        const onEnd = () => setTimeout(() => State.interacting = false, 80);
        
        State.map.on('mousedown touchstart', onStart, { passive: true });
        State.map.on('mouseup touchend', onEnd, { passive: true });
        State.map.on('zoomstart', onStart);
        State.map.on('moveend zoomend', () => { onEnd(); if (!State.interacting) saveMapView(); });

        // Define tile layers
        const layers = {
            'Std': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { 
                maxZoom: 19, attribution: '©OSM', noWrap: false 
            }),
            'Sat': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { 
                maxZoom: 19, attribution: '©Esri', noWrap: false 
            }),
            'Top': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { 
                maxZoom: 17, attribution: '©OTM', noWrap: false 
            })
        };
        layers['Std'].addTo(State.map);

        // Layer switcher with event delegation (better performance)
        if (CFG.ENABLE_LAYER_SWITCHER && State.els.layerCtrl) {
            Object.keys(layers).forEach(n => {
                const b = document.createElement('button'); 
                b.textContent = n;
                b.className = 'glb' + (n === 'Std' ? ' a' : ''); 
                b.type = 'button'; 
                b.dataset.layer = n;
                State.els.layerCtrl.appendChild(b);
            });
            
            State.els.layerCtrl.addEventListener('click', (e) => {
                const btn = e.target.closest('.glb');
                if (!btn || !State.map) return;
                const sel = btn.dataset.layer;
                Object.values(layers).forEach(l => State.map.hasLayer(l) && State.map.removeLayer(l));
                layers[sel].addTo(State.map);
                State.els.layerCtrl.querySelectorAll('.glb').forEach(x => x.classList.remove('a'));
                btn.classList.add('a');
            });
        }

        // Initial position update
        const p = getCurrentPosition();
        if (p) updateMinimap(p, true);
        startPolling();
    };

    // ========================================================================
    // MINIMAP UPDATE & INFO PANEL
    // ========================================================================
    const updateMinimap = (pos, setView = false) => {
        if (!State.map) return;
        State.lastPos = pos;
        
        // Update status indicator to "connected"
        if (State.els.info) {
            State.els.info.className = 'c';
            clearTimer('statusReset');
            registerTimer('statusReset', setTimeout(() => {
                if (State.els.info) State.els.info.className = 'd';
            }, CFG.STATUS_RESET));
        }
        
        // Update or create marker
        if (State.marker) State.marker.setLatLng([pos.lat, pos.lng]);
        else State.marker = L.marker([pos.lat, pos.lng], { icon: State.markerIcon }).addTo(State.map);

        // Center view if requested and user not interacting
        if (setView && !State.interacting) State.map.setView([pos.lat, pos.lng], State.map.getZoom() || 12);
        
        updateInfoPanel(pos);
    };

    /**
     * Fetches and displays location name via Nominatim API (debounced + cached)
     */
    const updateInfoPanel = async (pos) => {
        if (!State.els.infoText) return;
        clearTimer('nomDebounce');
        
        const fetchPlace = async () => {
            let nm = 'Unknown', key = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;
            
            // Check cache first (performance optimization)
            if (State.cache.has(key) && isCacheValid(pos.lat, pos.lng, State.cache.get(key).lat, State.cache.get(key).lng)) {
                nm = State.cache.get(key).name; 
                State.placeName = nm;
            } else {
                try {
                    const r = await fetchWithTimeout(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`, 
                        { headers: { 'Accept-Language': 'en' }, cache: 'force-cache' }
                    );
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const d = await r.json();
                    
                    if (d?.address) {
                        const co = d.address.country || '', 
                              ci = d.address.city || d.address.town || d.address.village || d.address.state || '';
                        nm = ci ? `${co}, ${ci}`.trim() : co || 'Unknown';
                        
                        // Cache successful result with size limit
                        if (nm && !nm.includes('Unknown')) {
                            State.placeName = nm;
                            State.cache.set(key, { lat: pos.lat, lng: pos.lng, name: nm, ts: Date.now() });
                            if (State.cache.size > CFG.MAX_CACHE_SIZE) {
                                State.cache.delete(State.cache.keys().next().value); // Remove oldest
                            }
                        }
                    }
                    
                    // Reset error counter on success
                    State.nomErrors = 0;
                    clearTimer('nomErrReset');
                    registerTimer('nomErrReset', setTimeout(() => State.nomErrors = 0, CFG.NOMINATIM_ERR_RESET));
                    
                } catch (e) {
                    warn('Nominatim err:', e.name === 'AbortError' ? 'timeout' : e.message);
                    State.nomErrors++;
                    
                    if (State.nomErrors >= CFG.NOMINATIM_ERR_MAX) { 
                        nm = '🔌 Offline'; 
                        if (State.els.info) State.els.info.className = 'e'; 
                    } else {
                        nm = State.placeName !== 'Unknown' ? `${State.placeName} ⏳` : '📍 ...';
                    }
                }
            }
            if (State.els.infoText) State.els.infoText.textContent = `📍 ${nm}`;
        };
        
        registerTimer('nomDebounce', setTimeout(fetchPlace, CFG.NOMINATIM_DEBOUNCE));
    };

    // ========================================================================
    // POLLING & VISIBILITY HANDLING
    // ========================================================================
    const startPolling = () => {
        clearTimer('poll');
        registerTimer('poll', setInterval(() => {
            if (!State.isTabVisible) return; // Skip if tab is hidden
            const p = getCurrentPosition();
            if (p && (!State.lastPos || p.lat !== State.lastPos.lat || p.lng !== State.lastPos.lng)) {
                updateMinimap(p, true);
            }
        }, CFG.POLL_INTERVAL));
    };

    const handleVisibility = () => {
        State.isTabVisible = !document.hidden;
        if (!State.isTabVisible) {
            clearTimer('poll'); 
            clearTimer('nomDebounce');
        } else if (!State.timers.poll) {
            startPolling();
        }
    };
    document.addEventListener('visibilitychange', handleVisibility, { passive: true });

    // ========================================================================
    // TOGGLE BUTTON & KEYBOARD CONTROLS
    // ========================================================================
    const createToggleButton = () => {
        if (State.els.btnWrap) return;
        
        const wrap = document.createElement('div'); 
        wrap.id = 'bw'; 
        document.body.appendChild(wrap); 
        State.els.btnWrap = wrap;
        
        const btn = document.createElement('div');
        btn.id = 'gb'; 
        btn.textContent = '🗺️'; 
        btn.title = 'Toggle minimap (click or press M)';
        btn.setAttribute('role', 'button'); 
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('aria-label', 'Toggle minimap'); 
        btn.setAttribute('aria-expanded', 'false');
        wrap.appendChild(btn);

        const toggle = () => {
            if (!State.els.wrap) return;
            const isVisible = State.els.wrap.classList.toggle('v');
            State.visible = isVisible;
            btn.setAttribute('aria-expanded', String(isVisible));
            if (isVisible) saveMapView();
            if (isVisible && State.map && State.lastPos) {
                State.map.invalidateSize();
                State.map.setView([State.lastPos.lat, State.lastPos.lng], State.map.getZoom() || 12);
            }
        };
        
        btn.addEventListener('click', toggle, { passive: true });
        btn.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter' || e.key === ' ') { 
                e.preventDefault(); 
                toggle(); 
            } 
        }, { passive: false });

        // Global keyboard shortcut: 'M' key (excludes input fields)
        if (CFG.ENABLE_KEYBOARD_TOGGLE) {
            document.addEventListener('keydown', (e) => {
                const tag = e.target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
                if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey && !e.metaKey) { 
                    e.preventDefault(); 
                    toggle(); 
                }
            }, { passive: false });
        }
    };

    // ========================================================================
    // THEME OBSERVER (SCOPED & CLEANUP-SAFE)
    // ========================================================================
    const setupThemeObserver = () => {
        const observer = new MutationObserver(() => {
            const dk = document.body.getAttribute('data-theme') === 'dark' || 
                      document.documentElement.classList.contains('dark');
            document.body.setAttribute('data-theme', dk ? 'dark' : 'light');
        });
        registerObserver('theme', observer);
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    };

    // ========================================================================
    // INITIALIZATION & BOOTSTRAP
    // ========================================================================
    const init = () => {
        if (State.initialized) return; 
        State.initialized = true;
        log('v3.3.1 initialized (production)');
        injectStyles(); 
        createToggleButton(); 
        buildUI(); 
        setupThemeObserver();
    };

    const bootstrap = () => {
        let att = 0; 
        const max = 30;
        const check = () => {
            if (State.initialized) return;
            att++;
            if (findStreetViewIframe()) { init(); return; }
            if (att < max) setTimeout(check, 800);
            else warn('Street View iframe not found after', max, 'attempts');
        };
        document.readyState === 'loading' 
            ? document.addEventListener('DOMContentLoaded', check, { once: true }) 
            : setTimeout(check, 300);
    };
    bootstrap();

    // ========================================================================
    // EMERGENCY KILL SWITCH (BULLETPROOF CLEANUP)
    // ========================================================================
    const resetState = () => {
        Object.assign(State, {
            initialized: false, isTabVisible: true, interacting: false, visible: false,
            placeName: 'Unknown', nomErrors: 0, lastPos: null, cache: new Map(),
            map: null, marker: null, markerIcon: null,
            els: {}, timers: {}, observers: {}
        });
    };

    window.__gd_kill__ = () => {
        warn('🚨 Emergency kill activated');
        clearAllTimers();
        clearAllObservers();
        ['gw', 'bw', 'gd-styles'].forEach(id => document.getElementById(id)?.remove());
        if (State.map) { try { State.map.remove(); } catch(e){} State.map = null; State.marker = null; }
        resetState();
        log('✅ Killed - all resources cleaned up');
    };

    // Keyboard shortcut for emergency kill: Ctrl+Alt+K
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'k') { 
            e.preventDefault(); 
            window.__gd_kill__(); 
        }
    }, { capture: true, passive: false });

    // Cleanup on page unload (prevents leaks on navigation)
    window.addEventListener('beforeunload', () => {
        clearAllTimers();
        clearAllObservers();
        if (State.map) { try { State.map.remove(); } catch(e){} }
    }, { passive: true });

})();
