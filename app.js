
/* Izzy Photo Frame PWA
   Option A: Public Drive folder + Google Drive API (API key required)
*/
const DEFAULTS = {
  folderId: "1qGLyEugRlPxJn9LwnGDN15h_5JXH376v",
  apiKey: "",
  seconds: 6,
  shuffle: true,
  kenburns: false,
  refresh: true,
  refreshMinutes: 5
};


const FRAME_NATURAL = { w: 1268, h: 815 };
// Photo window bounds measured on the frame image (normalized 0..1)
function layoutStage(){
  const frame = document.getElementById("frame");
  const art = document.getElementById("frameArt");
  const stage = document.getElementById("stage");
  if(!frame || !art || !stage) return;

  const cw = frame.clientWidth;
  const ch = frame.clientHeight;
  const nw = art.naturalWidth || 1268;
  const nh = art.naturalHeight || 815;

  // match the exact rendered size of the frame artwork (object-fit: contain)
  const scale = Math.min(cw / nw, ch / nh);
  const rw = nw * scale;
  const rh = nh * scale;
  const ox = (cw - rw) / 2;
  const oy = (ch - rh) / 2;

  stage.style.left = `${ox}px`;
  stage.style.top = `${oy}px`;
  stage.style.width = `${rw}px`;
  stage.style.height = `${rh}px`;
}

const els = {
  bg: document.getElementById("bg"),
  photo: document.getElementById("photo"),
  gear: document.getElementById("gear"),
  settings: document.getElementById("settings"),
  folderId: document.getElementById("folderId"),
  apiKey: document.getElementById("apiKey"),
  seconds: document.getElementById("seconds"),
  shuffle: document.getElementById("shuffle"),
  kenburns: document.getElementById("kenburns"),
  refresh: document.getElementById("refresh"),
  save: document.getElementById("save"),
  test: document.getElementById("test"),
  close: document.getElementById("close"),
  status: document.getElementById("status")
};

let cfg = loadCfg();
let photos = [];
let idx = 0;
let timer = null;
let refreshTimer = null;

function loadCfg(){
  try {
    const raw = localStorage.getItem("izzyFrameCfg");
    const parsed = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveCfg(newCfg){
  cfg = { ...cfg, ...newCfg };
  localStorage.setItem("izzyFrameCfg", JSON.stringify(cfg));
}

function setStatus(msg){
  els.status.textContent = msg || "";
}

function openSettings(){
  els.folderId.value = cfg.folderId;
  els.apiKey.value = cfg.apiKey;
  els.seconds.value = cfg.seconds;
  els.shuffle.checked = !!cfg.shuffle;
  els.kenburns.checked = !!cfg.kenburns;
  els.refresh.checked = !!cfg.refresh;
  els.settings.classList.remove("hidden");
}

function closeSettings(){
  els.settings.classList.add("hidden");
  setStatus("");
}

els.gear.addEventListener("click", openSettings);
els.close.addEventListener("click", closeSettings);

els.save.addEventListener("click", () => {
  saveCfg({
    folderId: els.folderId.value.trim(),
    apiKey: els.apiKey.value.trim(),
    seconds: clampInt(els.seconds.value, 2, 60, DEFAULTS.seconds),
    shuffle: els.shuffle.checked,
    kenburns: els.kenburns.checked,
    refresh: els.refresh.checked
  });
  setStatus("Saved. Loading photos…");
  start();
});

els.test.addEventListener("click", async () => {
  saveCfg({
    folderId: els.folderId.value.trim(),
    apiKey: els.apiKey.value.trim()
  });
  setStatus("Testing folder load…");
  try {
    const list = await fetchDriveImages(cfg.folderId, cfg.apiKey);
    setStatus(`Loaded ${list.length} images ✔`);
  } catch (e) {
    setStatus(`Load failed: ${e.message}`);
  }
});

function clampInt(val, min, max, fallback){
  const n = parseInt(val, 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}

async function fetchDriveImages(folderId, apiKey){
  if (!folderId) throw new Error("Missing folder ID");
  if (!apiKey) throw new Error("Missing API key (Drive API)");

  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType contains 'image/'`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime),nextPageToken");
  const pageSize = 1000;
  let pageToken = "";
  let out = [];

  while (true) {
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=${pageSize}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Drive API error (${res.status}). ${text.slice(0, 140)}`);
    }
    const data = await res.json();
    const files = Array.isArray(data.files) ? data.files : [];
    out.push(...files);
    if (data.nextPageToken) pageToken = data.nextPageToken;
    else break;
  }

  out.sort((a, b) => (a.modifiedTime || "").localeCompare(b.modifiedTime || ""));
  return out.map(f => ({
    id: f.id,
    name: f.name,
    urls: [
      `https://lh3.googleusercontent.com/d/${f.id}=w2048`,
      `https://drive.google.com/uc?export=view&id=${f.id}`
    ]
  }));
}

function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function preload(urls){
  for (const u of urls) {
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error("Image load failed"));
        img.src = u;
      });
      return u;
    } catch {}
  }
  throw new Error("Could not load image (folder/items may not be public).");
}

async function showPhoto(item){
  const bestUrl = await preload(item.urls);
  els.bg.style.backgroundImage = `url("${bestUrl}")`;
  els.photo.classList.remove("show");
  els.photo.classList.toggle("kenburns", !!cfg.kenburns);
  els.photo.src = bestUrl;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      els.photo.classList.add("show");
    });
  });
}

function stopTimers(){
  if (timer) clearTimeout(timer);
  if (refreshTimer) clearInterval(refreshTimer);
  timer = null;
  refreshTimer = null;
}

async function loadPhotos(){
  photos = await fetchDriveImages(cfg.folderId, cfg.apiKey);
  if (photos.length === 0) throw new Error("No images found in that folder.");
  if (cfg.shuffle) shuffleInPlace(photos);
  idx = 0;
}

async function loop(){
  if (!photos.length) return;
  const item = photos[idx];
  await showPhoto(item);
  idx = (idx + 1) % photos.length;
  timer = setTimeout(loop, cfg.seconds * 1000);
}

async function start(){
  stopTimers();

  if (!cfg.apiKey) {
    openSettings();
    setStatus("Paste your Google API key, then Save.");
    return;
  }

  try {
    setStatus("Loading images…");
    await loadPhotos();
    setStatus(`Playing ${photos.length} photos. Press ⚙️ for settings.`);
    await loop();

    if (cfg.refresh) {
      refreshTimer = setInterval(async () => {
        try {
          const currentCount = photos.length;
          const fresh = await fetchDriveImages(cfg.folderId, cfg.apiKey);
          if (fresh.length !== currentCount) {
            photos = cfg.shuffle ? shuffleInPlace(fresh) : fresh;
            idx = 0;
            setStatus(`Updated: now ${photos.length} photos.`);
          }
        } catch {}
      }, cfg.refreshMinutes * 60 * 1000);
    }
  } catch (e) {
    openSettings();
    setStatus(e.message || "Failed to start.");
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

start();


// Layout stage to match the frame window
window.addEventListener('resize', layoutStage);
const _art = document.getElementById('frameArt');
if(_art){ _art.addEventListener('load', layoutStage); }
layoutStage();
