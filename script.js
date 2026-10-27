// ===== 配置 =====
const MAX_POPUPS = 15;

// 广告弹窗标题池（可自行修改）
const AD_TITLES = [
  "🎉 恭喜您中奖了！",
  "💰 限时优惠",
  "🔥 热门推荐",
  "🎁 免费领取",
  "⭐ 精彩广告",
  "📢 特别通知",
  "🎊 惊喜活动",
  "💎 尊享特权",
];

// 弹窗图片池（assets 目录下的素材，随机取用）
const AD_IMAGES = [
  "assets/2547.GIF",
  "assets/2615.GIF",
  "assets/2600.PNG",
  "assets/76c8db04842bf7bd9ab88981148d4863.JPG",
  "assets/cb2990c259045d0ca38041491108568b.JPG",
  "assets/IMG_1624.GIF",
  "assets/IMG_9526.GIF",
  "assets/WechatIMG775.jpeg",
  "assets/WechatIMG776.jpeg",
];

// 弹窗最大显示尺寸占画布的比例（相对画布宽高，手机上会自动变小）
const MAX_W_RATIO = 0.28;   // 弹窗最大宽度 = 画布宽 * 0.28
const MAX_H_RATIO = 0.42;   // 弹窗最大高度 = 画布高 * 0.42

let popupCount = 0;
let popupZIndex = 1;   // 弹窗递增层级，后创建的在上层
const popupLayer = document.getElementById("popupLayer");
const playBtn = document.getElementById("playBtn");

// 优先选择屏幕上出现次数最少的素材；未加载完也不阻塞后续点击。
const imageUseCounts = new Map();
function nextImage() {
  if (!readyImages.length) return undefined;
  const minCount = Math.min(...readyImages.map(src => imageUseCounts.get(src) || 0));
  const candidates = readyImages.filter(src => (imageUseCounts.get(src) || 0) === minCount);
  const src = candidates[randInt(0, candidates.length - 1)];
  imageUseCounts.set(src, minCount + 1);
  return src;
}

// 预先加载并解码素材；弹窗只使用已经准备好的图片。
const imageCache = new Map();
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => {
      img.onload = img.onerror = null;
      reject(new Error("图片加载超时：" + src));
    }, 30000);
    img.onload = () => {
      clearTimeout(timer);
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => {
      // WebP 请求失败时使用原始素材。
      if (img.dataset.fallback) { clearTimeout(timer); reject(new Error(src)); return; }
      img.dataset.fallback = "true";
      img.src = src;
    };
    img.src = src.startsWith("assets/")
      ? src.replace("assets/", "assets/optimized/").replace(/\.(gif|jpe?g|png)$/i, ".webp") + "?v=24"
      : src;
  });
}
const readyImages = [];
let settledImages = 0;
let pendingPopup = false;
Promise.all(AD_IMAGES.map(async (src) => {
  try {
    await loadImage(src);
    readyImages.push(src);
  } catch (_) { console.warn("图片加载失败：", src); }
  finally {
    settledImages++;
    if (pendingPopup) createAdPopup();
  }
}));

// 封面与壁纸准备好后，一起显示桌面，避免 UI 和图片分批出现。
Promise.all([loadImage("IMG_5614.JPG"), loadImage("未命名的作品.jpg")])
  .catch(() => {})
  .finally(() => document.documentElement.classList.remove("loading"));

// ===== 时钟 =====
function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  document.getElementById("clock").textContent = `${hh}:${mm}`;
}
updateClock();
setInterval(updateClock, 1000);

// ===== 随机整数 =====
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 使用画布逻辑坐标，兼容竖屏旋转后的触摸位置。
function randomPosition(w, h, movingPopup = null) {
  const desktop = document.getElementById("desktop");
  const areaW = desktop.offsetWidth;
  const areaH = desktop.offsetHeight;
  const margin = 10;
  const maxX = Math.max(margin, areaW - w - margin);
  const maxY = Math.max(margin, areaH - h - 50);
  const corners = [
    { x: margin, y: margin }, { x: maxX, y: maxY },
    { x: maxX, y: margin }, { x: margin, y: maxY },
  ];
  // 播放键居于封面中央；逐层累加偏移，包含播放器的居中变换。
  const player = document.getElementById("player");
  const cover = document.getElementById("videoCover");
  let coverY = 0;
  for (let node = cover; node && node !== player; node = node.offsetParent) coverY += node.offsetTop;
  const centerX = areaW / 2;
  const centerY = (areaH - player.offsetHeight) / 2 + coverY + cover.offsetHeight / 2;
  const avoid = { x: centerX - 48, y: centerY - 48, w: 96, h: 96 };
  const overlap = (a, b) => Math.max(0, Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))
    * Math.max(0, Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const existing = [...popupLayer.querySelectorAll(".ad-popup")]
    .filter(p => p !== movingPopup)
    .map(p => ({ x: parseFloat(p.style.left), y: parseFloat(p.style.top), w: p.offsetWidth, h: p.offsetHeight }));
  // 前四个固定占据不同角落，然后选择重叠面积最小的边缘位置。
  if (!movingPopup && popupCount < 4 && !overlap({ ...corners[popupCount], w, h }, avoid)) {
    return corners[popupCount];
  }
  const candidates = corners.slice();
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    candidates.push({x: margin + (maxX-margin)*t, y: margin},
      {x: margin + (maxX-margin)*t, y: maxY},
      {x: margin, y: margin + (maxY-margin)*t},
      {x: maxX, y: margin + (maxY-margin)*t});
  }
  let best = candidates[0], bestScore = Infinity;
  for (const point of candidates) {
    const rect = { ...point, w, h };
    const score = overlap(rect, avoid) * 10000
      + existing.reduce((sum, other) => sum + overlap(rect, other), 0);
    if (score < bestScore) { best = point; bestScore = score; }
  }
  return best;
}

