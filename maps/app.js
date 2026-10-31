(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const map = $("map");
  const baseG = $("base");
  const roadsG = $("roads");
  const routesG = $("routes");
  const markersG = $("markers");
  const labelsG = $("labels");

  const view = { x: 0, y: 0, w: 1000, h: 1600 };

  function applyView() {
    map.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
  }

  function clampView() {
    view.w = Math.max(240, Math.min(1000, view.w));
    view.h = view.w * 1.6;
    view.x = Math.max(0, Math.min(1000 - view.w, view.x));
    view.y = Math.max(0, Math.min(1600 - view.h, view.y));
    applyView();
  }

  function zoomAt(factor, px, py) {
    const rect = map.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (px - rect.left) / rect.width));
    const fy = Math.max(0, Math.min(1, (py - rect.top) / rect.height));
    const mx = view.x + fx * view.w;
    const my = view.y + fy * view.h;
    view.w = view.w / factor;
    view.h = view.w * 1.6;
    view.x = mx - fx * view.w;
    view.y = my - fy * view.h;
    clampView();
  }

  const VX = [120, 300, 480, 660, 840];
  const HY = [160, 360, 560, 760, 960, 1160, 1360];
  const MILES_PER_PX = 0.011;
  const BASE_MPH = 27;

  const nodes = new Map();
  const adj = new Map();
  const nid = (i, j) => i + ":" + j;

  for (let i = 0; i < VX.length; i++) {
    for (let j = 0; j < HY.length; j++) {
      nodes.set(nid(i, j), { x: VX[i], y: HY[j] });
    }
  }

  function addEdge(a, b, factor) {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    const A = nodes.get(a);
    const B = nodes.get(b);
    const d = Math.hypot(A.x - B.x, A.y - B.y);
    adj.get(a).push({ to: b, d, factor });
    adj.get(b).push({ to: a, d, factor });
  }

  for (let i = 0; i < VX.length; i++) {
    for (let j = 0; j < HY.length; j++) {
      if (i < VX.length - 1) addEdge(nid(i, j), nid(i + 1, j), j === 3 ? 1.4 : 1);
      if (j < HY.length - 1) addEdge(nid(i, j), nid(i, j + 1), i === 2 ? 1.4 : 1);
    }
  }
  addEdge(nid(0, 6), nid(4, 0), 2.2);

  const START = nid(2, 5);

  const PLACES = [
    { name: "Home", sub: "34 Palm Avenue", node: nid(1, 5) },
    { name: "Coffee Lab", sub: "1st & Main", node: nid(3, 2) },
    { name: "Grand Mall", sub: "Northside Center", node: nid(4, 4) },
    { name: "Airport", sub: "Terminal 2", node: nid(4, 0) },
    { name: "City Park", sub: "Riverside", node: nid(0, 2) },
    { name: "Office", sub: "480 Central Blvd", node: nid(2, 3) },
    { name: "Gym", sub: "Pine Street", node: nid(1, 1) },
    { name: "Library", sub: "Civic Center", node: nid(3, 5) }
  ];

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function edgeKey(a, b) {
    return a < b ? a + ">" + b : b + ">" + a;
  }

  function route(from, to, penalties) {
    const dist = new Map();
    const prev = new Map();
    const done = new Set();
    dist.set(from, 0);
    const queue = [[0, from]];

    while (queue.length) {
      queue.sort((a, b) => a[0] - b[0]);
      const entry = queue.shift();
      const u = entry[1];
      if (done.has(u)) continue;
      done.add(u);
      if (u === to) break;

      const edges = adj.get(u) || [];
      for (const e of edges) {
        const mult = penalties.get(edgeKey(u, e.to)) || 1;
        const w = ((e.d * MILES_PER_PX) / (BASE_MPH * e.factor)) * mult;
        const nd = entry[0] + w;
        const old = dist.has(e.to) ? dist.get(e.to) : Infinity;
        if (nd < old) {
          dist.set(e.to, nd);
          prev.set(e.to, u);
          queue.push([nd, e.to]);
        }
      }
    }

    if (!dist.has(to)) return null;

    const path = [];
    let cur = to;
    while (cur !== from) {
      path.push(cur);
      cur = prev.get(cur);
      if (cur === undefined) return null;
    }
    path.push(from);
    path.reverse();

    let miles = 0;
    let minutes = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const e = (adj.get(a) || []).find((x) => x.to === b);
      if (!e) continue;
      miles += e.d * MILES_PER_PX;
      minutes += ((e.d * MILES_PER_PX) / (BASE_MPH * e.factor)) * 60;
    }

    return { path, miles, minutes };
  }

  function computeRoutes(dest) {
    const best = route(START, dest, new Map());
    if (!best) return [];

    const p1 = new Map();
    for (let i = 0; i < best.path.length - 1; i++) p1.set(edgeKey(best.path[i], best.path[i + 1]), 6);
    const alt1 = route(START, dest, p1);

    const p2 = new Map(p1);
    if (alt1) for (let i = 0; i < alt1.path.length - 1; i++) p2.set(edgeKey(alt1.path[i], alt1.path[i + 1]), 6);
    const alt2 = route(START, dest, p2);

    return [best, alt1, alt2].filter(Boolean);
  }

  /* ---------- map drawing ---------- */

  const bg = el("rect", { x: 0, y: 0, width: 1000, height: 1600, fill: "#e9eef3" }, baseG);
  el("path", {
    d: "M0 0 L150 0 C190 180 120 320 170 500 C220 680 140 840 190 1020 C230 1180 150 1380 180 1600 L0 1600 Z",
    fill: "#aacfec"
  }, baseG);
  el("path", {
    d: "M150 0 C190 180 120 320 170 500 C220 680 140 840 190 1020 C230 1180 150 1380 180 1600",
    fill: "none", stroke: "#94c2e6", "stroke-width": 10
  }, baseG);

  el("rect", { x: 560, y: 380, width: 220, height: 160, rx: 16, fill: "#cfe7cd" }, baseG);
  el("rect", { x: 90, y: 900, width: 150, height: 200, rx: 14, fill: "#cfe7cd" }, baseG);
  el("rect", { x: 700, y: 1180, width: 120, height: 120, rx: 12, fill: "#cfe7cd" }, baseG);

  for (let i = 0; i < VX.length - 1; i++) {
    for (let j = 0; j < HY.length - 1; j++) {
      const x = VX[i] + 26;
      const y = HY[j] + 26;
      const w = 50;
      const h = 40;
      el("rect", { x, y, width: w, height: h, rx: 4, fill: "#dfe3e8" }, baseG);
      el("rect", { x: x + w + 18, y, width: 44, height: 30, rx: 4, fill: "#e4e8ec" }, baseG);
      el("rect", { x, y: y + h + 14, width: 30, height: 46, rx: 4, fill: "#e4e8ec" }, baseG);
      el("rect", { x: x + 46, y: y + h + 14, width: 52, height: 28, rx: 4, fill: "#dfe3e8" }, baseG);
    }
  }

  const drawn = new Set();
  adj.forEach((edges, from) => {
    for (const e of edges) {
      const key = edgeKey(from, e.to);
      if (drawn.has(key)) continue;
      drawn.add(key);
      const A = nodes.get(from);
      const B = nodes.get(e.to);
      const fast = e.factor >= 2 || (from.startsWith("2:") && e.to.startsWith("2:")) || (from.endsWith(":3") && e.to.endsWith(":3"));
      el("line", {
        x1: A.x, y1: A.y, x2: B.x, y2: B.y,
        stroke: "#c7cdd4", "stroke-width": fast ? 16 : 11, "stroke-linecap": "round"
      }, roadsG);
      el("line", {
        x1: A.x, y1: A.y, x2: B.x, y2: B.y,
        stroke: fast ? "#ffe9a8" : "#ffffff", "stroke-width": fast ? 11 : 7, "stroke-linecap": "round"
      }, roadsG);
    }
  });

  const labelStyle = { "font-size": 13, fill: "#7c8794", "font-family": "Segoe UI, sans-serif", "font-weight": 600, "letter-spacing": 0.6 };
  [
    ["Riverside", 210, 260],
    ["Downtown", 520, 620],
    ["Northside", 740, 300],
    ["Old Town", 300, 1000],
    ["Civic Center", 620, 1120],
    ["Industrial", 760, 1420],
    ["Green Park", 640, 470]
  ].forEach(([text, x, y]) => {
    const t = el("text", Object.assign({ x, y }, labelStyle), labelsG);
    t.textContent = text;
  });

  const startMarker = el("g", { transform: "translate(" + nodes.get(START).x + "," + nodes.get(START).y + ")" }, markersG);
  el("circle", { r: 26, fill: "#1a73e8", opacity: 0.25, class: "pulse" }, startMarker);
  el("circle", { r: 9, fill: "#1a73e8", stroke: "#fff", "stroke-width": 3 }, startMarker);

  let destMarker = null;

  function showDest(nodeId) {
    if (destMarker) destMarker.remove();
    const n = nodes.get(nodeId);
    destMarker = el("g", { transform: "translate(" + n.x + "," + n.y + ")" }, markersG);
    el("path", {
      d: "M0 0 C-13 -16 -18 -24 -18 -32 A18 18 0 1 1 18 -32 C18 -24 13 -16 0 0 Z",
      fill: "#e8453c", stroke: "#fff", "stroke-width": 2.5
    }, destMarker);
    el("circle", { cx: 0, cy: -32, r: 6, fill: "#fff" }, destMarker);
  }

  let selectedRoute = null;
  let routes = [];
  let currentDest = null;

  function drawRoutes(list) {
    routesG.innerHTML = "";
    const ordered = list.slice().reverse();
    ordered.forEach((r) => {
      const pts = r.path.map((id) => nodes.get(id));
      const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x + " " + p.y).join(" ");
      const isSelected = r === selectedRoute;
      const path = el("path", {
        d,
        class: "routeLine routeAnimate",
        stroke: isSelected ? "#1a73e8" : "#9aa6b2",
        "stroke-width": isSelected ? 8 : 6,
        opacity: isSelected ? 1 : 0.75
      }, routesG);

      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      requestAnimationFrame(() => {
        path.style.strokeDashoffset = 0;
      });
    });
  }

  function formatMiles(m) {
    return m.toFixed(1) + " mi";
  }

  function formatMinutes(m) {
    return Math.max(1, Math.round(m)) + " min";
  }

  function renderRoutes() {
    const alts = $("alts");
    alts.innerHTML = "";

    routes.forEach((r, index) => {
      const btn = document.createElement("button");
      btn.className = "alt" + (r === selectedRoute ? " selected" : "");
      btn.innerHTML = '<span class="altInfo"><b>' + (index === 0 ? "Fastest route" : "Alternate " + index) +
        '</b><span>' + formatMiles(r.miles) + " \u00b7 via " + (index === 0 ? "Main St" : index === 1 ? "Central Blvd" : "River Rd") +
        '</span></span><span class="altTime">' + formatMinutes(r.minutes) + "</span>";
      btn.addEventListener("click", () => {
        selectedRoute = r;
        drawRoutes(routes);
        renderRoutes();
      });
      alts.appendChild(btn);
    });

    const best = routes[0];
    $("destName").textContent = currentDest.name;
    $("destSub").textContent = "Fastest " + formatMinutes(selectedRoute.minutes) + " \u00b7 " + formatMiles(selectedRoute.miles) + " \u00b7 " + (navigator.onLine ? "online" : "offline");
    $("destName").style.color = "#202124";
    $("destSub").style.color = "#70757a";
    void best;
  }

  function pickPlace(place) {
    currentDest = place;
    routes = computeRoutes(place.node);
    selectedRoute = routes[0];
    showDest(place.node);
    drawRoutes(routes);
    renderRoutes();
    $("emptyState").classList.add("hidden");
    $("routeState").classList.remove("hidden");
    $("searchText").textContent = place.name;
    $("searchSheet").classList.add("hidden");
    resetCamera();
  }

  function placeDistance(place) {
    const a = nodes.get(START);
    const b = nodes.get(place.node);
    return Math.hypot(a.x - b.x, a.y - b.y) * MILES_PER_PX * 1.25;
  }

  function renderResults(filter) {
    const box = $("results");
    box.innerHTML = "";
    const needle = (filter || "").toLowerCase();
    const list = PLACES.filter((p) => p.name.toLowerCase().includes(needle) || p.sub.toLowerCase().includes(needle));

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No places found offline";
      empty.style.padding = "18px 2px";
      empty.style.color = "#70757a";
      box.appendChild(empty);
      return;
    }

    list.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "result";
      btn.innerHTML = '<span class="pin"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>' +
        '<span class="rinfo"><b>' + p.name + "</b><span>" + p.sub + "</span></span>" +
        '<span class="rdist">' + placeDistance(p).toFixed(1) + " mi</span>";
      btn.addEventListener("click", () => pickPlace(p));
      box.appendChild(btn);
    });
  }

  /* ---------- navigation ---------- */

  let nav = null;

  function pathPoints(r) {
    return r.path.map((id) => nodes.get(id));
  }

  function pointAt(pts, fraction) {
    let total = 0;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segs.push(d);
      total += d;
    }
    let target = total * Math.min(1, Math.max(0, fraction));
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i]) {
        const t = segs[i] === 0 ? 0 : target / segs[i];
        return {
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t
        };
      }
      target -= segs[i];
    }
    return pts[pts.length - 1];
  }

  function setCamera(x, y) {
    const w = 620;
    const h = 900;
    const cx = Math.min(1000 - w / 2, Math.max(w / 2, x));
    const cy = Math.min(1600 - h / 2, Math.max(h / 2, y));
    view.w = w;
    view.h = h;
    view.x = cx - w / 2;
    view.y = cy - h / 2;
    applyView();
  }

  function resetCamera() {
    const n = nodes.get(START);
    view.w = 620;
    view.h = view.w * 1.6;
    view.x = n.x - view.w / 2;
    view.y = n.y - view.h / 2;
    clampView();
  }

  function startNav() {
    if (!selectedRoute) return;
    const pts = pathPoints(selectedRoute);
    nav = {
      pts,
      route: selectedRoute,
      start: performance.now(),
      duration: 16000,
      raf: 0,
      done: false
    };

    $("sheet").classList.add("hidden");
    $("navBanner").classList.remove("hidden");
    $("navCancel").textContent = "Cancel";

    const dot = el("g", { id: "navDot" }, markersG);
    el("circle", { r: 30, fill: "#1a73e8", opacity: 0.2, class: "pulse" }, dot);
    el("circle", { r: 9, fill: "#1a73e8", stroke: "#fff", "stroke-width": 3 }, dot);

    const step = () => {
      if (!nav) return;
      const t = Math.min(1, (performance.now() - nav.start) / nav.duration);
      const p = pointAt(nav.pts, t);
      dot.setAttribute("transform", "translate(" + p.x + "," + p.y + ")");
      setCamera(p.x, p.y);

      const remaining = Math.max(0, nav.route.minutes * (1 - t));
      $("navEta").textContent = t >= 1 ? "Arrived" : formatMinutes(remaining);
      $("navMiles").textContent = formatMiles(nav.route.miles * (1 - t));

      if (t >= 1) {
        nav.done = true;
        $("navCancel").textContent = "Done";
        return;
      }
      nav.raf = requestAnimationFrame(step);
    };

    nav.raf = requestAnimationFrame(step);
  }

  function stopNav() {
    if (!nav) return;
    cancelAnimationFrame(nav.raf);
    const dot = document.getElementById("navDot");
    if (dot) dot.remove();
    nav = null;
    $("navBanner").classList.add("hidden");
    $("sheet").classList.remove("hidden");
    resetCamera();
  }

  /* ---------- wiring ---------- */

  $("searchBtn").addEventListener("click", () => {
    $("searchSheet").classList.remove("hidden");
    renderResults("");
    setTimeout(() => $("searchInput").focus(), 60);
  });

  $("closeSearch").addEventListener("click", () => $("searchSheet").classList.add("hidden"));
  $("searchSheet").addEventListener("click", (event) => {
    if (event.target === $("searchSheet")) $("searchSheet").classList.add("hidden");
  });

  $("searchInput").addEventListener("input", (event) => renderResults(event.target.value));
  $("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = $("results").querySelector(".result");
      if (first) first.click();
    }
  });

  $("go").addEventListener("click", startNav);
  $("navCancel").addEventListener("click", stopNav);

  renderResults("");

  (function initView() {
    const n = nodes.get(START);
    view.w = 620;
    view.h = view.w * 1.6;
    view.x = n.x - view.w / 2;
    view.y = n.y - view.h / 2;
    clampView();
  })();

  /* ---------- pan and zoom ---------- */

  const pointers = new Map();
  let dragStart = null;
  let pinchStart = null;
  const mapWrap = $("mapWrap");

  mapWrap.addEventListener("pointerdown", (event) => {
    if (event.target.closest("#topbar, #mapControls, #netChip, #sheet, #searchSheet, #perm")) return;
    mapWrap.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 1) {
      dragStart = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchStart = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        w: view.w,
        cx: view.x + view.w / 2,
        cy: view.y + view.h / 2
      };
      dragStart = null;
    }
  });

  mapWrap.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = map.getBoundingClientRect();

    if (pointers.size === 1 && dragStart) {
      const scale = view.w / rect.width;
      view.x = dragStart.vx - (event.clientX - dragStart.x) * scale;
      view.y = dragStart.vy - (event.clientY - dragStart.y) * scale;
      clampView();
    } else if (pointers.size === 2 && pinchStart) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = dist / Math.max(1, pinchStart.dist);
      view.w = Math.max(240, Math.min(1000, pinchStart.w / factor));
      view.h = view.w * 1.6;
      view.x = pinchStart.cx - view.w / 2;
      view.y = pinchStart.cy - view.h / 2;
      clampView();
    }
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) {
      dragStart = null;
      pinchStart = null;
    } else if (pointers.size === 1) {
      const p = Array.from(pointers.values())[0];
      dragStart = { x: p.x, y: p.y, vx: view.x, vy: view.y };
      pinchStart = null;
    }
  }

  mapWrap.addEventListener("pointerup", endPointer);
  mapWrap.addEventListener("pointercancel", endPointer);

  mapWrap.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.15 : 0.87, event.clientX, event.clientY);
  }, { passive: false });

  mapWrap.addEventListener("dblclick", (event) => {
    if (event.target.closest("#topbar, #mapControls, #sheet, #searchSheet, #perm")) return;
    zoomAt(1.6, event.clientX, event.clientY);
  });

  $("zoomIn").addEventListener("click", () => {
    const r = map.getBoundingClientRect();
    zoomAt(1.3, r.left + r.width / 2, r.top + r.height / 2);
  });
  $("zoomOut").addEventListener("click", () => {
    const r = map.getBoundingClientRect();
    zoomAt(0.77, r.left + r.width / 2, r.top + r.height / 2);
  });

  $("locate").addEventListener("click", () => {
    const n = nodes.get(START);
    view.w = 460;
    view.h = view.w * 1.6;
    view.x = n.x - view.w / 2;
    view.y = n.y - view.h / 2;
    clampView();
  });

  /* ---------- permission / network ---------- */

  const perm = $("perm");

  function showPerm() {
    perm.classList.remove("hidden");
  }

  function askLocation() {
    if (!("geolocation" in navigator)) {
      showPerm();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => {},
      (error) => {
        if (error.code === 1) showPerm();
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  }

  $("permLater").addEventListener("click", () => perm.classList.add("hidden"));
  $("openSettings").addEventListener("click", () => {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openSettings) {
      window.webkit.messageHandlers.openSettings.postMessage("open");
    } else {
      window.location.href = "app-settings:";
    }
  });

  function updateNet() {
    const online = navigator.onLine;
    $("netChip").classList.toggle("off", !online);
    $("netText").textContent = online ? "Online" : "Offline";
  }

  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  askLocation();
})();
