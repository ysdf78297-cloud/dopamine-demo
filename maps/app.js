(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };

  const STYLES = {
    colored: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      max: 19
    },
    mono: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      max: 19
    },
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "&copy; Esri, Maxar, Earthstar Geographics",
      max: 19
    }
  };

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "vendor/images/marker-icon-2x.png",
    iconUrl: "vendor/images/marker-icon.png",
    shadowUrl: "vendor/images/marker-shadow.png"
  });

  const map = L.map("map", { zoomControl: false, worldCopyJump: true, attributionControl: true }).setView([20, 0], 2);
  map.attributionControl.setPrefix(false);

  let styleName = load("mapStyle2", "colored");
  if (!STYLES[styleName]) styleName = "colored";
  let tileLayer = null;

  function applyStyle(name) {
    if (!STYLES[name]) name = "colored";
    styleName = name;
    if (tileLayer) tileLayer.remove();
    const style = STYLES[name];
    tileLayer = L.tileLayer(style.url, {
      maxZoom: style.max,
      attribution: style.attribution,
      subdomains: "abcd",
      keepBuffer: 2,
      fadeAnimation: true
    }).addTo(map);
    map.getContainer().classList.toggle("mono", name === "mono");
    save("mapStyle2", name);

    document.querySelectorAll(".opt").forEach((b) => {
      b.classList.toggle("active", b.dataset.style === name);
    });
  }

  let start = null;
  let startMarker = null;
  let startHalo = null;
  let destMarker = null;
  let routes = [];
  let routeLayers = [];
  let trafficLayer = null;
  let selected = 0;
  let nav = null;
  let navMarker = null;
  let navTimers = [];
  let searchTimer = null;
  let audioCtx = null;

  let coordsOn = load("coords", "0") === "1";
  let speedOn = load("speed", "1") === "1";
  let mode = load("travelMode", "driving");
  let lastDest = null;

  /* ---------- markers ---------- */

  function setStart(latlng, fly) {
    start = latlng;

    if (!startMarker) {
      startHalo = L.circleMarker(latlng, {
        radius: 22, stroke: false, fillColor: "#1a73e8", fillOpacity: 0.16
      }).addTo(map);
      startMarker = L.circleMarker(latlng, {
        radius: 8, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1
      }).addTo(map);
    } else {
      startMarker.setLatLng(latlng);
      startHalo.setLatLng(latlng);
    }

    if (fly) map.flyTo(latlng, 15, { duration: 1.2 });
  }

  const destIcon = L.divIcon({
    className: "dest-pin",
    html: '<div class="pin-head"></div>',
    iconSize: [30, 42],
    iconAnchor: [15, 40]
  });

  function setDest(latlng) {
    if (!destMarker) destMarker = L.marker(latlng, { icon: destIcon }).addTo(map);
    else destMarker.setLatLng(latlng);
  }

  function formatMin(seconds) { return Math.max(1, Math.round(seconds / 60)) + " min"; }
  function formatMi(meters) { return (meters / 1609.34).toFixed(1) + " mi"; }

  /* ---------- globe ---------- */

  let globeStarted = false;
  let globeRenderer = null;
  let globeScene = null;
  let globeCamera = null;
  let globeSphere = null;
  let globeDragging = false;
  let globeLast = null;
  let globeMoved = 0;

  function initGlobe() {
    if (globeStarted) return;
    if (!window.THREE) return;

    const canvas = $("globeCanvas");
    const w = window.innerWidth;
    const h = window.innerHeight;

    try {
      globeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      $("globe").classList.add("hidden");
      return;
    }
    globeRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    globeRenderer.setSize(w, h);

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    globeCamera.position.z = 2.9;

    globeScene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 3, 5);
    globeScene.add(light);

    const texture = new THREE.TextureLoader().load(window.EARTH_TEXTURE || "vendor/earth.jpg");
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

    globeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({ map: texture })
    );
    globeScene.add(globeSphere);

    canvas.addEventListener("pointerdown", (event) => {
      globeDragging = true;
      globeMoved = 0;
      globeLast = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!globeDragging || !globeLast) return;
      const dx = event.clientX - globeLast.x;
      const dy = event.clientY - globeLast.y;
      globeMoved += Math.abs(dx) + Math.abs(dy);
      globeSphere.rotation.y += dx * 0.005;
      globeSphere.rotation.x = Math.max(-1.2, Math.min(1.2, globeSphere.rotation.x + dy * 0.005));
      globeLast = { x: event.clientX, y: event.clientY };
    });

    canvas.addEventListener("pointerup", () => {
      globeDragging = false;
      globeLast = null;
    });

    canvas.addEventListener("click", () => {
      if (globeMoved > 12) return;
      hideGlobe();
      map.setZoom(4, { animate: true });
    });

    globeStarted = true;

    const animate = () => {
      if (!globeStarted) return;
      if (!globeDragging) globeSphere.rotation.y += 0.0013;
      globeRenderer.render(globeScene, globeCamera);
      requestAnimationFrame(animate);
    };
    animate();
  }

  function showGlobe() {
    $("globe").classList.remove("hidden");
    initGlobe();
  }

  function hideGlobe() {
    $("globe").classList.add("hidden");
  }



  /* ---------- routes ---------- */

  function clearRoutes() {
    routeLayers.forEach((layer) => layer.remove());
    routeLayers = [];
    if (trafficLayer) { trafficLayer.remove(); trafficLayer = null; }
  }

  function drawRoutes() {
    clearRoutes();

    routes.forEach((route, index) => {
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      const line = L.polyline(coords, {
        color: index === selected ? "#1a73e8" : "#9aa6b2",
        weight: index === selected ? 7 : 5,
        opacity: index === selected ? 1 : 0.7,
        dashArray: route.offline ? "8 8" : null,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(map);

      line.on("click", () => {
        selected = index;
        drawRoutes();
        renderRoutes($("destName").textContent);
      });

      routeLayers.push(line);
      if (index === selected) line.bringToFront();
    });
  }

  function offlineRoute(a, b) {
    const A = L.latLng(a);
    const B = L.latLng(b);
    const direct = map.distance(A, B);
    const distance = Math.max(120, direct * 1.35);
    const duration = Math.max(60, distance / 13.4);
    const coords = [];
    const steps = 10;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const lat = A.lat + (B.lat - A.lat) * t + Math.sin(t * Math.PI) * 0.0004;
      const lng = A.lng + (B.lng - A.lng) * t + Math.sin(t * Math.PI) * 0.0004;
      coords.push([lng, lat]);
    }

    return { distance, duration, geometry: { coordinates: coords }, offline: true, legs: [] };
  }

  function fitRoutes() {
    if (!routes.length) return;
    const coords = routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
    map.fitBounds(L.latLngBounds(coords), { padding: [70, 70], animate: true, duration: 0.8 });
  }

  function getRecent() {
    try { return JSON.parse(localStorage.getItem("recentMaps") || "[]"); } catch (e) { return []; }
  }

  function addRecent(name, lat, lng) {
    const list = getRecent().filter((r) => Math.abs(r.lat - lat) > 0.00001 || Math.abs(r.lng - lng) > 0.00001);
    list.unshift({ name, lat, lng });
    try { localStorage.setItem("recentMaps", JSON.stringify(list.slice(0, 6))); } catch (e) {}
  }

  let currentPlace = null;

  function openPlace(place) {
    currentPlace = place;
    $("placeName").textContent = place.name;
    const coords = parseFloat(place.lat).toFixed(5) + ", " + parseFloat(place.lon).toFixed(5);
    $("placeMeta").textContent = place.display_name + "\n" + coords;
    $("placeDesc").textContent = "Loading details\u2026";
    $("placeReviews").textContent = "Reviews aren\u2019t available for this place.";
    $("placeImage").style.backgroundImage = "none";

    $("searchSheet").classList.add("hidden");
    $("placeSheet").classList.remove("hidden");

    const wiki = place.extratags && place.extratags.wikipedia;
    if (!wiki) {
      $("placeDesc").textContent = "No description available for this place.";
      return;
    }

    const title = wiki.split(":").pop();
    fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title.replace(/ /g, "_")))
      .then((r) => r.json())
      .then((data) => {
        if (data.extract) $("placeDesc").textContent = data.extract;
        else $("placeDesc").textContent = "No description available for this place.";
        if (data.thumbnail && data.thumbnail.source) {
          $("placeImage").style.backgroundImage = "url('" + data.thumbnail.source + "')";
        }
      })
      .catch(() => {
        $("placeDesc").textContent = "No description available for this place.";
      });
  }

  function renderRecent() {
    const box = $("recent");
    box.innerHTML = "";
    const list = getRecent();
    if (!list.length) return;

    const title = document.createElement("div");
    title.className = "recentTitle";
    title.textContent = "Recent searches";
    box.appendChild(title);

    list.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "recentRow";
      btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
      const span = document.createElement("span");
      span.textContent = item.name + " \u00b7 " + item.lat.toFixed(3) + ", " + item.lng.toFixed(3);
      btn.appendChild(span);
      btn.addEventListener("click", () => pickDestination([item.lat, item.lng], item.name));
      box.appendChild(btn);
    });
  }

  function renderRoutes(name) {
    const alts = $("alts");
    alts.innerHTML = "";

    routes.forEach((route, index) => {
      const btn = document.createElement("button");
      btn.className = "alt" + (index === selected ? " selected" : "");
      const label = index === 0 ? "Fastest route" : "Alternate " + index;
      const tag = route.offline ? "offline estimate" : (route.legs && route.legs[0] && route.legs[0].summary) || "driving";

      btn.innerHTML = '<span class="altInfo"><b>' + label + '</b><span>' +
        formatMi(route.distance) + " \u00b7 " + tag +
        '</span></span><span class="altTime">' + formatMin(route.duration) + "</span>";

      btn.addEventListener("click", () => {
        selected = index;
        drawRoutes();
        renderRoutes(name);
      });

      alts.appendChild(btn);
    });

    const route = routes[selected];
    $("destName").textContent = name;
    $("destSub").textContent = formatMin(route.duration) + " \u00b7 " + formatMi(route.distance) +
      (route.offline ? " \u00b7 offline estimate" : "");
    $("routeState").classList.remove("hidden");
    $("sheet").classList.remove("hidden", "collapsed");
  }

  async function fetchRoutes(latlng, name) {
    $("routeState").classList.add("hidden");
    $("sheet").classList.add("hidden");

    let list = [];

    if (navigator.onLine) {
      const origin = L.latLng(start);
      const base = "https://router.project-osrm.org/route/v1/" + mode + "/" +
        origin.lng.toFixed(6) + "," + origin.lat.toFixed(6) + ";" +
        latlng[1].toFixed(6) + "," + latlng[0].toFixed(6);

      const urls = [
        base + "?alternatives=true&overview=full&geometries=geojson&steps=true&annotations=speed",
        base + "?alternatives=true&overview=full&geometries=geojson&steps=true",
        base + "?overview=full&geometries=geojson"
      ];

      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.routes && data.routes.length) {
            list = data.routes;
            break;
          }
        } catch (e) {
        }
      }
    }

    if (!list.length) {
      list = [offlineRoute(start, latlng)];
      showAlert("No road route available \u2014 direct estimate", "#b26a00");
    }

    routes = list.slice(0, 3);
    selected = 0;
    drawRoutes();
    fitRoutes();
    renderRoutes(name);
  }
  async function pickDestination(latlng, name) {
    closeSearchSheet();
    hideGlobe();
    $("searchText").textContent = name;
    setDest(latlng);
    addRecent(name, latlng[0], latlng[1]);
    lastDest = { latlng, name };

    if (!start) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 });
        });
        setStart([pos.coords.latitude, pos.coords.longitude], false);
      } catch (e) {
        const center = map.getCenter();
        setStart([center.lat, center.lng], false);
      }
    }

    await fetchRoutes(latlng, name);
  }

  /* ---------- search ---------- */

  function hint(text) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = text;
    return div;
  }

  function resultButton(titleText, subText, onClick) {
    const btn = document.createElement("button");
    btn.className = "result";

    const pin = document.createElement("span");
    pin.className = "pin";
    pin.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

    const info = document.createElement("span");
    info.className = "rinfo";

    const title = document.createElement("b");
    title.textContent = titleText;

    const sub = document.createElement("span");
    sub.textContent = subText;

    info.appendChild(title);
    info.appendChild(sub);
    btn.appendChild(pin);
    btn.appendChild(info);

    btn.addEventListener("click", onClick);
    return btn;
  }

  async function searchPlaces(query) {
    const box = $("results");
    box.innerHTML = "";
    $("recent").innerHTML = "";

    const trimmed = query.trim();
    if (!trimmed) return;

    const coords = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coords) {
      const lat = parseFloat(coords[1]);
      const lng = parseFloat(coords[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        box.appendChild(resultButton("Dropped pin", lat.toFixed(5) + ", " + lng.toFixed(5), () => {
          pickDestination([lat, lng], "Dropped pin");
        }));
        return;
      }
    }

    if (!navigator.onLine) {
      const center = map.getCenter();
      box.appendChild(resultButton(trimmed, "Offline \u00b7 use map center (" + center.lat.toFixed(4) + ", " + center.lng.toFixed(4) + ")", () => {
        pickDestination([center.lat, center.lng], trimmed);
      }));
      box.appendChild(hint("Live search needs internet"));
      return;
    }

    box.appendChild(hint("Searching\u2026"));

    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&limit=7&q=" + encodeURIComponent(trimmed),
        { headers: { Accept: "application/json" } }
      );
      const list = await res.json();
      box.innerHTML = "";

      if (!list.length) {
        const center = map.getCenter();
        box.appendChild(resultButton(trimmed, "Use map center", () => {
          pickDestination([center.lat, center.lng], trimmed);
        }));
        return;
      }

      list.forEach((place) => {
        const title = place.name || place.display_name.split(",")[0];
        const coords = parseFloat(place.lat).toFixed(4) + ", " + parseFloat(place.lon).toFixed(4);
        box.appendChild(resultButton(title, place.display_name + " \u00b7 " + coords, () => {
          openPlace(place);
        }));
      });
    } catch (e) {
      box.innerHTML = "";
      const center = map.getCenter();
      box.appendChild(resultButton(trimmed, "Offline \u00b7 use map center", () => {
        pickDestination([center.lat, center.lng], trimmed);
      }));
    }
  }

  /* ---------- sounds and alerts ---------- */

  function audio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, start, duration, type, volume) {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(volume || 0.15, ctx.currentTime + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.02);
  }

  function siren() {
    const ctx = audio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    for (let i = 0; i < 10; i++) osc.frequency.setValueAtTime(i % 2 ? 1150 : 700, ctx.currentTime + i * 0.3);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.22, ctx.currentTime + 2.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 3.05);
  }

  function crashSound() {
    const ctx = audio();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.45), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.3;
    src.buffer = buffer;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  function showAlert(text, color) {
    const box = $("alert");
    $("alertText").textContent = text;
    box.style.background = color || "#b3261e";
    box.classList.remove("hidden");
    clearTimeout(showAlert.timer);
    showAlert.timer = setTimeout(() => box.classList.add("hidden"), 4200);
  }

  function trafficEvent() {
    if (!nav) return;
    nav.extra = (nav.extra || 0) + 180;
    $("warningText").textContent = "Traffic ahead";
    $("warningSign").classList.remove("hidden");
    tone(440, 0, 0.14, "square", 0.16);
    tone(520, 0.18, 0.14, "square", 0.16);
    tone(620, 0.36, 0.14, "square", 0.16);
    showAlert("Traffic ahead \u00b7 +3 min", "#b26a00");

    if (!trafficLayer && routes[selected]) {
      const coords = routes[selected].geometry.coordinates;
      const mid = coords.slice(Math.floor(coords.length * 0.35), Math.ceil(coords.length * 0.65));
      trafficLayer = L.polyline(mid.map((c) => [c[1], c[0]]), {
        color: "#f9ab00", weight: 8, opacity: 0.95, lineCap: "round"
      }).addTo(map);
    }
  }

  /* ---------- navigation ---------- */

  function pointAt(coords, segs, target) {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (target <= acc + segs[i]) {
        const f = segs[i] === 0 ? 0 : (target - acc) / segs[i];
        const a = coords[i];
        const b = coords[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      acc += segs[i];
    }
    return coords[coords.length - 1];
  }

  function nearestFraction(latlng) {
    const coords = nav.coords;
    if (coords.length < 2) return 0;

    let total = 0;
    const segs = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const d = map.distance(coords[i], coords[i + 1]);
      segs.push(d);
      total += d;
    }

    const p = L.latLng(latlng);
    let best = Infinity;
    let fraction = 0;
    let acc = 0;

    for (let i = 0; i < coords.length - 1; i++) {
      const a = L.latLng(coords[i]);
      const b = L.latLng(coords[i + 1]);
      const ax = a.lng, ay = a.lat, bx = b.lng, by = b.lat;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 === 0 ? 0 : ((p.lng - ax) * dx + (p.lat - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const proj = [ay + dy * t, ax + dx * t];
      const d = map.distance(p, proj);
      if (d < best) {
        best = d;
        fraction = total === 0 ? 0 : (acc + segs[i] * t) / total;
      }
      acc += segs[i];
    }

    return fraction;
  }

  function updateNav(c) {
    if (!nav) return;

    const latlng = [c.latitude, c.longitude];
    nav.lastFix = Date.now();
    navMarker.setLatLng(latlng);

    if (!nav.lastCam || map.distance(latlng, nav.lastCam) > 12) {
      if (!nav.following) map.setView(latlng, 18, { animate: false });
      else map.panTo(latlng, { animate: false, noMoveStart: true });
      nav.lastCam = latlng;
      nav.following = true;
    }

    const progress = nearestFraction(latlng);
    nav.progress = progress;

    const destLatLng = destMarker ? destMarker.getLatLng() : L.latLng(nav.coords[nav.coords.length - 1]);
    const distToDest = map.distance(latlng, destLatLng);

    const remaining = Math.max(0, 1 - progress);
    const seconds = nav.route.duration + (nav.extra || 0);
    $("navEta").textContent = distToDest < 45 ? "Arrived" : formatMin(seconds * remaining);
    $("navMiles").textContent = formatMi(nav.route.distance * remaining);

    if (c.speed != null && !isNaN(c.speed)) setSpeed(c.speed * 2.23694);

    const travelled = nav.route.distance * progress;

    if (nav.speeds && nav.speeds.length) {
      const index = Math.min(nav.speeds.length - 1, Math.round(progress * (nav.speeds.length - 1)));
      const kmh = nav.speeds[index];
      if (typeof kmh === "number" && kmh >= 25) {
        $("speedLimit").textContent = Math.round((kmh * 0.621371) / 5) * 5;
        $("speedSign").classList.remove("hidden");
      }
    }

    while (nav.stepIndex < nav.steps.length && travelled >= nav.stepCum[nav.stepIndex - 1]) {
      const step = nav.steps[nav.stepIndex];
      say(voiceStep(step, 0));
      nav.stepIndex++;
    }

    updateNextBanner();

    if (distToDest < 45 && !nav.arrived) {
      nav.arrived = true;
      speak("You have arrived at your destination");
      $("navEta").textContent = "Arrived";
      $("nextBanner").classList.add("hidden");
    }
  }

  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find((v) => /samantha|aria|jenny|google us english/i.test(v.name)) ||
      voices.find((v) => (v.lang || "").toLowerCase().indexOf("en") === 0);
    if (best) utterance.voice = best;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function stepText(step) {
    if (!step || !step.maneuver) return "";
    const m = step.maneuver;
    const road = step.name || "the road ahead";
    const mod = m.modifier || "";
    if (m.type === "depart") return "Head " + (mod && mod !== "straight" ? mod + " " : "") + "on " + road;
    if (m.type === "arrive") return "You have arrived at your destination";
    if (m.type === "turn") return "Turn " + (mod || "ahead") + " onto " + road;
    if (m.type === "new name" || m.type === "continue") return "Continue on " + road;
    if (m.type === "merge") return "Merge " + (mod || "ahead") + " onto " + road;
    if (m.type === "fork") return "Keep " + (mod || "ahead") + " onto " + road;
    if (m.type === "roundabout" || m.type === "rotary") return "Take the roundabout onto " + road;
    if (m.type === "end of road") return "At the end of the road, turn " + mod + " onto " + road;
    return "Continue on " + road;
  }

  function setSpeed(value) {
    $("speedValue").textContent = Math.round(Math.max(0, value));
  }

  function shortDistance(meters) {
    const feet = meters * 3.28084;
    if (feet < 1000) return Math.max(50, Math.round(feet / 50) * 50) + " ft";
    return (meters / 1609.34).toFixed(1) + " mi";
  }

  function say(text) {
    speak(text);
  }

  function voiceStep(step, meters) {
    return (meters > 0 ? voiceDistance(meters) + ", " : "") + stepText(step);
  }

  function voiceDistance(meters) {
    const feet = meters * 3.28084;
    if (feet < 900) return "In " + Math.max(50, Math.round(feet / 50) * 50) + " feet";
    return "In " + (meters / 1609.34).toFixed(1) + " miles";
  }

  function updateNextBanner() {
    if (!nav || !nav.steps.length) return;
    const index = Math.min(nav.stepIndex, nav.steps.length - 1);
    const remaining = Math.max(0, nav.stepCum[index - 1] - nav.route.distance * nav.progress);
    const text = stepText(nav.steps[index]);
    $("nextText").textContent = text + (remaining > 5 ? " in " + shortDistance(remaining) : "");
    $("nextBanner").classList.remove("hidden");
  }

  function showNavUi() {
    $("maps").classList.add("ui");
    clearTimeout(showNavUi.timer);
    showNavUi.timer = setTimeout(() => $("maps").classList.remove("ui"), 10000);
  }

  function startNav() {
    if (!routes.length) return;

    audio();

    const route = routes[selected];
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
    nav = {
      route, coords, steps: [], stepCum: [], stepIndex: 1, extra: 0,
      arrived: false, lastFix: 0, watch: null, progress: 0, limit: null
    };

    (route.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => nav.steps.push(step));
    });

    let accDist = 0;
    nav.steps.forEach((step) => {
      accDist += step.distance || 0;
      nav.stepCum.push(accDist);
    });

    nav.following = true;
    nav.idleTimer = setInterval(() => {
      if (!nav) return;
      if (nav.lastFix && Date.now() - nav.lastFix > 3000 && nav.following) {
        nav.following = false;
        fitRoutes();
      }
    }, 1000);

    let limit = null;
    const annotation = route.legs && route.legs[0] && route.legs[0].annotation;
    nav.speeds = (annotation && annotation.speed) || [];
    const values = nav.speeds.filter((v) => typeof v === "number" && v >= 25).sort((a, b) => a - b);
    if (values.length) {
      limit = Math.round((values[Math.floor(values.length / 2)] * 0.621371) / 5) * 5;
    }

    if (limit) {
      $("speedLimit").textContent = limit;
      $("speedSign").classList.remove("hidden");
    } else {
      $("speedSign").classList.add("hidden");
    }
    nav.limit = limit;

    $("maps").classList.add("navigating");
    $("maps").classList.remove("ui");
    $("speedValue").textContent = "0";
    if (speedOn) $("speedo").classList.remove("hidden");

    if (navMarker) navMarker.remove();
    navMarker = L.circleMarker(start ? L.latLng(start) : coords[0], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1
    }).addTo(map);

    $("sheet").classList.add("hidden");
    $("navBanner").classList.remove("hidden");
    $("navCancel").textContent = "Cancel";
    map.flyTo(start ? L.latLng(start) : coords[0], 18, { duration: 0.9 });

    if (nav.steps.length) {
      say("Starting navigation. " + stepText(nav.steps[0]));
      $("nextText").textContent = stepText(nav.steps[0]);
      $("nextBanner").classList.remove("hidden");
    }

    if (navigator.geolocation) {
      nav.watch = navigator.geolocation.watchPosition(
        (pos) => updateNav(pos.coords),
        () => showAlert("Waiting for GPS\u2026", "#123a8c"),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );

      nav.waitTimer = setTimeout(() => {
        if (nav && !nav.lastFix) showAlert("Waiting for GPS\u2026", "#123a8c");
      }, 8000);
    } else {
      showAlert("GPS unavailable", "#123a8c");
    }
  }

  function stopNav() {
    if (!nav) return;

    const running = nav;
    nav = null;
    clearTimeout(running.waitTimer);
    clearInterval(running.idleTimer);
    if (running.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(running.watch);
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    if (navMarker) { navMarker.remove(); navMarker = null; }
    $("alert").classList.add("hidden");
    $("navBanner").classList.add("hidden");
    $("nextBanner").classList.add("hidden");
    $("speedSign").classList.add("hidden");
    $("warningSign").classList.add("hidden");
    $("speedo").classList.add("hidden");
    $("maps").classList.remove("navigating", "ui");
    if (routes.length) $("sheet").classList.remove("hidden");
    fitRoutes();
  }
  /* ---------- sheets ---------- */

  function closeSearchSheet() {
    const sheet = $("searchSheet");
    const panel = sheet.querySelector(".searchPanel");
    sheet.classList.add("closing");
    panel.classList.add("closing");
    setTimeout(() => {
      sheet.classList.add("hidden");
      sheet.classList.remove("closing");
      panel.classList.remove("closing");
    }, 260);
  }

  function closeSettingsSheet() {
    const sheet = $("settingsSheet");
    const panel = sheet.querySelector(".searchPanel");
    sheet.classList.add("closing");
    panel.classList.add("closing");
    setTimeout(() => {
      sheet.classList.add("hidden");
      sheet.classList.remove("closing");
      panel.classList.remove("closing");
    }, 260);
  }

  /* ---------- coordinates ---------- */

  function showCoord(latlng) {
    $("coordText").textContent = latlng.lat.toFixed(5) + ", " + latlng.lng.toFixed(5);
    $("coordChip").classList.remove("hidden");
    $("coordChip").dataset.lat = latlng.lat;
    $("coordChip").dataset.lng = latlng.lng;
  }

  map.on("click", (event) => {
    if (nav) { showNavUi(); return; }
    showCoord(event.latlng);
  });

  map.on("move", () => {
    if (!coordsOn) return;
    showCoord(map.getCenter());
  });

  /* ---------- wiring ---------- */

  $("searchBtn").addEventListener("click", () => {
    $("searchSheet").classList.remove("hidden");
    $("results").innerHTML = "";
    renderRecent();
    setTimeout(() => $("searchInput").focus(), 60);
  });

  $("closeSearch").addEventListener("click", closeSearchSheet);
  $("searchSheet").addEventListener("click", (event) => {
    if (event.target === $("searchSheet")) closeSearchSheet();
  });

  $("searchInput").addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchTimer);

    if (!value.trim()) {
      $("results").innerHTML = "";
      renderRecent();
      return;
    }

    $("recent").innerHTML = "";
    searchTimer = setTimeout(() => searchPlaces(value), 350);
  });

  $("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(searchTimer);
      searchPlaces(event.target.value);
    }
  });

  document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
      save("travelMode", mode);
      if (lastDest && start) fetchRoutes(lastDest.latlng, lastDest.name);
    });
  });

  document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));

  $("placeGo").addEventListener("click", () => {
    if (!currentPlace) return;
    $("placeSheet").classList.add("hidden");
    pickDestination([parseFloat(currentPlace.lat), parseFloat(currentPlace.lon)], currentPlace.name);
  });
  $("placeClose").addEventListener("click", () => $("placeSheet").classList.add("hidden"));
  $("placeSheet").addEventListener("click", (event) => {
    if (event.target === $("placeSheet")) $("placeSheet").classList.add("hidden");
  });

  $("go").addEventListener("click", startNav);
  $("navCancel").addEventListener("click", stopNav);

  $("zoomIn").addEventListener("click", () => map.zoomIn());
  $("zoomOut").addEventListener("click", () => map.zoomOut());
  $("world").addEventListener("click", () => {
    if ($("globe").classList.contains("hidden")) {
      showGlobe();
    } else {
      hideGlobe();
      map.setZoom(4, { animate: true });
    }
  });
  $("locate").addEventListener("click", () => {
    if (start) map.flyTo(start, 15, { duration: 1.2 });
    else askLocation();
  });

  $("coordGo").addEventListener("click", () => {
    const lat = parseFloat($("coordChip").dataset.lat);
    const lng = parseFloat($("coordChip").dataset.lng);
    if (!isNaN(lat) && !isNaN(lng)) pickDestination([lat, lng], "Dropped pin");
  });

  $("settingsBtn").addEventListener("click", () => $("settingsSheet").classList.remove("hidden"));
  $("closeSettings").addEventListener("click", closeSettingsSheet);
  $("settingsSheet").addEventListener("click", (event) => {
    if (event.target === $("settingsSheet")) closeSettingsSheet();
  });

  document.querySelectorAll(".opt").forEach((btn) => {
    btn.addEventListener("click", () => applyStyle(btn.dataset.style));
  });


  $("toggleSpeed").addEventListener("click", () => {
    speedOn = !speedOn;
    $("toggleSpeed").classList.toggle("on", speedOn);
    save("speed", speedOn ? "1" : "0");
    if (speedOn && nav) $("speedo").classList.remove("hidden");
    if (!speedOn) $("speedo").classList.add("hidden");
  });

  $("toggleCoords").addEventListener("click", () => {
    coordsOn = !coordsOn;
    $("toggleCoords").classList.toggle("on", coordsOn);
    save("coords", coordsOn ? "1" : "0");
    if (coordsOn) showCoord(map.getCenter());
    else $("coordChip").classList.add("hidden");
  });

  $("permLater").addEventListener("click", () => $("perm").classList.add("hidden"));
  $("openSettings").addEventListener("click", () => {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openSettings) {
      window.webkit.messageHandlers.openSettings.postMessage("open");
    } else {
      window.location.href = "app-settings:";
    }
  });

  /* draggable bottom sheet */
  (() => {
    const sheet = $("sheet");
    const grab = $("sheetGrab");
    let startY = 0;
    let offset = 0;
    let dragging = false;

    grab.addEventListener("pointerdown", (event) => {
      dragging = true;
      startY = event.clientY;
      offset = 0;
      sheet.style.transition = "none";
      grab.setPointerCapture(event.pointerId);
    });

    grab.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      offset = event.clientY - startY;
      if (offset < -90) offset = -90;
      if (offset > 90) offset = 90;
      sheet.style.transform = "translateY(" + offset + "px)";
    });

    function release() {
      if (!dragging) return;
      dragging = false;
      sheet.style.transition = "";
      sheet.style.transform = "";
      if (offset > 40) sheet.classList.add("collapsed");
      else if (offset < -30) sheet.classList.remove("collapsed");
    }

    grab.addEventListener("pointerup", release);
    grab.addEventListener("pointercancel", release);
  })();

  function askLocation() {
    if (!navigator.geolocation) { $("perm").classList.remove("hidden"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setStart([pos.coords.latitude, pos.coords.longitude], true),
      (error) => { if (error.code === 1) $("perm").classList.remove("hidden"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  /* start */
  applyStyle(styleName);

  $("toggleCoords").classList.toggle("on", coordsOn);
  $("toggleSpeed").classList.toggle("on", speedOn);
  askLocation();
})();