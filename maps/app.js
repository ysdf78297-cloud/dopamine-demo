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

  const map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([20, 0], 2);

  let styleName = load("mapStyle", "colored");
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
      subdomains: "abcd"
    }).addTo(map);
    map.getContainer().classList.toggle("mono", name === "mono");
    save("mapStyle", name);

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
  let alertsOn = load("alerts", "1") === "1";
  let coordsOn = load("coords", "0") === "1";
  let speedOn = load("speed", "1") === "1";

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

  function setDest(latlng) {
    if (!destMarker) destMarker = L.marker(latlng).addTo(map);
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

    globeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    globeRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    globeRenderer.setSize(w, h);

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    globeCamera.position.z = 2.9;

    globeScene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 3, 5);
    globeScene.add(light);

    const texture = new THREE.TextureLoader().load("vendor/earth.jpg");
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

  map.on("zoomend", () => {
    if (map.getZoom() <= 3) showGlobe();
    else hideGlobe();
  });

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
    $("emptyState").classList.add("hidden");
    $("routeState").classList.remove("hidden");
    $("sheet").classList.remove("collapsed");
  }

  async function fetchRoutes(latlng, name) {
    $("emptyState").innerHTML = '<b>Finding the fastest route\u2026</b><span>Calculating on the map</span>';
    $("emptyState").classList.remove("hidden");
    $("routeState").classList.add("hidden");

    let list = [];

    if (navigator.onLine) {
      try {
        const origin = L.latLng(start);
        const url = "https://router.project-osrm.org/route/v1/driving/" +
          origin.lng.toFixed(6) + "," + origin.lat.toFixed(6) + ";" +
          latlng[1].toFixed(6) + "," + latlng[0].toFixed(6) +
          "?alternatives=true&overview=full&geometries=geojson&steps=true";
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length) list = data.routes;
      } catch (e) {
        list = [];
      }
    }

    if (!list.length) {
      list = [offlineRoute(start, latlng)];
    }

    routes = list.slice(0, 3);
    selected = 0;
    drawRoutes();
    fitRoutes();
    renderRoutes(name);
  }

  async function pickDestination(latlng, name) {
    closeSearchSheet();
    $("searchText").textContent = name;
    setDest(latlng);

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
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&q=" + encodeURIComponent(trimmed),
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
        box.appendChild(resultButton(title, place.display_name, () => {
          pickDestination([parseFloat(place.lat), parseFloat(place.lon)], title);
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

  function stepNav() {
    if (!nav) return;

    const t = Math.min(1, (performance.now() - nav.started) / nav.duration);
    const p = pointAt(nav.coords, nav.segs, nav.total * t);
    navMarker.setLatLng(p);
    map.panTo(p, { animate: false, noMoveStart: true });

    const remaining = 1 - t;
    const seconds = nav.route.duration + (nav.extra || 0);
    $("navEta").textContent = t >= 1 ? "Arrived" : formatMin(seconds * remaining);
    $("navMiles").textContent = formatMi(nav.route.distance * remaining);

    if (nav.steps && nav.stepIndex < nav.steps.length &&
        nav.total * t >= nav.stepCum[nav.stepIndex - 1]) {
      speak(stepText(nav.steps[nav.stepIndex]));
      nav.stepIndex++;
    }

    if (t >= 1) {
      $("navCancel").textContent = "Done";
      if (!nav.arrived) {
        nav.arrived = true;
        speak("You have arrived at your destination");
      }
      return;
    }
    requestAnimationFrame(stepNav);
  }

  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const best = voices.find((v) => /samantha|aria|jenny|google us english/i.test(v.name)) ||
      voices.find((v) => (v.lang || "").toLowerCase().indexOf("en") === 0);
    if (best) utterance.voice = best;
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
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
    let total = 0;
    const segs = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const d = map.distance(coords[i], coords[i + 1]);
      segs.push(d);
      total += d;
    }

    nav = { coords, segs, total, started: performance.now(), duration: 22000, route, extra: 0 };

    const steps = [];
    (route.legs || []).forEach((leg) => {
      (leg.steps || []).forEach((step) => steps.push(step));
    });
    nav.steps = steps;
    nav.stepIndex = 1;
    nav.stepCum = [];
    let accDist = 0;
    steps.forEach((step) => {
      accDist += step.distance || 0;
      nav.stepCum.push(accDist);
    });

    const limitChoices = [25, 30, 35, 40];
    let hash = 0;
    for (let i = 0; i < $("destName").textContent.length; i++) hash += $("destName").textContent.charCodeAt(i);
    nav.limit = limitChoices[hash % limitChoices.length];

    $("speedLimit").textContent = nav.limit;
    $("speedSign").classList.remove("hidden");
    $("maps").classList.add("navigating");
    $("maps").classList.remove("ui");

    if (speedOn) {
      $("speedo").classList.remove("hidden");
      nav.realSpeed = false;

      if (navigator.geolocation) {
        nav.watch = navigator.geolocation.watchPosition(
          (pos) => {
            if (pos.coords.speed != null && !isNaN(pos.coords.speed)) {
              nav.realSpeed = true;
              setSpeed(pos.coords.speed * 2.23694);
            }
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      }

      nav.speedTimer = setInterval(() => {
        if (!nav) return;
        if (!nav.realSpeed) setSpeed(nav.limit + Math.sin(performance.now() / 2500) * 5 - 2);
      }, 1200);
    }

    setTimeout(() => {
      if (!nav) return;
      $("warningText").textContent = "No parking";
      $("warningSign").classList.remove("hidden");
    }, 5000);

    if (steps.length) speak(stepText(steps[0]));

    if (navMarker) navMarker.remove();
    navMarker = L.circleMarker(coords[0], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1
    }).addTo(map);

    $("sheet").classList.add("hidden");
    $("navBanner").classList.remove("hidden");
    $("navCancel").textContent = "Cancel";
    map.flyTo(coords[0], 16, { duration: 0.9 });
    requestAnimationFrame(stepNav);

    navTimers.forEach(clearTimeout);
    navTimers = [];

    if (alertsOn) {
      navTimers.push(setTimeout(() => { if (nav) trafficEvent(); }, 4500));
      navTimers.push(setTimeout(() => {
        if (!nav) return;
        siren();
        showAlert("Police detected nearby", "#123a8c");
      }, 10000));
      navTimers.push(setTimeout(() => {
        if (!nav) return;
        crashSound();
        showAlert("Car crash ahead", "#b3261e");
      }, 16000));
    }
  }

  function stopNav() {
    if (!nav) return;
    const running = nav;
    nav = null;
    navTimers.forEach(clearTimeout);
    navTimers = [];
    if (running) {
      if (running.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(running.watch);
      clearInterval(running.speedTimer);
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (navMarker) { navMarker.remove(); navMarker = null; }
    if (trafficLayer) { trafficLayer.remove(); trafficLayer = null; }
    $("alert").classList.add("hidden");
    $("navBanner").classList.add("hidden");
    $("speedSign").classList.add("hidden");
    $("warningSign").classList.add("hidden");
    $("speedo").classList.add("hidden");
    $("maps").classList.remove("navigating", "ui");
    $("sheet").classList.remove("hidden");
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
    setTimeout(() => $("searchInput").focus(), 60);
  });

  $("closeSearch").addEventListener("click", closeSearchSheet);
  $("searchSheet").addEventListener("click", (event) => {
    if (event.target === $("searchSheet")) closeSearchSheet();
  });

  $("searchInput").addEventListener("input", (event) => {
    const value = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchPlaces(value), 350);
  });

  $("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      clearTimeout(searchTimer);
      searchPlaces(event.target.value);
    }
  });

  $("go").addEventListener("click", startNav);
  $("navCancel").addEventListener("click", stopNav);

  $("zoomIn").addEventListener("click", () => map.zoomIn());
  $("zoomOut").addEventListener("click", () => map.zoomOut());
  $("world").addEventListener("click", () => map.flyTo([20, 0], 2, { duration: 1.6 }));
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

  $("toggleAlerts").addEventListener("click", () => {
    alertsOn = !alertsOn;
    $("toggleAlerts").classList.toggle("on", alertsOn);
    save("alerts", alertsOn ? "1" : "0");
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
  $("toggleAlerts").classList.toggle("on", alertsOn);
  $("toggleCoords").classList.toggle("on", coordsOn);
  $("toggleSpeed").classList.toggle("on", speedOn);
  askLocation();
})();