// 短促的系统错误提示音：现场合成，无音频下载。
let audioContext;
function unlockAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audioContext ||= new Audio();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  } catch (_) {}
}
function playErrorSound() {
  if (!audioContext) return;
  if (audioContext.state === "suspended") {
    audioContext.resume().then(playErrorSound).catch(() => {});
    return;
  }
  if (audioContext.state !== "running") return;
  const now = audioContext.currentTime;
  [440, 554.37, 659.25].forEach((frequency, i) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.93, now + 0.22);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.065 / (i + 1), now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.start(now); oscillator.stop(now + 0.3);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}

// 海报作为首页内的视图显示，不写入地址或持久化状态。
function showPoster() {
  if (document.getElementById("posterView")) return;
  const frame = document.createElement("iframe");
  frame.id = "posterView";
  frame.title = "招募海报";
  frame.src = "poster.html?v=32";
  document.body.appendChild(frame);
  document.getElementById("rotateWrap").hidden = true;
  frame.focus();
}

// ===== 创建广告弹窗 =====
function createAdPopup() {
  if (popupCount >= MAX_POPUPS) return;

  const idx = popupCount;
  const title = AD_TITLES[idx % AD_TITLES.length];

  // 优先使用尚未显示的素材，再均匀分配重复素材
  const imgSrc = nextImage();
  if (!imgSrc) {
    pendingPopup = settledImages < AD_IMAGES.length;
    return;
  }
  pendingPopup = false;
  buildPopup(imgSrc, title);
}

// ===== 用图片真实尺寸构建弹窗 =====
function buildPopup(imgSrc, title) {
  const desktop = document.getElementById("desktop");
  const areaW = desktop ? desktop.offsetWidth : 1280;
  const areaH = desktop ? desktop.offsetHeight : 720;

  // 竖屏手机：画布是 100vh x 100vw（实际像素，无缩放），
  // 弹窗直接用较小的绝对像素，避免占满屏幕
  const isPortrait = window.innerHeight > window.innerWidth;
  let maxW, maxH;
  if (isPortrait) {
    // 屏幕短边（手机宽度）
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    // 弹窗在屏幕上占短边约 42%
    const target = shortSide * 0.42;
    maxW = target;
    maxH = target;
  } else {
    maxW = areaW * MAX_W_RATIO;
    maxH = areaH * MAX_H_RATIO;
  }

  const cached = imageCache.get(imgSrc);
  const ratio = cached.naturalWidth / cached.naturalHeight;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = Math.round(w);
  h = Math.round(h);

  const { x, y } = randomPosition(w, h);

  const popup = document.createElement("div");
  popup.className = "ad-popup";
  popup.style.width = w + "px";
  popup.style.height = h + "px";
  popup.style.left = x + "px";
  popup.style.top = y + "px";
  // 递增层级：后创建的弹窗整体在上层，叉叉不会串到别的弹窗上
  popup.style.zIndex = popupZIndex++;

  popup.innerHTML = `
    <span class="ad-close" title="关闭">✕</span>
    <div class="ad-body"></div>
  `;

  const body = popup.querySelector(".ad-body");
  const posterLink = document.createElement("a");
  posterLink.href = "./";
  posterLink.addEventListener("click", event => {
    event.preventDefault();
    showPoster();
  });
  posterLink.setAttribute("aria-label", "查看招募海报");
  posterLink.style.cssText = "display:block;width:100%;height:100%";
  const imgEl = imageCache.get(imgSrc).cloneNode();
  imgEl.alt = title;
  posterLink.appendChild(imgEl);
  body.appendChild(posterLink);

  // 关闭按钮：关不掉，反而跳到别的位置
  const closeBtn = popup.querySelector(".ad-close");
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    movePopup(popup);
  });

  popupLayer.appendChild(popup);
  popupCount++;
  playErrorSound();
}

// ===== 把弹窗移动到新位置 =====
function movePopup(popup) {
  // 用弹窗当前实际尺寸，避免图片加载后尺寸变化导致定位不准
  const w = popup.offsetWidth;
  const h = popup.offsetHeight;
  const { x, y } = randomPosition(w, h, popup);
  popup.style.left = x + "px";
  popup.style.top = y + "px";

  // 抖动一下（用 requestAnimationFrame 避免强制同步重排）
  popup.classList.remove("shake");
  requestAnimationFrame(() => {
    popup.classList.add("shake");
  });
}

// ===== 点击播放按钮 =====
playBtn.addEventListener("click", () => {
  unlockAudio();
  createAdPopup();
});

// ===== 窗口尺寸变化时，防止弹窗跑出屏幕 =====
window.addEventListener("resize", () => {
  const desktop = document.getElementById("desktop");
  const areaW = desktop ? desktop.clientWidth : window.innerWidth;
  const areaH = desktop ? desktop.clientHeight : window.innerHeight;
  document.querySelectorAll(".ad-popup").forEach((p) => {
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const left = parseInt(p.style.left, 10);
    const top = parseInt(p.style.top, 10);
    const maxX = areaW - w - 10;
    const maxY = areaH - h - 50;
    if (left > maxX) p.style.left = Math.max(10, maxX) + "px";
    if (top > maxY) p.style.top = Math.max(10, maxY) + "px";
  });
});




