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
  const bootApple = $("bootApple");
  const button = $("jailbreak");
  const closeDone = $("closeDone");
  const picker = $("picker");
  const pickGo = $("pickGo");
  const settingsSheet = $("settingsSheet");
  const creditsSheet = $("creditsSheet");
  const respring = $("respring");
  const userspace = $("userspace");

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

    { text: "[*] Rebuilding icon cache...", cls: "", wait: 340 },
    { text: "[+] userspace reboot required", cls: "warn", wait: 360 }
  ];

  const BOOT_MESSAGES = [
    "kernel: AppleA17PRO boot-args -v keepsyms=1 debug=0x14e",
    "apfs: container superblock 0x0000000000000000",
    "apfs: checkpoint descriptor area mounted read-only",
    "IOPlatformExpertDevice: platform expert attached",
    "AppleS5L8960XIO: pmu firmware loaded",
    "AppleARMPMU: performance counters online",
    "sep: secure enclave mailbox established",
    "AppleSEPManager: endpoint 0x00 ready",
    "AppleANS2NVMeController: queue depth 64",
    "IOMedia: partition 0 fs apfs name dopa-root",
    "apfs: volume dopa-root mounted at /private/preboot",
    "dyld: shared cache 27.0 mapped",
    "amfid: verifying code signature for launchd",
    "trustd: trust cache 0x0000000000000000 loaded",
    "launchd[1]: bootstrap port registered",
    "launchd[1]: service com.apple.backboardd starting",
    "backboardd: display pipeline ready 120hz",
    "SpringBoard: initializing scene host",
    "runningboardd: process assertions restored",
    "containermanagerd: class 2 container ready",
    "mobileassetd: asset catalog 12,481 entries",
    "remoted: connection established with peer",
    "identityservicesd: account state restored",
    "wifid: interface en0 firmware 18.5",
    "CommCenter: baseband firmware 6.0",
    "mediaserverd: audio graph initialized",
    "locationd: location services online",
    "ssh: bootstrap daemon loaded",
    "dopa: rootless prefix /var/jb mounted",
    "dopa: userspace reboot handoff complete",
    "dopa: launch daemons 7/7 running"
  ];

  let busy = false;
  const selectedPackages = new Set();
  let bootTimer = null;
  let bootClock = 0.012;
  let bootDelay = 55;

  const hex = (len) => {
    let out = "";
    for (let i = 0; i < len; i++) out += "0123456789abcdef"[Math.floor(Math.random() * 16)];
    return out;
  };

  function stopBootLog() {
    if (bootTimer !== null) {
      clearTimeout(bootTimer);
      bootTimer = null;
    }
  }

  function startBootLog() {
    stopBootLog();
    bootLog.textContent = "";
    bootClock = 0.012;

    const tick = () => {
      let text;

      if (bootLog.lastElementChild && Math.random() < 0.12) {
        text = bootLog.lastElementChild.textContent;
      } else {
        bootClock += 0.002 + Math.random() * 0.02;
        const base = BOOT_MESSAGES[Math.floor(Math.random() * BOOT_MESSAGES.length)];
        let extra = "";
        const roll = Math.random();
        if (roll < 0.22) extra = " 0x" + hex(40);
        else if (roll < 0.34) extra = " " + hex(24);
        text = "[" + bootClock.toFixed(6).padStart(12, " ") + "] " + base + extra;
      }

      const div = document.createElement("div");
      div.textContent = text;
      bootLog.appendChild(div);
      if (bootLog.childElementCount > 120) bootLog.firstElementChild.remove();
    };

    for (let i = 0; i < 60; i++) tick();

    const schedule = () => {
      if (bootTimer === null) return;

      bootDelay += (Math.random() - 0.5) * 22;
      bootDelay = Math.max(2, Math.min(90, bootDelay));

      if (Math.random() < 0.09) bootDelay = 1 + Math.random() * 3;
      if (Math.random() < 0.01) bootDelay = 90 + Math.random() * 40;

      bootTimer = setTimeout(() => {
        tick();
        schedule();
      }, bootDelay);
    };

    bootDelay = 12;
    bootTimer = setTimeout(() => {
      tick();
      schedule();
    }, bootDelay);
  }

  function resetOverlays() {
    consoleOverlay.classList.add("hidden");
    consoleOverlay.classList.remove("closing");
    stopBootLog();
    bootOverlay.classList.add("hidden");
    bootOverlay.classList.remove("show", "blackout");
    bootApple.src = "./icons/user-boot-logo.png";
    doneOverlay.classList.add("hidden");
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

    if (selectedPackages.has("sileo")) {
      addLine("[+] Sileo 2.4 installed", "ok");
      await sleep(260);
    }
    if (selectedPackages.has("zebra")) {
      addLine("[+] Zebra 1.1.30 installed", "ok");
      await sleep(260);
    }

    const cursor = document.createElement("span");
    cursor.className = "cur";
    addLine("", "");
    logEl.lastChild.appendChild(cursor);

    await sleep(750);
  }

  async function runBoot() {
    consoleOverlay.classList.add("hidden");

    bootApple.src = "./icons/user-boot-logo.png";
    startBootLog();
    bootOverlay.classList.remove("hidden");

    await sleep(20000);
    stopBootLog();
    bootOverlay.classList.add("blackout");
    await sleep(3000);

    bootOverlay.classList.add("hidden");
    bootOverlay.classList.remove("show", "blackout");
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

  function openPicker() {
    selectedPackages.clear();
    document.querySelectorAll(".pick").forEach((pick) => pick.classList.remove("selected"));
    pickGo.disabled = true;
    picker.classList.remove("hidden");
  }

  button.addEventListener("click", openPicker);

  document.querySelectorAll(".pick").forEach((pick) => {
    pick.addEventListener("click", () => {
      const key = pick.dataset.pkg;
      if (selectedPackages.has(key)) selectedPackages.delete(key);
      else selectedPackages.add(key);
      pick.classList.toggle("selected", selectedPackages.has(key));
      pickGo.disabled = selectedPackages.size === 0;
    });
  });

  $("pickCancel").addEventListener("click", () => picker.classList.add("hidden"));

  pickGo.addEventListener("click", () => {
    if (selectedPackages.size === 0) return;
    picker.classList.add("hidden");
    start();
  });

  closeDone.addEventListener("click", () => {
    doneOverlay.classList.add("hidden");
    resetOverlays();
  });

  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", () => $(el.dataset.close).classList.add("hidden"));
  });

  document.querySelectorAll(".setting .switch").forEach((sw) => {
    sw.addEventListener("click", () => sw.classList.toggle("on"));
  });

  async function runRespring() {
    respring.classList.remove("hidden");
    await sleep(1900);
    respring.classList.add("hidden");
  }

  async function runUserspace() {
    userspace.classList.remove("hidden");
    await sleep(4200);
    userspace.classList.add("hidden");
  }

  const actions = {
    settings: () => settingsSheet.classList.remove("hidden"),
    credits: () => creditsSheet.classList.remove("hidden"),
    respring: runRespring,
    userspace: runUserspace
  };

  document.querySelectorAll(".menu .row").forEach((row) => {
    row.addEventListener("click", () => {
      const action = actions[row.dataset.row];
      if (action) action();
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
