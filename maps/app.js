(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const map = L.map("map", {
    zoomControl: false,
    worldCopyJump: true
  }).setView([20, 0], 2);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
  }).addTo(map);

  let start = null;
  let startMarker = null;
  let startHalo = null;
  let destMarker = null;
  let routes = [];
  let routeLayers = [];
  let selected = 0;
  let nav = null;
  let navMarker = null;
  let searchTimer = null;

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

  function formatMin(seconds) {
    return Math.max(1, Math.round(seconds / 60)) + " min";
  }

  function formatMi(meters) {
    return (meters / 1609.34).toFixed(1) + " mi";
  }

  function clearRoutes() {
    routeLayers.forEach((layer) => layer.remove());
    routeLayers = [];
  }

  function drawRoutes() {
    clearRoutes();

    routes.forEach((route, index) => {
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      const line = L.polyline(coords, {
        color: index === selected ? "#1a73e8" : "#9aa6b2",
        weight: index === selected ? 7 : 5,
        opacity: index === selected ? 1 : 0.7,
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
      const via = route.legs && route.legs[0] && route.legs[0].summary ? route.legs[0].summary : "driving";

      btn.innerHTML = '<span class="altInfo"><b>' + label + '</b><span>' +
        formatMi(route.distance) + " \u00b7 " + via +
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
      " \u00b7 " + (navigator.onLine ? "online" : "offline");
    $("emptyState").classList.add("hidden");
    $("routeState").classList.remove("hidden");
  }

  async function fetchRoutes(latlng, name) {
    $("emptyState").innerHTML = '<b>Finding the fastest route\u2026</b><span>Calculating on the map</span>';
    $("emptyState").classList.remove("hidden");
    $("routeState").classList.add("hidden");

    try {
      const origin = L.latLng(start);
      const url = "https://router.project-osrm.org/route/v1/driving/" +
        origin.lng.toFixed(6) + "," + origin.lat.toFixed(6) + ";" +
        latlng[1].toFixed(6) + "," + latlng[0].toFixed(6) +
        "?alternatives=true&overview=full&geometries=geojson&steps=false";

      const res = await fetch(url);
      const data = await res.json();

      if (!data.routes || !data.routes.length) throw new Error("no route");

      routes = data.routes.slice(0, 3);
      selected = 0;
      drawRoutes();
      fitRoutes();
      renderRoutes(name);
    } catch (e) {
      $("emptyState").innerHTML = '<b>Route unavailable</b><span>Check your connection and try again.</span>';
    }
  }

  async function pickDestination(latlng, name) {
    $("searchSheet").classList.add("hidden");
    $("searchText").textContent = name;
    setDest(latlng);

    if (!start) {
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 });
        });
        setStart([pos.coords.latitude, pos.coords.longitude], true);
      } catch (e) {
        showPerm();
        $("routeState").classList.add("hidden");
        $("emptyState").classList.remove("hidden");
        $("emptyState").innerHTML = '<b>Location needed</b><span>Allow location access in Settings to calculate routes.</span>';
        return;
      }
    }

    await fetchRoutes(latlng, name);
  }

  function hint(text) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = text;
    return div;
  }

  async function searchPlaces(query) {
    const box = $("results");
    box.innerHTML = "";

    if (!query.trim()) return;
    if (!navigator.onLine) {
      box.appendChild(hint("Search needs internet"));
      return;
    }

    box.appendChild(hint("Searching\u2026"));

    try {
      const res = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=7&q=" + encodeURIComponent(query),
        { headers: { Accept: "application/json" } }
      );
      const list = await res.json();
      box.innerHTML = "";

      if (!list.length) {
        box.appendChild(hint("No places found"));
        return;
      }

      list.forEach((place) => {
        const btn = document.createElement("button");
        btn.className = "result";

        const pin = document.createElement("span");
        pin.className = "pin";
        pin.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

        const info = document.createElement("span");
        info.className = "rinfo";

        const title = document.createElement("b");
        title.textContent = place.name || place.display_name.split(",")[0];

        const sub = document.createElement("span");
        sub.textContent = place.display_name;

        info.appendChild(title);
        info.appendChild(sub);
        btn.appendChild(pin);
        btn.appendChild(info);

        btn.addEventListener("click", () => {
          pickDestination([parseFloat(place.lat), parseFloat(place.lon)], title.textContent);
        });

        box.appendChild(btn);
      });
    } catch (e) {
      box.innerHTML = "";
      box.appendChild(hint("Search failed \u2014 check your connection"));
    }
  }

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
    $("navEta").textContent = t >= 1 ? "Arrived" : formatMin(nav.route.duration * remaining);
    $("navMiles").textContent = formatMi(nav.route.distance * remaining);

    if (t >= 1) {
      $("navCancel").textContent = "Done";
      return;
    }

    requestAnimationFrame(stepNav);
  }

  function startNav() {
    if (!routes.length) return;

    const route = routes[selected];
    const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

    let total = 0;
    const segs = [];
    for (let i = 0; i < coords.length - 1; i++) {
      const d = map.distance(coords[i], coords[i + 1]);
      segs.push(d);
      total += d;
    }

    nav = { coords, segs, total, started: performance.now(), duration: 20000, route };

    if (navMarker) navMarker.remove();
    navMarker = L.circleMarker(coords[0], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: "#1a73e8", fillOpacity: 1
    }).addTo(map);

    $("sheet").classList.add("hidden");
    $("navBanner").classList.remove("hidden");
    $("navCancel").textContent = "Cancel";

    map.flyTo(coords[0], 16, { duration: 0.9 });
    requestAnimationFrame(stepNav);
  }

  function stopNav() {
    if (!nav) return;
    nav = null;
    if (navMarker) {
      navMarker.remove();
      navMarker = null;
    }
    $("navBanner").classList.add("hidden");
    $("sheet").classList.remove("hidden");
    fitRoutes();
  }

  function showPerm() {
    $("perm").classList.remove("hidden");
  }

  function askLocation() {
    if (!navigator.geolocation) {
      showPerm();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStart([pos.coords.latitude, pos.coords.longitude], true);
      },
      (error) => {
        if (error.code === 1) showPerm();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  function updateNet() {
    const online = navigator.onLine;
    $("netChip").classList.toggle("off", !online);
    $("netText").textContent = online ? "Online" : "Offline";
  }

  $("searchBtn").addEventListener("click", () => {
    $("searchSheet").classList.remove("hidden");
    setTimeout(() => $("searchInput").focus(), 60);
  });

  $("closeSearch").addEventListener("click", () => $("searchSheet").classList.add("hidden"));
  $("searchSheet").addEventListener("click", (event) => {
    if (event.target === $("searchSheet")) $("searchSheet").classList.add("hidden");
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

  $("permLater").addEventListener("click", () => $("perm").classList.add("hidden"));
  $("openSettings").addEventListener("click", () => {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openSettings) {
      window.webkit.messageHandlers.openSettings.postMessage("open");
    } else {
      window.location.href = "app-settings:";
    }
  });

  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  askLocation();
})();
