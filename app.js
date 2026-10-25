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
    { text: "[*] Dopamine 2.4.3", cls: "dim", wait: 260 },
    { text: "[*] Device: iPhone15,3 \u00b7 iOS 27.0 (24A335)", cls: "", wait: 230 },
    { text: "[*] Checking device support...", cls: "dim", wait: 260 },
    { text: "[+] arm64e \u00b7 A17 Pro \u00b7 supported", cls: "ok", wait: 300 },
    { text: "[*] Locating kernel base...", cls: "", wait: 360 },
    { text: "[+] kernel_base = 0xfffffff007004000", cls: "ok", wait: 300 },
    { text: "[*] Running kfd...", cls: "", wait: 420 },
    { text: "[+] physrw primitive ready", cls: "ok", wait: 320 },
    { text: "[*] Bypassing PPL / KTRR...", cls: "", wait: 460 },
    { text: "[+] trust cache injection ready", cls: "ok", wait: 330 },
    { text: "[*] Remounting root filesystem...", cls: "", wait: 420 },
    { text: "[+] /private/preboot PRF unlocked", cls: "ok", wait: 330 },
    { text: "[*] Injecting bootstrap...", cls: "", wait: 430 },
    { text: "[+] Sileo 2.4 installed", cls: "ok", wait: 280 },
    { text: "[+] Zebra 1.1.30 installed", cls: "ok", wait: 280 },
    { text: "[*] Rebuilding icon cache...", cls: "", wait: 380 },
    { text: "[+] userspace reboot required", cls: "warn", wait: 420 }
  ];

  const BOOT_LINES = [
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

  function buildBootLog() {
    const lines = [];
    let t = 0.018;

    for (let pass = 0; pass < 2; pass++) {
      for (const line of BOOT_LINES) {
        t += 0.02 + Math.random() * 0.12;
        const stamp = "[" + t.toFixed(3).padStart(9, " ") + "] ";
        lines.push(stamp + line);
      }
    }

    bootLog.textContent = lines.join("\n");
  }

  function resetOverlays() {
    consoleOverlay.classList.add("hidden");
    bootOverlay.classList.add("hidden");
    doneOverlay.classList.add("hidden");
    bootOverlay.classList.remove("show");
    bootOverlay.classList.remove("fade");
    checkLeft.classList.remove("pop");
    checkRight.classList.remove("pop");
    logEl.innerHTML = "";
    fill.style.width = "0%";
    consoleTitle.textContent = "Running exploit";
    bootLog.style.animationPlayState = "running";
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

    await sleep(900);
  }

  async function runBoot() {
    consoleTitle.textContent = "Rebooting...";
    consoleOverlay.classList.add("closing");
    await sleep(260);
    consoleOverlay.classList.add("hidden");
    consoleOverlay.classList.remove("closing");

    buildBootLog();
    bootOverlay.classList.remove("hidden");
    await sleep(30);
    bootOverlay.classList.add("show");

    await sleep(2600);
    checkLeft.classList.add("pop");
    checkRight.classList.add("pop");
    bootLog.style.animationPlayState = "paused";

    await sleep(3400);
    bootOverlay.style.opacity = "0";

    await sleep(450);
    bootOverlay.classList.add("hidden");
    bootOverlay.style.opacity = "";
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

  if (new URLSearchParams(location.search).has("auto")) {
    setTimeout(start, 350);
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
