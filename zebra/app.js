(() => {
  "use strict";

  const sheet = document.getElementById("sheet");
  const dName = document.getElementById("dName");
  const dSub = document.getElementById("dSub");
  const dInfo = document.getElementById("dInfo");
  const dIcon = document.getElementById("dIcon");
  const install = document.getElementById("install");
  const toast = document.getElementById("toast");

  let current = null;

  function open(el) {
    current = el;
    dName.textContent = el.dataset.name || "Package";
    dSub.textContent = el.dataset.sub || "";
    dInfo.textContent = "Version 1.0 \u00b7 " + (el.dataset.size || "1.0 MB");
    const source = el.querySelector(".appicon");
    dIcon.textContent = source ? source.textContent : "";
    dIcon.className = "appicon big " + (el.dataset.icon || "");
    install.textContent = "Install";
    install.className = "install";
    install.disabled = false;
    install.dataset.busy = "0";
    install.dataset.done = "0";
    sheet.classList.remove("hidden");
  }

  function close() {
    sheet.classList.add("hidden");
  }

  document.querySelectorAll(".row").forEach((el) => {
    el.addEventListener("click", () => open(el));
    const get = el.querySelector(".get");
    if (get) {
      get.addEventListener("click", (event) => {
        event.stopPropagation();
        open(el);
      });
    }
  });

  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) close();
  });

  install.addEventListener("click", () => {
    if (install.dataset.busy === "1" || install.dataset.done === "1") return;

    install.dataset.busy = "1";
    install.innerHTML = '<span class="spin"></span>Installing';
    install.disabled = true;

    setTimeout(() => {
      install.dataset.busy = "0";
      install.dataset.done = "1";
      install.innerHTML = "\u2713 Installed";
      install.className = "install done";

      toast.textContent = (current ? current.dataset.name : "Package") + " installed";
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }, 2600);
  });
})();
