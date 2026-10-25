(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const app = $("app");
  const consoleOverlay = $("console");
  const bootOverlay = $("boot");
  const doneOverlay = $("done");
  const logEl = $("log");
  const fill = $("fill");
  const consoleTitle = $("consoleTitle");
  const bootLog = $("bootLog");
  const checkLeft = $("checkLeft");
  const checkRight = $("checkRight");
  const button = $("jailbreak");
  const closeDone = $("closeDone");

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const STEPS = [
    { text: "[*] Dopamine 3.0.12", cls: "dim", wait: 220 },
    { text: "[*] Device: iPhone15,3 \u00b7 iOS 27.0 (24A335)", cls: "", wait: 210 },
    { text: "[*] Checking device support...", cls: "dim", wait: 240 },
    { text: "[+] arm64e \u00b7 A17 Pro \u00b7 supported", cls: "ok", wait: 260 },
    { text: "[*] Locating kernel base...", cls: "", wait: 320 },
    { text: "[+] kernel_base = 0xfffffff007004000", cls: "ok", wait: 280 },
    { text: "[*] Running ClearSword...", cls: "", wait: 380 },
    { text: "[+] physrw primitive ready", cls: "ok", wait: 300 },
    { text: "[*] Bypassing PPL / SPTM...", cls: "", wait: 420 },
    { text: "[+] trust cache injection ready", cls: "ok", wait: 300 },
    { text: "[*] Remounting root filesystem...", cls: "", wait: 380 },
    { text: "[+] /private/preboot PRF unlocked", cls: "ok", wait: 300 },
    { text: "[*] Injecting bootstrap...", cls: "", wait: 400 },
    { text: "[+] Sileo 2.4 installed", cls: "ok", wait: 250 },
    { text: "[+] Zebra 1.1.30 installed", cls: "ok", wait: 250 },
    { text: "[*] Rebuilding icon cache...", cls: "", wait: 340 },
    { text: "[+] userspace reboot required", cls: "warn", wait: 360 }
  ];

  const KERNEL_LINES = [
    "AppleA17PRO: boot",
    "sep: secure enclave ready",
    "apfs: mounting rootfs",
    "ApplePMP: display init",
    "IOHIDFamily: 3 devices",
    "AppleSEPManager: mailbox ready",
    "ANS2: nand ready",
    "AppleARMPMU: counter start",
    "IOMedia: scanning partition table",
    "apfs: volume dopa-root",
    "dyld: shared cache 27.0",
    "remoted: handshake ok",
    "launchd: bootstrap complete",
    "configd: network stack up",
    "backboardd: display awake",
    "SpringBoard: starting",
    "identityservices: signed in",
    "dasd: activities loaded",
    "powerd: battery 87%",
    "wifid: firmware ready",
    "CommCenter: baseband ok",
    "mediaserverd: audio online",
    "locationd: ready",
    "assertiond: ready",
    "runningboardd: 42 processes",
    "pkd: plugin registry loaded",
    "containermanagerd: ok",
    "cloudd: synced",
    "sharingd: ready",
    "sb: icon cache rebuilt",
    "sb: layout restored",
    "dopa: bootstrap mounted",
    "dopa: sileo registered",
    "dopa: zebra registered",
    "dopa: launch daemons 7/7",
    "dopa: rootless prefix ok",
    "dopa: verifying entitlements",
    "dopa: userspace reboot"
  ];

  let busy = false;

  const hex = (len) => {
    let out = "";
    for (let i = 0; i < len; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    return out;
  };

  function buildBootLog() {
    const lines = [];
    let t = 0.012;

    for (let i = 0; i < 320; i++) {
      if (i > 0 && Math.random() < 0.14) {
        lines.push(lines[lines.length - 1]);
        continue;
      }

      t += 0.004 + Math.random() * 0.055;
      const base = KERNEL_LINES[Math.floor(Math.random() * KERNEL_LINES.length)];
      const extra = Math.random() < 0.18 ? " 0x" + hex(12) : "";
      lines.push("[" + t.toFixed(3).padStart(8, " ") + "] " + base + extra);
    }

    bootLog.textContent = lines.concat(lines).join("\n");
  }

  function resetOverlays() {
    consoleOverlay.classList.add("hidden");
    consoleOverlay.classList.remove("closing");
    bootOverlay.classList.add("hidden");
    bootOverlay.classList.remove("show", "logo", "blackout");
    doneOverlay.classList.add("hidden");
    checkLeft.classList.remove("pop");
    checkRight.classList.remove("pop");
    logEl.innerHTML = "";
    fill.style.width = "0%";
    consoleTitle.textContent = "Jailbreaking";
    bootLog.textContent = "";
  }

  function addLine(text, cls) {
    const row = document.createElement("div");
    if (cls) row.className = cls;
    row.textContent = text;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function runConsole() {
    consoleOverlay.classList.remove("hidden");
    app.setAttribute("aria-hidden", "true");

    const total = STEPS.length;
    for (let i = 0; i < total; i++) {
      const step = STEPS[i];
      addLine(step.text, step.cls);
      fill.style.width = Math.round(((i + 1) / total) * 100) + "%";
      await sleep(step.wait);
    }

    const cursor = document.createElement("span");
    cursor.className = "cur";
    addLine("", "");
    logEl.lastChild.appendChild(cursor);

    await sleep(750);
  }

  async function runBoot() {
    consoleTitle.textContent = "Rebooting...";
    consoleOverlay.classList.add("closing");
    await sleep(240);
    consoleOverlay.classList.add("hidden");
    consoleOverlay.classList.remove("closing");

    buildBootLog();
    bootOverlay.classList.remove("hidden");
    await sleep(30);
    bootOverlay.classList.add("show");

    await sleep(2000);
    bootOverlay.classList.add("logo");

    await sleep(1200);
    checkLeft.classList.add("pop");
    checkRight.classList.add("pop");

    await sleep(16800);

    bootOverlay.classList.add("blackout");
    await sleep(3000);

    bootOverlay.classList.add("hidden");
    bootOverlay.classList.remove("show", "logo", "blackout");
    app.removeAttribute("aria-hidden");
    doneOverlay.classList.remove("hidden");
  }

  async function start() {
    if (busy) return;
    busy = true;
    button.disabled = true;

    try {
      resetOverlays();
      await runConsole();
      await runBoot();
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  button.addEventListener("click", start);

  closeDone.addEventListener("click", () => {
    doneOverlay.classList.add("hidden");
    resetOverlays();
  });

  document.querySelectorAll(".menu .row").forEach((row) => {
    row.addEventListener("click", (event) => {
      event.preventDefault();
    });
  });

  if (new URLSearchParams(location.search).has("auto")) {
    setTimeout(start, 350);
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
