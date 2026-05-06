// ==UserScript==
// @name         GeoDuels-Helper Minimap
// @namespace    https://geoduels.io/
// @version      1.2
// @description  Conflict-free minimap for GeoDuels.io. Uses strict CSS isolation, safe event handling, AbortController for fetch cancellation, adaptive polling, and LRU cache. Optimized for performance and stability.
// @author       CeresF3b
// @match        https://geoduels.io/*
// @match        https://*.geoduels.io/*
// @match        https://geoduels.io
// @grant        none
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ========================================================================
    // CONFIGURATION
    // ========================================================================
    const CFG = {
        DEBUG: false,
        BTN_TOP: 100,
        BTN_LEFT: 20,
        MAP_GAP: 8,
        POLL_INTERVAL: 2500,
        POLL_INTERVAL_FAST: 1000,
        POLL_INTERVAL_SLOW: 5000,
        DISTANCE_THRESHOLD_SLOW: 10,
        DISTANCE_THRESHOLD_FAST: 50,
        NOMINATIM_DEBOUNCE: 2500,
        STATUS_RESET: 10000,
        CACHE_DISTANCE_M: 120,
        MAX_CACHE_SIZE: 60,
        CACHE_MAX_AGE_MS: 600000,
        DEFAULT_ZOOM: 2,
        DEFAULT_CENTER: [0, 0],
        ENABLE_KEYBOARD_TOGGLE: true,
        ENABLE_LAYER_SWITCHER: true,
        PREFER_CANVAS_RENDERER: true,
        NOMINATIM_RETRIES: 2,
        NOMINATIM_RETRY_BACKOFF: 500
    };

    // ========================================================================
    // STATE & CACHE
    // ========================================================================
    const State = {
        map: null, marker: null, markerIcon: null,
        cache: new Map(), lastPos: null, placeName: 'Unknown',
        interacting: false, visible: false, initialized: false,
        els: {}, timers: {}, polling: { lastPoll: 0, lastCheck: 0 }
    };
    const log = (...a) => CFG.DEBUG && console.log('[GeoDuels-Helper]', ...a);
    const warn = (...a) => console.warn('[GeoDuels-Helper]', ...a);

    // Timer management with AbortController support
    const regTimer = (k, v) => { State.timers[k] = v; return v; };
    const clrTimer = k => {
        const v = State.timers[k];
        if (!v) return;
        if (v instanceof AbortController) {
            v.abort();
        } else if (typeof v === 'number') {
            clearInterval(v);
            clearTimeout(v);
        }
        State.timers[k] = null;
    };
    const clrAllTimers = () => Object.keys(State.timers).forEach(clrTimer);

    // ========================================================================
    // UTILITIES
    // ========================================================================
    const findStreetViewIframe = () => document.querySelector('iframe[src*="google.com/maps/embed/v1/streetview"]');

    const haversine = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3, φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180,
              Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const saveMapView = () => {
        if (!State.map) return;
        try {
            const c = State.map.getCenter();
            localStorage.setItem('gd_mc', JSON.stringify({ lat: c.lat, lng: c.lng }));
            localStorage.setItem('gd_mz', State.map.getZoom());
        } catch (e) { warn('localStorage failed', e); }
    };

    const loadMapView = () => {
        try {
            const c = JSON.parse(localStorage.getItem('gd_mc')), z = +localStorage.getItem('gd_mz');
            if (c?.lat && c?.lng && !isNaN(z)) return { center: [c.lat, c.lng], zoom: z };
        } catch (e) {}
        return null;
    };

    const getCurrentPosition = () => {
        const f = findStreetViewIframe();
        if (!f?.src) return null;
        try {
            const u = new URL(f.src), loc = u.searchParams.get('location');
            if (loc) {
                const [lat, lng] = loc.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
            }
            const lat = u.searchParams.get('lat') || u.searchParams.get('latitude'),
                  lng = u.searchParams.get('lng') || u.searchParams.get('lon');
            if (lat && lng) return { lat: +lat, lng: +lng };
        } catch (e) {}
        return null;
    };

    // Fetch with retry and exponential backoff
    const fetchWithRetry = async (url, options, retries = CFG.NOMINATIM_RETRIES, backoff = CFG.NOMINATIM_RETRY_BACKOFF) => {
        try {
            return await fetch(url, options);
        } catch (err) {
            if (retries <= 0 || err.name === 'AbortError') throw err;
            await new Promise(resolve => regTimer('retryWait', setTimeout(resolve, backoff)));
            return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
    };

    // Cache management with LRU-style access tracking
    const cacheGet = (key, pos) => {
        if (!State.cache.has(key)) return null;
        const entry = State.cache.get(key);
        // Validate distance threshold
        if (haversine(pos.lat, pos.lng, entry.lat, entry.lng) >= CFG.CACHE_DISTANCE_M) return null;
        // LRU trick: re-insert to move to end of Map (most recently used)
        State.cache.delete(key);
        State.cache.set(key, { ...entry, ts: Date.now() });
        return entry;
    };

    const cacheSet = (key, pos, name) => {
        // Eviction: remove expired entries first, then FIFO if still over limit
        if (State.cache.size >= CFG.MAX_CACHE_SIZE) {
            const now = Date.now();
            for (const [k, v] of State.cache.entries()) {
                if (now - v.ts > CFG.CACHE_MAX_AGE_MS) { State.cache.delete(k); break; }
            }
        }
        if (State.cache.size >= CFG.MAX_CACHE_SIZE) {
            State.cache.delete(State.cache.keys().next().value);
        }
        State.cache.set(key, { lat: pos.lat, lng: pos.lng, name, ts: Date.now() });
    };

    // ========================================================================
    // STYLES & LEAFLET LOADER
    // ========================================================================
    const injectStyles = () => {
        if (document.getElementById('gd-styles')) return;
        const s = document.createElement('style'); s.id = 'gd-styles';
        // CSS Isolation: contain and isolate prevent interference with game map
        s.textContent = `
:root{--gd-b:#3b82f6;--gd-bg:#fff;--gd-t:#111;--gd-br:#e5e7eb;--gd-sh:0 6px 16px rgba(0,0,0,.2);--gd-ok:#22c55e;--gd-err:#ef4444}
[data-theme=dark],.dark{--gd-bg:#1f2937;--gd-t:#f9fafb;--gd-br:#374151}
#gw{position:fixed;top:calc(${CFG.BTN_TOP}px + 46px + ${CFG.MAP_GAP}px);left:${CFG.BTN_LEFT}px;z-index:99999;width:380px;height:300px;border-radius:14px;background:var(--gd-bg);box-shadow:var(--gd-sh);display:none;opacity:0;transform:scale(.97);transition:opacity .2s,transform .2s;overflow:hidden;border:1px solid var(--gd-br);isolation:isolate;contain:strict;touch-action:none}
#gw.v{display:block;opacity:1;transform:scale(1)}
#gm{width:100%;height:100%;border-radius:14px;isolation:isolate}
#gt{position:absolute;top:0;left:0;right:0;padding:7px 10px;background:var(--gd-bg);color:var(--gd-t);font-size:12px;font-weight:600;text-align:center;z-index:1002;pointer-events:none;user-select:none}
#gi{position:absolute;bottom:0;left:0;right:0;padding:9px 12px;background:rgba(17,24,39,.96);color:#fff;font-size:13px;z-index:1001;display:flex;align-items:center;justify-content:space-between;pointer-events:none;user-select:none}
#gtx{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gdt{width:9px;height:9px;border-radius:50%;background:var(--gd-err);margin-left:9px;border:2px solid #fff;flex-shrink:0}
#gi.c #gdt{background:var(--gd-ok)}
#gl{position:absolute;top:32px;left:9px;z-index:1001;display:flex;gap:5px;scrollbar-width:none}
#gl::-webkit-scrollbar{display:none}
.glb{background:var(--gd-bg);color:var(--gd-t);border:1px solid var(--gd-br);border-radius:7px;padding:3px 9px;cursor:pointer;font-size:10px;transition:all .12s;pointer-events:auto;user-select:none;touch-action:manipulation}
.glb.a,.glb:hover{background:var(--gd-b);color:#fff;border-color:var(--gd-b)}
#bw{position:fixed;top:${CFG.BTN_TOP}px;left:${CFG.BTN_LEFT}px;z-index:100000;isolation:isolate}
#gb{width:46px;height:46px;background:var(--gd-b);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:grab;box-shadow:var(--gd-sh);font-size:20px;transition:transform .12s,background .15s;user-select:none;touch-action:manipulation}
#gb:hover{transform:scale(1.06);background:#2563eb}
#gb:active{transform:scale(.98);cursor:grabbing}
.gmk div{background:var(--gd-b)!important;width:13px!important;height:13px!important;border-radius:50%!important;border:3px solid #fff!important;box-shadow:0 2px 6px rgba(0,0,0,.35)!important}
`;
        document.head.appendChild(s);
    };

    const loadLeaflet = (cb) => {
        if (window.L) { cb(); return; }
        // Only inject CSS if not present (prevents conflicts with game's Leaflet)
        if (!document.querySelector('link[href*="leaflet.css"]')) {
            const l = document.createElement('link'); l.rel = 'stylesheet';
            l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            l.onerror = () => warn('Leaflet CSS failed');
            document.head.appendChild(l);
        }
        const sc = document.createElement('script'); sc.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        sc.onload = cb; sc.onerror = () => warn('Leaflet JS failed');
        document.head.appendChild(sc);
    };

    // ========================================================================
    // UI & MAP INITIALIZATION
    // ========================================================================
    const buildUI = () => {
        if (State.els.wrap) return;
        const wrap = document.createElement('div'); wrap.id = 'gw'; document.body.appendChild(wrap); State.els.wrap = wrap;
        const tl = document.createElement('div'); tl.id = 'gt'; tl.textContent = '🗺️ Minimap'; wrap.appendChild(tl);
        const mc = document.createElement('div'); mc.id = 'gm'; wrap.appendChild(mc);
        const inf = document.createElement('div'); inf.id = 'gi'; inf.className = 'd';
        const tx = document.createElement('span'); tx.id = 'gtx'; tx.textContent = '📍 Waiting...';
        // ARIA attributes for accessibility: screen readers announce status changes
        tx.setAttribute('role', 'status');
        tx.setAttribute('aria-live', 'polite');
        tx.setAttribute('aria-atomic', 'true');
        const dt = document.createElement('span'); dt.id = 'gdt';
        inf.append(tx, dt); wrap.appendChild(inf);
        Object.assign(State.els, { info: inf, infoText: tx, statusDot: dt });
        if (CFG.ENABLE_LAYER_SWITCHER) {
            const lc = document.createElement('div'); lc.id = 'gl'; wrap.appendChild(lc); State.els.layerCtrl = lc;
        }
        loadLeaflet(() => setupMap());
    };

    const setupMap = () => {
        if (State.map) return;
        State.markerIcon = L.divIcon({ className: 'gmk', html: '<div></div>', iconSize: [17,17], iconAnchor: [8,8] });
        const sv = loadMapView(), ctr = sv?.center || CFG.DEFAULT_CENTER, zm = sv?.zoom || CFG.DEFAULT_ZOOM;

        State.map = L.map('gm', {
            attributionControl: false, zoomControl: false, dragging: true, scrollWheelZoom: true,
            worldCopyJump: true, maxBoundsViscosity: 1, preferCanvas: CFG.PREFER_CANVAS_RENDERER,
            fadeAnimation: false, zoomAnimation: false, markerZoomAnimation: false
        }).setView(ctr, zm);

        const onStart = () => State.interacting = true;
        const onEnd = () => setTimeout(() => State.interacting = false, 80);
        State.map.on('mousedown touchstart', onStart, { passive: true });
        State.map.on('mouseup touchend', onEnd, { passive: true });
        State.map.on('zoomstart', onStart);
        State.map.on('moveend zoomend', () => { onEnd(); if (!State.interacting) saveMapView(); });

        const layers = {
            'Std': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '©OSM', noWrap: false }),
            'Sat': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '©Esri', noWrap: false }),
            'Top': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '©OTM', noWrap: false })
        };
        layers['Std'].addTo(State.map);

        if (CFG.ENABLE_LAYER_SWITCHER && State.els.layerCtrl) {
            Object.keys(layers).forEach(n => {
                const b = document.createElement('button'); b.textContent = n;
                b.className = 'glb' + (n === 'Std' ? ' a' : ''); b.type = 'button'; b.dataset.layer = n;
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

        const p = getCurrentPosition();
        if (p) updateMinimap(p, true);
        startPolling();
    };

    // ========================================================================
    // MINIMAP & GEOCODING
    // ========================================================================
    const updateMinimap = (pos, setView = false) => {
        if (!State.map) return;
        State.lastPos = pos;
        if (State.els.info) {
            State.els.info.className = 'c';
            clrTimer('statusReset');
            regTimer('statusReset', setTimeout(() => { if (State.els.info) State.els.info.className = 'd'; }, CFG.STATUS_RESET));
        }
        if (State.marker) State.marker.setLatLng([pos.lat, pos.lng]);
        else State.marker = L.marker([pos.lat, pos.lng], { icon: State.markerIcon }).addTo(State.map);
        if (setView && !State.interacting) State.map.setView([pos.lat, pos.lng], State.map.getZoom() || 12);
        updateInfoPanel(pos);
    };

    const updateInfoPanel = async (pos) => {
        if (!State.els.infoText) return;
        clrTimer('nomDebounce');

        const fetchPlace = async (signal) => {
            let nm = 'Unknown', key = `${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`;

            // LRU-style cache lookup
            const cached = cacheGet(key, pos);
            if (cached) {
                nm = cached.name; State.placeName = nm;
            } else {
                try {
                    // Fetch with retry logic and AbortController signal
                    const r = await fetchWithRetry(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`,
                        { headers: { 'Accept-Language': 'en' }, cache: 'force-cache', signal }
                    );
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const d = await r.json();
                    if (d?.address) {
                        const co = d.address.country || '',
                              ci = d.address.city || d.address.town || d.address.village || d.address.state || '';
                        nm = ci ? `${co}, ${ci}`.trim() : co || 'Unknown';
                        if (nm && !nm.includes('Unknown')) {
                            State.placeName = nm;
                            cacheSet(key, pos, nm);
                        }
                    }
                } catch (e) {
                    if (e.name === 'AbortError') return; // Silently ignore aborted requests
                    warn('Nominatim err:', e.message);
                    nm = State.placeName !== 'Unknown' ? `${State.placeName} ⏳` : '📍 Offline';
                }
            }
            if (State.els.infoText) State.els.infoText.textContent = `📍 ${nm}`;
        };

        regTimer('nomDebounce', setTimeout(() => {
            // Cancel any pending fetch before starting a new one
            if (State.timers.nomFetchCtrl?.abort) State.timers.nomFetchCtrl.abort();
            const ctrl = new AbortController();
            regTimer('nomFetchCtrl', ctrl);
            fetchPlace(ctrl.signal);
        }, CFG.NOMINATIM_DEBOUNCE));
    };

    // Adaptive polling based on movement speed
    const startPolling = () => {
        clrTimer('poll');
        State.polling.lastPoll = 0;

        const pollLoop = () => {
            // Pause polling if tab is hidden or minimap is not visible
            if (document.hidden || !State.visible) {
                regTimer('poll', setTimeout(pollLoop, 1000));
                return;
            }

            const p = getCurrentPosition();
            if (p) {
                const now = Date.now();
                // Calculate distance from last known position
                const dist = State.lastPos ? haversine(p.lat, p.lng, State.lastPos.lat, State.lastPos.lng) : Infinity;

                // Adaptive interval: slow (<10m) → 5s, medium (<50m) → 2.5s, fast → 1s
                const minInterval = dist < CFG.DISTANCE_THRESHOLD_SLOW ? CFG.POLL_INTERVAL_SLOW
                                    : dist < CFG.DISTANCE_THRESHOLD_FAST ? CFG.POLL_INTERVAL
                                    : CFG.POLL_INTERVAL_FAST;

                // Only poll if enough time has passed since last successful poll
                if (now - State.polling.lastPoll >= minInterval) {
                    if (!State.lastPos || p.lat !== State.lastPos.lat || p.lng !== State.lastPos.lng) {
                        updateMinimap(p, true);
                    }
                    State.polling.lastPoll = now;
                }
            }
            // Schedule next check (non-blocking recursive timeout)
            regTimer('poll', setTimeout(pollLoop, 500));
        };
        pollLoop();
    };

    // ========================================================================
    // BUTTON & DRAG HANDLING (Safe)
    // ========================================================================
    const createToggleButton = () => {
        if (State.els.btnWrap) return;
        const wrap = document.createElement('div'); wrap.id = 'bw'; document.body.appendChild(wrap); State.els.btnWrap = wrap;
        const btn = document.createElement('div'); btn.id = 'gb'; btn.textContent = '🗺️'; btn.title = 'Toggle (click) / Drag to move';
        btn.setAttribute('role', 'button'); btn.setAttribute('tabindex', '0');
        wrap.appendChild(btn);

        const toggle = () => {
            if (!State.els.wrap) return;
            const v = State.els.wrap.classList.toggle('v');
            State.visible = v;
            if (v && State.map && State.lastPos) {
                State.map.invalidateSize();
                State.map.setView([State.lastPos.lat, State.lastPos.lng], State.map.getZoom() || 12);
            }
        };
        btn.addEventListener('click', toggle, { passive: true });

        // Safe drag handling with threshold detection
        let isDragging = false, startX, startY, origL, origT;
        const move = (e) => {
            const cx = e.touches?.[0]?.clientX ?? e.clientX, cy = e.touches?.[0]?.clientY ?? e.clientY;
            if (!isDragging && (Math.abs(cx - startX) > 5 || Math.abs(cy - startY) > 5)) {
                isDragging = true; btn.style.cursor = 'grabbing';
            }
            if (isDragging) {
                wrap.style.left = `${origL + cx - startX}px`;
                wrap.style.top = `${origT + cy - startY}px`;
                if (State.els.wrap) {
                    State.els.wrap.style.left = wrap.style.left;
                    State.els.wrap.style.top = `${wrap.offsetTop + 58}px`;
                }
            }
        };
        const up = () => {
            document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
            document.removeEventListener('touchmove', move, { passive: false }); document.removeEventListener('touchend', up);
            btn.style.cursor = 'grab';
            if (!isDragging) toggle();
            isDragging = false;
        };
        const down = (e) => {
            e.preventDefault?.();
            startX = e.touches?.[0]?.clientX ?? e.clientX; startY = e.touches?.[0]?.clientY ?? e.clientY;
            origL = wrap.offsetLeft; origT = wrap.offsetTop; isDragging = false;
            document.addEventListener('mousemove', move, { passive: true }); document.addEventListener('mouseup', up);
            document.addEventListener('touchmove', move, { passive: false }); document.addEventListener('touchend', up);
        };
        btn.addEventListener('mousedown', down, { passive: true });
        btn.addEventListener('touchstart', down, { passive: false });

        // Safety cleanup if user leaves window during drag
        window.addEventListener('blur', up, { passive: true });
    };

    // ========================================================================
    // INIT & KILL SWITCH
    // ========================================================================
    const init = () => {
        if (State.initialized) return; State.initialized = true;
        log('v3.6.0 init (enhanced, conflict-free)');
        injectStyles(); createToggleButton(); buildUI();
    };

    const bootstrap = () => {
        let att = 0;
        const check = () => {
            if (State.initialized) return;
            att++;
            if (findStreetViewIframe()) { init(); return; }
            if (att < 30) setTimeout(check, 800);
        };
        document.readyState === 'loading'
            ? document.addEventListener('DOMContentLoaded', check, { once: true })
            : setTimeout(check, 300);
    };
    bootstrap();

    // Emergency Kill - complete cleanup for SPA navigation
    window.__gd_kill__ = () => {
        clrAllTimers();
        ['gw','bw','gd-styles'].forEach(i => document.getElementById(i)?.remove());
        if (State.map) { try { State.map.remove(); } catch(e){} }
        Object.assign(State, {
            initialized:false, els:{}, timers:{}, cache:new Map(),
            map:null, marker:null, lastPos:null, polling:{ lastPoll:0, lastCheck:0 }
        });
        log('Killed');
    };

    // Keyboard shortcuts: Ctrl+Alt+K for kill, M for toggle
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'k') {
            e.preventDefault(); window.__gd_kill__();
        }
        if (CFG.ENABLE_KEYBOARD_TOGGLE && e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.altKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault(); State.els.btnWrap?.querySelector('#gb')?.click();
        }
    }, { capture: true, passive: false });

    // Cleanup on page unload (SPA navigation safety)
    window.addEventListener('beforeunload', () => {
        if (State.initialized) window.__gd_kill__();
    }, { passive: true });

})();
