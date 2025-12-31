/**
 * ShelfScout Creative UI
 * - Removes technical controls from GUI (no base URL /health button shown).
 * - Assumes backend endpoints are same-origin:
 *      GET  /health
 *      POST /predict?include_masks=true|false  (multipart field "file")
 * Advanced override (not shown in UI):
 *   localStorage 'ss_off_base' = 'http://localhost:8000'
 *   or URL query ?apiBase=http://localhost:8000
 */
(function(){
  const LS = {
    base: "ss_off_base",
    masks: "ss_off_masks",
    threshold: "ss_off_threshold",
    theme: "ss_off_theme",
    notes: "ss_off_notes",
  };

  const $ = (id) => document.getElementById(id);

  const year = $("year");
  const themeBtn = $("themeBtn");
  const themeIcon = $("themeIcon");
  const themeText = $("themeText");

  const validationBadge = $("validationBadge");
  const masksToggle = $("masksToggle");
  const thresholdRange = $("thresholdRange");
  const thresholdVal = $("thresholdVal");
  const notes = $("notes");

  const dropZone = $("dropZone");
  const fileInput = $("fileInput");
  const fileName = $("fileName");

  const errorBox = $("errorBox");
  const spinner = $("spinner");
  const statusTitle = $("statusTitle");
  const statusSub = $("statusSub");
  const footerStatus = $("footerStatus");
  const statusBadge = $("statusBadge");
  const timeBadge = $("timeBadge");
  const progressBar = $("progressBar");

  const clearBtn = $("clearBtn");
  const analyzeBtn = $("analyzeBtn");
  const btnSpin = $("btnSpin");

  const resultsPanel = $("resultsPanel");
  const previewImg = $("previewImg");
  const previewHint = $("previewHint");

  const highlightsImg = $("highlightsImg");
  const highlightsHint = $("highlightsHint");

  const maskImg = $("maskImg");
  const maskHint = $("maskHint");

  const stockLabel = $("stockLabel");
  const emptyPct = $("emptyPct");
  const itemsFound = $("itemsFound");

  const downloadReportBtn = $("downloadReportBtn");
  const downloadHighlightsBtn = $("downloadHighlightsBtn");
  const downloadMaskBtn = $("downloadMaskBtn");

  const toast = $("toast");

  let selectedFile = null;
  let lastPayload = null;
  let activeMask = "product";
  let toastTimer = null;

  year.textContent = String(new Date().getFullYear());

  // --- storage helpers ---
  function save(k, v){ try{ localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); }catch{} }
  function load(k, fallback=""){ try{ const v = localStorage.getItem(k); return v ?? fallback; }catch{ return fallback; } }
  function loadBool(k, fallback=false){
    const v = load(k, "");
    if(v === "") return fallback;
    if(v === "true") return true;
    if(v === "false") return false;
    try{ return !!JSON.parse(v); }catch{ return fallback; }
  }
  function loadNum(k, fallback){
    const v = Number(load(k, ""));
    return Number.isFinite(v) ? v : fallback;
  }

  function baseUrl(){
    const qp = new URLSearchParams(location.search);
    const q = qp.get("apiBase");
    const v = (q ?? load(LS.base, "")).trim();
    return v.replace(/\/+$/, "");
  }

  // --- theme ---
  function setTheme(t){
    document.documentElement.setAttribute("data-theme", t);
    save(LS.theme, t);
    const dark = t === "dark";
    themeIcon.innerHTML = `<use href="${dark ? "#i-moon" : "#i-sun"}"></use>`;
    themeText.textContent = dark ? "Dark" : "Light";
  }

  // --- UI helpers ---
  function setError(msg){
    if(!msg){
      errorBox.style.display = "none";
      errorBox.textContent = "";
      return;
    }
    errorBox.style.display = "block";
    errorBox.textContent = msg;
  }

  function setStatus(title, sub, pct, busy){
    statusTitle.textContent = title;
    statusSub.textContent = sub;
    footerStatus.textContent = title;
    progressBar.style.width = `${Math.max(0, Math.min(100, Number(pct ?? 0)))}%`;
    spinner.classList.toggle("on", !!busy);
  }

  function setMedia(img, hint, src){
    if(src){
      img.style.display = "block";
      img.src = src;
      hint.style.display = "none";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      hint.style.display = "block";
    }
  }

  function toastMsg(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  function fmtPct01(x){
    const v = Math.max(0, Math.min(1, Number(x || 0)));
    return `${(v*100).toFixed(1)}%`;
  }

  function vibeLabel(payload){
    const th = loadNum(LS.threshold, 35);
    const empty = Number(payload?.empty_ratio || 0) * 100;

    let label = "Well stocked";
    let chip = "chip-soft";
    if(empty >= th){ label = "Needs restock"; chip = "chip-soft"; }
    else if(empty >= Math.max(5, th*0.6)){ label = "Mixed stock"; chip = "chip-soft"; }

    // show in badges as friendly, not technical
    statusBadge.textContent = label;
    statusBadge.className = `chip ${chip}`;
    stockLabel.textContent = label;
    emptyPct.textContent = fmtPct01(payload?.empty_ratio);
    itemsFound.textContent = payload?.predicted_instances ?? "—";
  }

  function renderMask(){
    const m = lastPayload?.masks;
    const map = {
      product: m?.product_mask_png_b64,
      empty: m?.empty_mask_png_b64,
      background: m?.background_mask_png_b64,
    };
    const b64 = map[activeMask];
    setMedia(maskImg, maskHint, b64 ? `data:image/png;base64,${b64}` : "");
  }

  function downloadText(filename, text){
    const a = document.createElement("a");
    const blob = new Blob([String(text ?? "")], {type:"text/plain;charset=utf-8"});
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function downloadB64Png(filename, b64){
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function validateFile(file){
    if(!file) return "Pick an image first.";
    if(!/^image\//.test(file.type || "")) return "That file doesn't look like an image.";
    // soft limit for UI responsiveness
    if(file.size > 15 * 1024 * 1024) return "That image is a bit large. Try something under 15MB.";
    return "";
  }

  // --- network ---
  async function fetchJson(url, opts){
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);
    try{
      const res = await fetch(url, {...opts, signal: controller.signal});
      const data = await res.json().catch(() => null);
      if(!res.ok){
        const detail = data?.detail ? String(data.detail) : "";
        const err = new Error(detail || `Request failed`);
        err._status = res.status;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  }

  async function apiHealth(){
    return fetchJson(`${baseUrl()}/health`, { method:"GET" });
  }

  async function apiPredict(file, includeMasks){
    const fd = new FormData();
    fd.append("file", file);
    const url = `${baseUrl()}/predict?include_masks=${includeMasks ? "true" : "false"}`;
    return fetchJson(url, { method:"POST", body: fd });
  }

  // --- events ---
  function setValidation(kind, text){
    validationBadge.textContent = text;
    validationBadge.className = `chip ${kind}`;
  }

  function initTabs(){
    const tabs = document.querySelectorAll(".tabs .tab[data-tab]");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        tabs.forEach(b => b.classList.toggle("active", b === btn));
        document.querySelectorAll("[data-pane]").forEach(p => {
          const match = p.getAttribute("data-pane") === tab;
          p.style.display = match ? "" : "none";
        });
      });
    });

    const maskTabs = document.querySelectorAll(".tabs.small .tab[data-mask]");
    maskTabs.forEach(btn => {
      btn.addEventListener("click", () => {
        activeMask = btn.getAttribute("data-mask") || "product";
        maskTabs.forEach(b => b.classList.toggle("active", b === btn));
        renderMask();
      });
    });
  }

  function initPresets(){
    const presetBtns = document.querySelectorAll(".pill-btn[data-preset]");
    presetBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const v = Number(btn.getAttribute("data-preset"));
        if(!Number.isFinite(v)) return;
        thresholdRange.value = String(v);
        thresholdVal.textContent = `${v}%`;
        save(LS.threshold, String(v));
        presetBtns.forEach(b => b.classList.toggle("active", b === btn));
      });
    });
  }

  // --- boot ---
  setTheme(load(LS.theme, "dark") || "dark");

  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(cur === "dark" ? "light" : "dark");
  });

  const initMasks = loadBool(LS.masks, true); // default ON for creative UI
  masksToggle.classList.toggle("active", initMasks);
  masksToggle.setAttribute("aria-checked", String(initMasks));
  masksToggle.addEventListener("click", () => {
    const next = !loadBool(LS.masks, true);
    save(LS.masks, next);
    masksToggle.classList.toggle("active", next);
    masksToggle.setAttribute("aria-checked", String(next));
    if(lastPayload) renderMask();
  });

  const th = Math.max(0, Math.min(100, loadNum(LS.threshold, 35)));
  thresholdRange.value = String(th);
  thresholdVal.textContent = `${th}%`;
  thresholdRange.addEventListener("input", () => {
    thresholdVal.textContent = `${thresholdRange.value}%`;
    save(LS.threshold, thresholdRange.value);
  });

  notes.value = load(LS.notes, "");
  notes.addEventListener("input", () => save(LS.notes, notes.value));

  initTabs();
  initPresets();

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      fileInput.click();
    }
  });

  // drag/drop
  ["dragenter","dragover"].forEach(ev => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  }));
  ["dragleave","drop"].forEach(ev => dropZone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer?.files?.[0];
    if(f) handleFile(f);
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if(f) handleFile(f);
  });

  function handleFile(file){
    selectedFile = file;
    fileName.textContent = file.name || "Selected image";
    analyzeBtn.disabled = false;

    setError("");
    setValidation("chip-soft", "Looks good");

    const url = URL.createObjectURL(file);
    setMedia(previewImg, previewHint, url);
    // do not revoke immediately; it may still be needed for display
    setStatus("Ready", "Hit Analyze when you're ready.", 0, false);
  }

  clearBtn.addEventListener("click", () => {
    setError("");
    fileInput.value = "";
    selectedFile = null;
    fileName.textContent = "No file selected";
    analyzeBtn.disabled = true;

    lastPayload = null;
    resultsPanel.style.display = "none";
    setMedia(previewImg, previewHint, "");
    setMedia(highlightsImg, highlightsHint, "");
    setMedia(maskImg, maskHint, "");

    downloadReportBtn.disabled = true;
    downloadHighlightsBtn.disabled = true;
    downloadMaskBtn.disabled = true;

    statusBadge.textContent = "—";
    statusBadge.className = "chip chip-muted";
    timeBadge.textContent = "—";
    setValidation("chip-muted", "Waiting");
    setStatus("Ready", "Add a photo to begin.", 0, false);
  });

  analyzeBtn.addEventListener("click", async () => {
    setError("");
    const err = validateFile(selectedFile);
    if(err){ setError(err); setValidation("chip-muted", "Fix needed"); return; }

    const include = loadBool(LS.masks, true);
    const t0 = performance.now();

    analyzeBtn.disabled = true;
    clearBtn.disabled = true;
    btnSpin.style.display = "inline-block";

    resultsPanel.style.display = "none";
    lastPayload = null;

    downloadReportBtn.disabled = true;
    downloadHighlightsBtn.disabled = true;
    downloadMaskBtn.disabled = true;

    setStatus("Scanning…", "Finding gaps and items.", 55, true);

    try{
      const payload = await apiPredict(selectedFile, include);
      const ms = Math.round(performance.now() - t0);

      lastPayload = payload;

      // Friendly badges
      timeBadge.textContent = `${ms} ms`;

      vibeLabel(payload);

      // Highlights
      const highlightsB64 = payload?.masks?.decoded_centers_overlay_png_b64;
      setMedia(highlightsImg, highlightsHint, highlightsB64 ? `data:image/png;base64,${highlightsB64}` : "");

      // Masks
      renderMask();

      // Enable downloads
      downloadReportBtn.disabled = false;
      downloadHighlightsBtn.disabled = !highlightsB64;
      const anyMask = !!(payload?.masks?.product_mask_png_b64 || payload?.masks?.empty_mask_png_b64 || payload?.masks?.background_mask_png_b64);
      downloadMaskBtn.disabled = !anyMask;

      resultsPanel.style.display = "";
      setStatus("Done!", "Scroll for your previews and downloads.", 100, false);
      toastMsg("✨ Scan complete!");
    } catch(e){
      // keep technical detail in console only
      console.error("ShelfScout predict error:", e);
      const friendly =
        e?.name === "AbortError" ? "That took too long. Try again in a moment."
        : "Couldn't reach the analyzer. Make sure the service is running, then retry.";
      setError(friendly);
      setStatus("Oops", "Something got in the way. Try again.", 10, false);
      setValidation("chip-muted", "Retry");
    } finally {
      btnSpin.style.display = "none";
      clearBtn.disabled = false;
      analyzeBtn.disabled = !selectedFile;
      spinner.classList.remove("on");
    }
  });

  // downloads
  downloadReportBtn.addEventListener("click", () => {
    if(!lastPayload) return;
    const th = loadNum(LS.threshold, 35);
    const empty = Number(lastPayload?.empty_ratio || 0) * 100;
    const label = (empty >= th) ? "Needs restock" : (empty >= Math.max(5, th*0.6) ? "Mixed stock" : "Well stocked");

    const report = [
      "ShelfScout — Summary",
      "=====================",
      `Status: ${label}`,
      `Empty shelf estimate: ${fmtPct01(lastPayload?.empty_ratio)}`,
      `Items found (approx): ${lastPayload?.predicted_instances ?? "—"}`,
      "",
      "Notes",
      "-----",
      (notes.value || "(none)"),
      "",
      "Timestamp",
      "---------",
      new Date().toISOString(),
      ""
    ].join("\n");

    downloadText("shelfscout-summary.txt", report);
    toastMsg("Saved summary ✍️");
  });

  downloadHighlightsBtn.addEventListener("click", () => {
    const b64 = lastPayload?.masks?.decoded_centers_overlay_png_b64;
    if(!b64) return;
    downloadB64Png("shelfscout-highlights.png", b64);
    toastMsg("Saved highlights ✨");
  });

  downloadMaskBtn.addEventListener("click", () => {
    const m = lastPayload?.masks;
    if(!m) return;
    const map = {
      product: m?.product_mask_png_b64,
      empty: m?.empty_mask_png_b64,
      background: m?.background_mask_png_b64,
    };
    const b64 = map[activeMask];
    if(!b64) return;
    const name = activeMask === "product" ? "items" : (activeMask === "empty" ? "gaps" : "scene");
    downloadB64Png(`shelfscout-overlay-${name}.png`, b64);
    toastMsg("Saved overlay 🧩");
  });

  // Soft startup: check health silently (no UI tech details)
  (async function(){
    try{
      await apiHealth();
      setValidation("chip-soft", "Ready");
    } catch(e){
      console.warn("ShelfScout health check failed:", e);
      setValidation("chip-muted", "Offline");
      // Still usable if served with same origin; keep quiet.
    }
  })();

  setStatus("Ready", "Add a photo to begin.", 0, false);
})();