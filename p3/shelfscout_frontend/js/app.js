/**
 * ShelfScout Offline Professional Frontend (No npm / No CDN)
 * Backend:
 *   GET  /health
 *   POST /predict?include_masks=true|false  (multipart field "file")
 */
(function(){
  const LS = {
    base: "ss_off_base",
    masks: "ss_off_masks",
    threshold: "ss_off_threshold",
    theme: "ss_off_theme",
  };

  const $ = (id) => document.getElementById(id);

  const year = $("year");
  year.textContent = String(new Date().getFullYear());

  const backendBadge = $("backendBadge");
  const healthBtn = $("healthBtn");
  const healthText = $("healthText");
  const apiBaseUrl = $("apiBaseUrl");
  const masksToggle = $("masksToggle");
  const thresholdRange = $("thresholdRange");
  const thresholdVal = $("thresholdVal");

  const themeBtn = $("themeBtn");
  const themeText = $("themeText");
  const themeIcon = $("themeIcon");

  const dropZone = $("dropZone");
  const fileInput = $("fileInput");
  const fileName = $("fileName");
  const analyzeBtn = $("analyzeBtn");
  const clearBtn = $("clearBtn");
  const btnSpin = $("btnSpin");

  const errorBox = $("errorBox");
  const validationBadge = $("validationBadge");

  const statusTitle = $("statusTitle");
  const statusSub = $("statusSub");
  const footerStatus = $("footerStatus");
  const spinner = $("spinner");
  const progressBar = $("progressBar");

  const previewImg = $("previewImg");
  const previewHint = $("previewHint");
  const centersImg = $("centersImg");
  const centersHint = $("centersHint");

  const resultsPanel = $("resultsPanel");
  const statusBadge = $("statusBadge");
  const timeBadge = $("timeBadge");
  const cards = $("cards");

  const maskImg = $("maskImg");
  const maskHint = $("maskHint");

  const downloadReportBtn = $("downloadReportBtn");
  const downloadCentersBtn = $("downloadCentersBtn");
  const downloadMaskBtn = $("downloadMaskBtn");

  const toast = $("toast");

  let selectedFile = null;
  let lastPayload = null;
  let activeMask = "product";

  function save(k,v){ localStorage.setItem(k, String(v)); }
  function load(k, d=""){ const v = localStorage.getItem(k); return v === null ? d : v; }
  function loadBool(k, d=false){ const v = localStorage.getItem(k); if(v===null) return d; return v==="true"; }
  function loadNum(k, d=0){ const n = Number(localStorage.getItem(k)); return Number.isFinite(n) ? n : d; }

  function baseUrl(){
    const raw = (apiBaseUrl.value || "").trim();
    save(LS.base, raw);
    if(!raw || raw === ".") return "";
    return raw.replace(/\/+$/, "");
  }

  function setTheme(t){
    document.documentElement.setAttribute("data-theme", t);
    save(LS.theme, t);
    themeText.textContent = t === "light" ? "Light" : "Dark";
    themeIcon.setAttribute("href", t === "light" ? "#i-sun" : "#i-moon");
  }

  function setBadge(el, kind, text){
    el.textContent = text;
    el.className = "badge " + kind;
  }

  function setError(msg){
    if(!msg){
      errorBox.style.display = "none";
      errorBox.textContent = "";
      return;
    }
    errorBox.style.display = "block";
    errorBox.textContent = msg;
  }

  function setValidation(kind, text){
    setBadge(validationBadge, kind, text);
  }

  function setStatus(title, sub, progress, spinning){
    statusTitle.textContent = title;
    statusSub.textContent = sub;
    footerStatus.textContent = title;
    progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    spinner.style.display = spinning ? "block" : "none";
  }

  function toastMsg(msg){
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(window.__t);
    window.__t = setTimeout(()=> { toast.textContent = ""; toast.classList.remove("show"); }, 2800);
  }

  function setMedia(img, hint, src){
    if(src){
      img.style.display = "block";
      img.src = src;
      hint.style.display = "none";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      hint.style.display = "flex";
    }
  }

  function validateFile(file){
    if(!file) return "Please choose an image first.";
    if(!file.type.startsWith("image/")) return "File must be an image (JPG/PNG/WEBP).";
    const maxMB = 12;
    if(file.size > maxMB * 1024 * 1024) return `Image is too large (> ${maxMB}MB). Try a smaller one.`;
    return "";
  }

  async function fetchJson(url, opts){
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 30000);
    try{
      const res = await fetch(url, { ...opts, signal: controller.signal });
      const data = await res.json().catch(() => null);
      if(!res.ok){
        const detail = data?.detail ? `: ${data.detail}` : "";
        throw new Error(`HTTP ${res.status}${detail}`);
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

  function fmtPct(x){
    const v = Math.max(0, Math.min(1, Number(x || 0)));
    return `${(v*100).toFixed(1)}%`;
  }

  function miniCard(k, v, s){
    const d = document.createElement("div");
    d.className = "card-mini";
    d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div>`;
    return d;
  }

  function renderCards(payload){
    cards.innerHTML = "";
    cards.appendChild(miniCard("Empty ratio", fmtPct(payload.empty_ratio), "Estimated empty shelf area"));
    cards.appendChild(miniCard("Decoded centers", payload.decoded_centers ?? "—", "Center points after decoding"));
    cards.appendChild(miniCard("Instances", payload.predicted_instances ?? "—", "Constructed instances"));
    cards.appendChild(miniCard("Product pixels", payload.product_pixels ?? "—", "Pixels classified as product"));
    cards.appendChild(miniCard("Empty pixels", payload.empty_pixels ?? "—", "Pixels classified as empty"));
    cards.appendChild(miniCard("Image size", payload.image_size ? `${payload.image_size}×${payload.image_size}` : "—", "Model input size"));
    const fm = Array.isArray(payload.feature_map_size) ? payload.feature_map_size.join("×") : (payload.feature_map_size ?? "—");
    cards.appendChild(miniCard("Feature map", fm, "Internal model resolution"));
    cards.appendChild(miniCard("Shelf bbox", payload.shelf_bbox ? "Available" : "—", "Bounding box available"));
  }

  function renderLabel(payload){
    const th = loadNum(LS.threshold, 35);
    const emptyPct = Number(payload.empty_ratio || 0) * 100;
    let label = "Well Stocked", kind = "badge-ok";
    if(emptyPct >= th){ label = "Needs Restock"; kind = "badge-bad"; }
    else if(emptyPct >= Math.max(5, th*0.6)){ label = "Mixed Stock"; kind = "badge-warn"; }
    setBadge(statusBadge, kind, label);
  }

  function renderMask(){
    const m = lastPayload?.masks;
    const map = { product: m?.product_mask_png_b64, empty: m?.empty_mask_png_b64, background: m?.background_mask_png_b64 };
    const b64 = map[activeMask];
    setMedia(maskImg, maskHint, b64 ? `data:image/png;base64,${b64}` : "");
  }

  
function showSkeletonCards(){
  cards.innerHTML = "";
  for(let i=0;i<8;i++){
    const d = document.createElement("div");
    d.className = "card-mini skeleton";
    d.style.minHeight = "96px";
    cards.appendChild(d);
  }
}

function reveal(el){
  if(!el) return;
  el.classList.remove("reveal");
  // force reflow to restart animation
  void el.offsetWidth;
  el.classList.add("reveal");
}

// Init
  apiBaseUrl.value = load(LS.base, "http://localhost:8000");
  thresholdRange.value = String(loadNum(LS.threshold, 35));
  thresholdVal.textContent = `${thresholdRange.value}%`;

  const masksOn = loadBool(LS.masks, false);
  masksToggle.classList.toggle("active", masksOn);
  masksToggle.setAttribute("aria-checked", String(masksOn));

  setTheme(load(LS.theme, "dark"));
  setBadge(backendBadge, "badge-muted", "Backend: not checked");
  setValidation("badge-muted", "Waiting");
  setStatus("Ready", "Upload an image to begin.", 0, false);

  // Events
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    setTheme(cur === "dark" ? "light" : "dark");
  });

  thresholdRange.addEventListener("input", () => {
    thresholdVal.textContent = `${thresholdRange.value}%`;
    save(LS.threshold, thresholdRange.value);
  });

  masksToggle.addEventListener("click", () => {
    const next = !loadBool(LS.masks, false);
    save(LS.masks, next);
    masksToggle.classList.toggle("active", next);
    masksToggle.setAttribute("aria-checked", String(next));
  });

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("keydown", (e) => { if(e.key==="Enter"||e.key===" "){ e.preventDefault(); fileInput.click(); }});
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("dragover"); });
  dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event("change")); });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0] || null;
    selectedFile = file;
    if(!file){
      fileName.textContent = "No file selected";
      analyzeBtn.disabled = true;
      setMedia(previewImg, previewHint, "");
      setMedia(centersImg, centersHint, "");
      setValidation("badge-muted", "Waiting");
      return;
    }
    fileName.textContent = file.name;
    const err = validateFile(file);
    if(err){
      analyzeBtn.disabled = true;
      setValidation("badge-bad", "Invalid");
      setError(err);
      return;
    }
    setError("");
    setValidation("badge-ok", "Valid");
    analyzeBtn.disabled = false;
    const url = URL.createObjectURL(file);
    setMedia(previewImg, previewHint, url);
    previewImg.onload = () => URL.revokeObjectURL(url);
    setStatus("Ready", "Click Analyze to run the model.", 0, false);
  });

  healthBtn.addEventListener("click", async () => {
    setError("");
    setStatus("Checking", "Contacting backend /health…", 15, true);
    try{
      const data = await apiHealth();
      const msg = `${data.service || "service"} • ${data.version || "v?"} • ${data.status || "ok"}`;
      setBadge(backendBadge, "badge-ok", `Backend: ${msg}`);
      healthText.textContent = msg;
      setStatus("Ready", "Backend is reachable.", 0, false);
      toastMsg("Backend connected.");
    } catch(e){
      setBadge(backendBadge, "badge-bad", "Backend: unreachable");
      healthText.textContent = "Health failed";
      setStatus("Ready", "Backend check failed. Verify URL or fix CORS.", 0, false);
      setError("Health check failed. If backend works in browser but fails here: CORS. Best fix: serve UI from backend /ui.");
    }
  });

  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeMask = btn.getAttribute("data-mask") || "product";
      renderMask();
    });
  });

  analyzeBtn.addEventListener("click", async () => {
    setError("");
    const err = validateFile(selectedFile);
    if(err){ setError(err); setValidation("badge-bad","Invalid"); return; }

    const include = loadBool(LS.masks, false);

    analyzeBtn.disabled = true;
    clearBtn.disabled = true;
    btnSpin.style.display = "inline-block";

    resultsPanel.style.display = "none";
    lastPayload = null;
    showSkeletonCards();

    downloadReportBtn.disabled = true;
    downloadCentersBtn.disabled = true;
    downloadMaskBtn.disabled = true;

    setStatus("Validating", "Input looks good. Starting inference…", 25, false);
    await new Promise(requestAnimationFrame);

    const t0 = performance.now();
    try{
      setStatus("Processing", include ? "Running model + generating overlays…" : "Running model inference…", 60, true);
      const payload = await apiPredict(selectedFile, include);
      const ms = Math.round(performance.now() - t0);

      lastPayload = payload;

      setBadge(timeBadge, "badge-muted", `${ms} ms`);
      renderLabel(payload);
      renderCards(payload);
      reveal(cards);

      const centersB64 = payload?.masks?.decoded_centers_overlay_png_b64;
      setMedia(centersImg, centersHint, centersB64 ? `data:image/png;base64,${centersB64}` : "");

      renderMask();

      resultsPanel.style.display = "";
      reveal(resultsPanel);
      setStatus("Results", "Done. Review cards and overlays below.", 100, false);
      toastMsg("Analysis complete.");

      downloadReportBtn.disabled = false;
      downloadCentersBtn.disabled = !centersB64;
      const anyMask = !!(payload?.masks?.product_mask_png_b64 || payload?.masks?.empty_mask_png_b64 || payload?.masks?.background_mask_png_b64);
      downloadMaskBtn.disabled = !anyMask;

    } catch(e){
      const msg = e?.name === "AbortError"
        ? "Request timed out (30s). Backend may be slow. Try include_masks=false."
        : (e?.message || String(e));
      setError(msg);
      setStatus("Ready", "Could not complete analysis. Check URL/CORS and try again.", 0, false);
    } finally {
      btnSpin.style.display = "none";
      clearBtn.disabled = false;
      analyzeBtn.disabled = !selectedFile;
    }
  });

  clearBtn.addEventListener("click", () => {
    setError("");
    fileInput.value = "";
    selectedFile = null;
    fileName.textContent = "No file selected";
    analyzeBtn.disabled = true;
    setMedia(previewImg, previewHint, "");
    setMedia(centersImg, centersHint, "");
    setMedia(maskImg, maskHint, "");
    resultsPanel.style.display = "none";
    lastPayload = null;
    showSkeletonCards();
    downloadReportBtn.disabled = true;
    downloadCentersBtn.disabled = true;
    downloadMaskBtn.disabled = true;
    setValidation("badge-muted","Waiting");
    setStatus("Ready", "Upload an image to begin.", 0, false);
    toastMsg("Cleared.");
  });

  function downloadText(filename, text, mime="application/json"){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function downloadB64Png(filename, b64){
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${b64}`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  downloadReportBtn.addEventListener("click", () => {
    if(!lastPayload) return;
    const report = {
      app: "ShelfScout",
      created_at: new Date().toISOString(),
      summary: {
        empty_ratio: lastPayload.empty_ratio,
        decoded_centers: lastPayload.decoded_centers,
        predicted_instances: lastPayload.predicted_instances,
        product_pixels: lastPayload.product_pixels,
        empty_pixels: lastPayload.empty_pixels,
        feature_map_size: lastPayload.feature_map_size,
        image_size: lastPayload.image_size
      },
      ui: {
        include_masks: loadBool(LS.masks, false),
        threshold_pct: loadNum(LS.threshold, 35)
      }
    };
    downloadText("shelfscout_report.json", JSON.stringify(report, null, 2));
    toastMsg("Report downloaded.");
  });

  downloadCentersBtn.addEventListener("click", () => {
    const b64 = lastPayload?.masks?.decoded_centers_overlay_png_b64;
    if(!b64) return;
    downloadB64Png("decoded_centers_overlay.png", b64);
    toastMsg("Centers overlay downloaded.");
  });

  downloadMaskBtn.addEventListener("click", () => {
    const m = lastPayload?.masks;
    if(!m){ toastMsg("No masks available."); return; }
    const map = { product: m.product_mask_png_b64, empty: m.empty_mask_png_b64, background: m.background_mask_png_b64 };
    const b64 = map[activeMask];
    if(!b64){ toastMsg("Selected mask not available."); return; }
    downloadB64Png(`${activeMask}_mask.png`, b64);
    toastMsg("Mask downloaded.");
  });

})();
