const $ = (id) => document.getElementById(id);
const API_ENDPOINT = "https://hotrosinhvienhub.id.vn/api/event-candidates";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const RIGHTS_BASES = new Set(["owned", "licensed", "permission"]);
const PUBLIC_IMAGE_HOST = /^scontent(?:[.-][a-z0-9-]+)*\.fbcdn\.net$/i;

const els = {
  apiUrl: $("apiUrl"),
  apiToken: $("apiToken"),
  sourceName: $("sourceName"),
  postUrl: $("postUrl"),
  rawContent: $("rawContent"),
  imageUrl: $("imageUrl"),
  imageFile: $("imageFile"),
  imagePreview: $("imagePreview"),
  imagePreviewStatus: $("imagePreviewStatus"),
  imageConsent: $("imageConsent"),
  imageRightsBasis: $("imageRightsBasis"),
  imageUploadStatus: $("imageUploadStatus"),
  saveSettings: $("saveSettings"),
  useCurrentUrl: $("useCurrentUrl"),
  useCurrentImageUrl: $("useCurrentImageUrl"),
  clearImageUrl: $("clearImageUrl"),
  extractText: $("extractText"),
  send: $("send"),
  status: $("status")
};

let previewObjectUrl = null;
let previewRevision = 0;

function setStatus(message, type = "") {
  els.status.textContent = message;
  els.status.className = `status ${type}`;
}

function setImageUploadStatus(message, type = "") {
  els.imageUploadStatus.textContent = message;
  els.imageUploadStatus.className = `status ${type}`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function loadSettings() {
  const data = await chrome.storage.sync.get(["apiToken", "lastSourceName"]);
  const local = await chrome.storage.local.get(["apiToken"]);
  if (!local.apiToken && data.apiToken) {
    await chrome.storage.local.set({ apiToken: data.apiToken });
  }
  if (data.apiToken) await chrome.storage.sync.remove(["apiToken"]);
  els.apiUrl.value = API_ENDPOINT;
  els.apiToken.value = local.apiToken || data.apiToken || "";
  if (data.lastSourceName) els.sourceName.value = data.lastSourceName;

  const tab = await getActiveTab();
  if (tab?.url) els.postUrl.value = tab.url;
}

async function saveSettings() {
  await chrome.storage.local.set({ apiToken: els.apiToken.value.trim() });
  await chrome.storage.sync.set({ lastSourceName: els.sourceName.value.trim() });
  await chrome.storage.sync.remove(["apiToken", "apiUrl"]);
  setStatus("Đã lưu cấu hình.", "ok");
}

function allowedPublicImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || value.length > 2048) return null;
    return PUBLIC_IMAGE_HOST.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

function detectImageType(bytes) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff &&
      bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) return "image/jpeg";
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((part, index) => bytes[index] === part) &&
      bytes[8] === 0 && bytes[9] === 0 && bytes[10] === 0 && bytes[11] === 13 &&
      String.fromCharCode(...bytes.subarray(12, 16)) === "IHDR") return "image/png";
  if (bytes.length >= 16 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" &&
      ["VP8 ", "VP8L", "VP8X"].includes(String.fromCharCode(...bytes.subarray(12, 16)))) return "image/webp";
  return null;
}

async function fetchPublicImageBinary(value) {
  const url = allowedPublicImageUrl(value);
  if (!url) throw new Error("Link ảnh không thuộc nguồn công khai được hỗ trợ. Hãy chọn tệp ảnh hợp lệ.");
  const response = await fetch(url.href, {
    method: "GET", credentials: "omit", redirect: "manual", referrerPolicy: "no-referrer",
    cache: "no-store", headers: { Accept: "image/jpeg,image/png,image/webp" }
  });
  if (response.status !== 200 || !response.body) throw new Error("Không tải được ảnh công khai. Có thể chọn tệp gốc hợp lệ từ máy.");
  const declaredLength = Number(response.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error("Ảnh vượt quá 2 MB.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("Ảnh vượt quá 2 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const contentType = detectImageType(bytes);
  const declaredType = (response.headers.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase();
  if (!contentType || contentType !== declaredType) throw new Error("Định dạng ảnh không hợp lệ.");
  return { bytes, contentType };
}

async function readLocalImage(file) {
  if (!file || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Ảnh phải có dung lượng từ 1 byte đến 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = detectImageType(bytes);
  if (!contentType || contentType !== file.type) throw new Error("Chỉ nhận ảnh JPG, PNG hoặc WEBP hợp lệ.");
  return { bytes, contentType };
}

function releasePreview() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  els.imagePreview.hidden = true;
  els.imagePreview.removeAttribute("src");
}

async function updateImagePreview() {
  const revision = ++previewRevision;
  releasePreview();
  const file = els.imageFile.files?.[0];
  if (file) {
    try {
      await readLocalImage(file);
      if (revision !== previewRevision) return;
      previewObjectUrl = URL.createObjectURL(file);
      els.imagePreview.src = previewObjectUrl;
      els.imagePreview.hidden = false;
      els.imagePreviewStatus.textContent = "Đang xem trước tệp ảnh đã chọn.";
    } catch (error) { els.imagePreviewStatus.textContent = error.message; }
    return;
  }
  const url = els.imageUrl.value.trim();
  if (!url) { els.imagePreviewStatus.textContent = "Chưa chọn ảnh."; return; }
  try {
    const image = await fetchPublicImageBinary(url);
    if (revision !== previewRevision) return;
    previewObjectUrl = URL.createObjectURL(new Blob([image.bytes], { type: image.contentType }));
    els.imagePreview.src = previewObjectUrl;
    els.imagePreview.hidden = false;
    els.imagePreviewStatus.textContent = "Ảnh công khai có thể xem trước; chưa được lưu vào HUB Planner.";
  } catch {
    if (revision === previewRevision) els.imagePreviewStatus.textContent = "Không xem trước được ảnh từ link. Có thể chọn tệp ảnh gốc hợp lệ từ máy.";
  }
}

function isDirectImageUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      /\.(jpg|jpeg|png|webp|gif)(\.|$)/i.test(path) ||
      (parsed.hostname.includes("fbcdn.net") && /\.(jpg|jpeg|png|webp|gif)/i.test(url)) ||
      (parsed.hostname.includes("scontent") && /\.(jpg|jpeg|png|webp|gif)/i.test(url))
    );
  } catch {
    return false;
  }
}

async function collectPostFromPage() {
  const normalize = (text) =>
    (text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const safeDecode = (value) => {
    try {
      return decodeURIComponent(value || "");
    } catch {
      return value || "";
    }
  };

  const isVisibleRect = (rect, minWidth = 20, minHeight = 10) =>
    rect &&
    rect.width >= minWidth &&
    rect.height >= minHeight &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight;

  const getRect = (el, minWidth = 20, minHeight = 10) => {
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      !isVisibleRect(rect, minWidth, minHeight) ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return null;
    }
    return rect;
  };

  const selected = normalize(window.getSelection()?.toString());

  const currentUrl = new URL(location.href);
  const currentHref = safeDecode(location.href);

  const getPostKeys = () => {
    const keys = new Set();
    const path = safeDecode(currentUrl.pathname);

    [
      /\/posts\/([^/?#]+)/i,
      /\/videos\/([^/?#]+)/i,
      /\/reel\/([^/?#]+)/i,
      /\/permalink\/([^/?#]+)/i,
      /\/photos\/[^/]+\/([^/?#]+)/i
    ].forEach((pattern) => {
      const match = path.match(pattern);
      if (match?.[1]) keys.add(match[1]);
    });

    ["multi_permalinks", "story_fbid", "fbid", "v", "set"].forEach((param) => {
      const value = currentUrl.searchParams.get(param);
      if (!value) return;
      value.split(/[,.]/).forEach((part) => {
        const cleaned = part.replace(/^a\./, "").trim();
        if (cleaned) keys.add(cleaned);
      });
    });

    const pfbid = currentHref.match(/pfbid[A-Za-z0-9]+/i)?.[0];
    if (pfbid) keys.add(pfbid);

    return [...keys].filter((key) => key && key.length >= 5);
  };

  const postKeys = getPostKeys();

  const isMainContentRegion = (rect) => {
    if (!rect) return false;
    const width = window.innerWidth || document.documentElement.clientWidth || 1200;
    if (width < 760) return true;
    const centerX = rect.left + rect.width / 2;
    // Loại cột menu bên trái và vùng chat/sidebar bên phải, giữ vùng bài viết trung tâm.
    return centerX > width * 0.18 && centerX < width * 0.78;
  };

  const stripUiLines = (text) => {
    const badLine = /^(bạn bè|kỷ niệm|nhóm|trang|đã lưu|xem thêm|lối tắt của bạn|hub in your heart|đồng hub|menu|watch|marketplace|friends|memories|groups|pages|saved|see more|like|comment|share|thích|bình luận|chia sẻ|gửi|send|ẩn bớt|see less)$/i;
    return normalize(
      normalize(text)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !badLine.test(line))
        .join("\n")
    );
  };

  const looksLikeUiText = (text) => {
    const cleaned = stripUiLines(text);
    if (!cleaned || cleaned.length < 12) return true;
    const lines = cleaned.split("\n").filter(Boolean);
    const navWords = /^(bạn bè|kỷ niệm|nhóm|trang|đã lưu|lối tắt|friends|groups|pages|saved)$/i;
    const navCount = lines.filter((line) => navWords.test(line)).length;
    if (navCount >= 2) return true;
    if (lines.length <= 2 && /^(\d+ giờ|\d+ phút|\d+ h|\d+ m|public|người tham gia|đang ở|was live|shared)/i.test(cleaned)) return true;
    return false;
  };

  const unwrapImageUrl = (url) => {
    let out = url || "";
    try {
      const parsed = new URL(out, location.href);
      for (const key of ["url", "src", "u", "media_url"]) {
        const nested = parsed.searchParams.get(key);
        if (nested && /^https?:/i.test(nested)) out = nested;
      }
    } catch {
      // Keep original URL.
    }
    return out;
  };

  const isBadImageUrl = (url) => {
    const lower = (url || "").toLowerCase();
    return (
      !lower ||
      lower.startsWith("data:") ||
      lower.startsWith("blob:") ||
      lower.includes("emoji") ||
      lower.includes("static.xx.fbcdn") ||
      lower.includes("rsrc.php") ||
      lower.includes("safe_image.php") ||
      lower.includes("/profile_pic") ||
      lower.includes("/cp0/") ||
      lower.includes("p40x40") ||
      lower.includes("p64x64")
    );
  };

  const hasPostKey = (root) => {
    if (!root || !postKeys.length) return false;
    const links = [...root.querySelectorAll("a[href]")].flatMap((a) => [a.href, a.getAttribute("href") || ""]);
    const haystack = safeDecode([root.getAttribute("href") || "", ...links].join("\n"));
    return postKeys.some((key) => haystack.includes(key));
  };

  const collectSeeMoreButtons = () =>
    [...document.querySelectorAll('[role="button"], span, div')]
      .map((el) => ({
        el,
        text: normalize(el.innerText || el.textContent || ""),
        rect: getRect(el, 8, 6)
      }))
      .filter((item) => item.rect && isMainContentRegion(item.rect))
      .filter((item) => item.text === "Xem thêm" || item.text === "See more")
      .slice(0, 5);

  const seeMoreButtons = collectSeeMoreButtons();
  seeMoreButtons.forEach((item) => item.el.click());
  if (seeMoreButtons.length) await sleep(350);

  const getElementText = (el) => stripUiLines(el.innerText || el.textContent || "");

  const candidateMessageElements = () => {
    const explicit = [
      ...document.querySelectorAll('[data-ad-preview="message"]'),
      ...document.querySelectorAll('[data-ad-comet-preview="message"]')
    ].map((el) => ({ el, explicit: true }));

    const generic = [...document.querySelectorAll('div[dir="auto"], span[dir="auto"]')].map((el) => ({
      el,
      explicit: false
    }));

    return [...explicit, ...generic]
      .filter((item, index, arr) => arr.findIndex((x) => x.el === item.el) === index)
      .map((item) => {
        const rect = getRect(item.el, 20, 8);
        const text = getElementText(item.el);
        return { ...item, rect, text };
      })
      .filter((item) => item.rect && isMainContentRegion(item.rect))
      .filter((item) => !looksLikeUiText(item.text))
      .filter((item) => item.text.length >= 15)
      .map((item) => {
        const width = window.innerWidth || 1200;
        const height = window.innerHeight || 800;
        const centerX = item.rect.left + item.rect.width / 2;
        const centerY = item.rect.top + item.rect.height / 2;
        const nearArticle = item.el.closest('[role="article"], article, [data-pagelet*="FeedUnit"], [data-pagelet*="Permalink"]');
        const matchedUrl = hasPostKey(nearArticle || item.el.parentElement || item.el);
        const lineCount = item.text.split("\n").filter(Boolean).length;
        const metaPenalty = /\b(đang ở|was at|with|cùng với)\b/i.test(item.text) && item.text.length < 160 ? 12000 : 0;
        const timeOnlyPenalty = /^(\d+ giờ|\d+ phút|\d+ h|\d+ m|\d+ d|public|người tham gia)/i.test(item.text) ? 20000 : 0;
        const score =
          (item.explicit ? 200000 : 0) +
          (matchedUrl ? 90000 : 0) +
          Math.min(item.text.length, 2500) * 12 +
          (lineCount >= 2 ? 2500 : 0) -
          Math.abs(centerX - width * 0.42) * 2.2 -
          Math.abs(centerY - height * 0.34) * 0.4 -
          metaPenalty -
          timeOnlyPenalty;

        return { ...item, matchedUrl, score };
      })
      .sort((a, b) => b.score - a.score);
  };

  const imageCandidatesIn = (scope, messageRect = null) => {
    if (!scope) return [];

    const fromImg = [...scope.querySelectorAll("img")].map((img) => {
      const url = unwrapImageUrl(img.currentSrc || img.src || "");
      const rect = getRect(img, 55, 55);
      const naturalWidth = img.naturalWidth || 0;
      const naturalHeight = img.naturalHeight || 0;
      const alt = normalize(img.alt || "").toLowerCase();
      return { type: "img", el: img, url, rect, naturalWidth, naturalHeight, alt };
    });

    const fromBackground = [...scope.querySelectorAll("div, a, span")].flatMap((el) => {
      const rect = getRect(el, 80, 80);
      if (!rect) return [];
      const bg = window.getComputedStyle(el).backgroundImage || "";
      const matches = [...bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)];
      return matches.map((match) => ({
        type: "background",
        el,
        url: unwrapImageUrl(match[1]),
        rect,
        naturalWidth: 0,
        naturalHeight: 0,
        alt: ""
      }));
    });

    return [...fromImg, ...fromBackground]
      .filter((item, index, arr) => arr.findIndex((x) => x.url === item.url) === index)
      .filter((item) => item.rect && isMainContentRegion(item.rect))
      .filter((item) => !isBadImageUrl(item.url))
      .map((item) => {
        const area = item.rect.width * item.rect.height;
        const naturalArea = (item.naturalWidth || 0) * (item.naturalHeight || 0);
        const gapFromCaption = messageRect ? item.rect.top - messageRect.bottom : 0;
        const href = item.el.closest("a[href]")?.href || "";
        let score = area * 2 + naturalArea * 0.02;
        if (/scontent|fbcdn/.test(item.url)) score += 6000;
        if (/photo|fbid|set=|posts|permalink|pfbid/.test(href)) score += 3000;
        if (/avatar|profile|ảnh đại diện|profile picture|cover photo/.test(item.alt)) score -= 100000;
        if (messageRect) {
          if (gapFromCaption >= -80 && gapFromCaption <= 1600) score += 50000;
          if (gapFromCaption < -160) score -= 30000;
          score -= Math.max(0, gapFromCaption) * 8;
        }
        return { ...item, area, naturalArea, gapFromCaption, score };
      })
      .filter((item) => item.rect.width >= 120 && item.rect.height >= 90)
      .filter((item) => item.area >= 18000 || item.naturalArea >= 90000)
      .filter((item) => !messageRect || item.gapFromCaption <= 2200)
      .sort((a, b) => b.score - a.score);
  };

  const findRootForMessage = (message) => {
    if (!message?.el) return null;
    const roots = [];
    let current = message.el;
    let depth = 0;

    while (current && current !== document.body && depth < 18) {
      const rect = getRect(current, 120, 60);
      if (rect && isMainContentRegion(rect)) {
        const imgs = imageCandidatesIn(current, message.rect);
        const tooHuge = rect.width > window.innerWidth * 0.94 && rect.height > window.innerHeight * 0.92;
        const matchedUrl = hasPostKey(current);
        const score =
          (matchedUrl ? 90000 : 0) +
          (imgs.length ? 70000 : 0) +
          Math.min(rect.width * rect.height, 900000) * 0.015 -
          (tooHuge && !matchedUrl ? 70000 : 0) -
          depth * 300;
        roots.push({ el: current, rect, imgs, matchedUrl, score });
      }
      current = current.parentElement;
      depth += 1;
    }

    roots.sort((a, b) => b.score - a.score);
    return roots[0] || null;
  };

  const messages = candidateMessageElements();

  let chosenMessage = messages[0] || null;
  let chosenRoot = chosenMessage ? findRootForMessage(chosenMessage) : null;

  // Nếu không thấy caption bằng selector phổ biến, thử lấy article trung tâm có text hợp lệ.
  if (!chosenMessage) {
    const articleCandidates = [...document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"], [data-pagelet*="Permalink"]')]
      .map((el) => {
        const rect = getRect(el, 180, 100);
        const text = getElementText(el);
        const imgs = imageCandidatesIn(el, null);
        const matchedUrl = hasPostKey(el);
        const score =
          (matchedUrl ? 90000 : 0) +
          (imgs.length ? 30000 : 0) +
          Math.min(text.length, 2200) * 5 -
          Math.abs((rect?.left || 0) + (rect?.width || 0) / 2 - (window.innerWidth || 1200) * 0.42) * 2;
        return { el, rect, text, imgs, matchedUrl, score };
      })
      .filter((item) => item.rect && isMainContentRegion(item.rect) && !looksLikeUiText(item.text))
      .sort((a, b) => b.score - a.score);

    const article = articleCandidates[0];
    if (article) {
      chosenRoot = article;
      chosenMessage = {
        el: article.el,
        rect: article.rect,
        text: article.text,
        explicit: false,
        matchedUrl: article.matchedUrl,
        score: article.score
      };
    }
  }

  if (!chosenMessage || looksLikeUiText(chosenMessage.text)) {
    return {
      text: "",
      method: "no_safe_caption_found",
      imageUrl: null,
      imageMethod: "skipped_without_caption",
      error: "Không tìm được caption chắc chắn. Hãy bôi đen caption bài viết rồi bấm lại, hoặc copy/dán thủ công."
    };
  }

  let text = stripUiLines(chosenMessage.text);
  if (text.length > 12000) text = text.slice(0, 12000);

  const rootEl = chosenRoot?.el || chosenMessage.el.closest('[role="article"], article') || document;
  let images = imageCandidatesIn(rootEl, chosenMessage.rect);

  // Fallback có kiểm soát: chỉ quét toàn trang các ảnh lớn ở vùng trung tâm và gần caption.
  if (!images.length) {
    images = imageCandidatesIn(document, chosenMessage.rect).filter((item) => item.gapFromCaption >= -140);
  }

  const bestImage = images[0] || null;
  const confidentImage =
    bestImage &&
    bestImage.score > 24000 &&
    (!chosenRoot || chosenRoot.matchedUrl || bestImage.gapFromCaption <= 900 || bestImage.area >= 60000);

  return {
    text,
    method: chosenMessage.explicit
      ? "facebook_message_block"
      : chosenRoot?.matchedUrl || chosenMessage.matchedUrl
        ? "matched_visible_post"
        : "center_visible_caption",
    imageUrl: confidentImage ? bestImage.url : null,
    imageMethod: confidentImage
      ? chosenRoot?.matchedUrl
        ? "image_in_matched_post"
        : "image_near_caption"
      : bestImage
        ? "image_found_but_not_confident"
        : "no_image_found"
  };
}

async function useCurrentUrl() {
  const tab = await getActiveTab();
  if (tab?.url) {
    els.postUrl.value = tab.url;
    setStatus("Đã lấy link tab hiện tại.", "ok");
  } else {
    setStatus("Không lấy được link tab.", "err");
  }
}

async function useCurrentImageUrl() {
  const tab = await getActiveTab();
  const url = tab?.url || "";
  if (isDirectImageUrl(url)) {
    els.imageUrl.value = url;
    els.imageConsent.checked = false;
    void updateImagePreview();
    setStatus("Đã lấy link ảnh từ tab hiện tại.", "ok");
  } else {
    setStatus("Tab hiện tại không giống link ảnh trực tiếp. Hãy mở ảnh trong tab riêng rồi bấm lại.", "warn");
  }
}

function clearImageUrl() {
  els.imageUrl.value = "";
  els.imageFile.value = "";
  els.imageConsent.checked = false;
  void updateImagePreview();
  setStatus("Đã xoá link ảnh.", "ok");
}

async function extractText() {
  try {
    els.extractText.disabled = true;
    setStatus("Đang lấy caption và ảnh từ bài viết đang mở...");

    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("Không tìm thấy tab hiện tại.");

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPostFromPage
    });

    const payload = result?.result;
    if (payload?.error) throw new Error(payload.error);
    if (!payload?.text) {
      throw new Error("Không lấy được nội dung. Hãy bôi đen caption rồi bấm lại, hoặc copy/dán thủ công.");
    }

    els.rawContent.value = payload.text;
    els.imageUrl.value = payload.imageUrl || "";
    els.imageFile.value = "";
    els.imageConsent.checked = false;
    void updateImagePreview();

    const imageNote = payload.imageUrl
      ? `Có lấy ảnh: ${payload.imageMethod}`
      : `Không tự điền ảnh: ${payload.imageMethod}`;

    setStatus(
      `Đã lấy nội dung: ${payload.method}.\n${imageNote}. Nhớ kiểm tra lại trước khi gửi.`,
      payload.imageUrl ? "ok" : "warn"
    );
  } catch (err) {
    setStatus(err.message || "Không lấy được caption.", "err");
  } finally {
    els.extractText.disabled = false;
  }
}

function buildPayload() {
  const sourceName = els.sourceName.value.trim();
  const postUrl = els.postUrl.value.trim();
  const rawContent = els.rawContent.value.trim();
  const imageUrl = els.imageUrl.value.trim();
  const imageFile = els.imageFile.files?.[0];
  const consent = els.imageConsent.checked;
  const basis = els.imageRightsBasis.value;

  if (!postUrl) throw new Error("Thiếu link bài viết.");
  if (!rawContent) throw new Error("Thiếu caption/nội dung bài viết.");
  if (!sourceName) throw new Error("Thiếu nguồn/CLB.");
  if (consent && !imageUrl && !imageFile) throw new Error("Bạn chưa chọn ảnh để lưu.");
  if (consent && !RIGHTS_BASES.has(basis)) throw new Error("Vui lòng chọn cơ sở quyền sử dụng ảnh.");

  return {
    source_name: sourceName,
    post_url: postUrl,
    raw_content: rawContent,
    image_url: consent ? imageUrl || null : null,
    image_rights_confirmed: consent,
    image_rights_basis: consent ? basis : null,
    submitted_from: "chrome_extension",
    client_created_at: new Date().toISOString()
  };
}

function candidateImageEndpoint(id, suffix) {
  const candidateId = Number(id);
  if (!Number.isSafeInteger(candidateId) || candidateId <= 0) throw new Error("Thiếu mã candidate hợp lệ để kiểm tra ảnh.");
  return `${API_ENDPOINT}/${candidateId}/${suffix}`;
}

async function parseApiResponse(response) {
  let data;
  try { data = await response.json(); }
  catch { data = null; }
  if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  return data;
}

async function waitForStoredImage(id, authorization) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const response = await fetch(candidateImageEndpoint(id, "image-status"), {
      method: "GET", credentials: "omit", redirect: "manual",
      headers: { Authorization: authorization }
    });
    const data = await parseApiResponse(response);
    if (data?.image_ingest_status === "stored") return data.image_stored === true ? "stored" : "failed";
    if (data?.image_ingest_status !== "pending") return data?.image_ingest_status || "failed";
    setImageUploadStatus("Đang lưu ảnh vào HUB Planner...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return "pending";
}

async function uploadBinaryFallback(id, authorization) {
  const file = els.imageFile.files?.[0];
  const image = file ? await readLocalImage(file) : await fetchPublicImageBinary(els.imageUrl.value.trim());
  setImageUploadStatus("Đang tải ảnh lên HUB Planner...");
  const response = await fetch(candidateImageEndpoint(id, "image"), {
    method: "POST", credentials: "omit", redirect: "manual",
    headers: {
      Authorization: authorization,
      "Content-Type": image.contentType,
      "X-Image-Rights-Confirmed": "true",
      "X-Image-Rights-Basis": els.imageRightsBasis.value
    },
    body: image.bytes
  });
  const result = await parseApiResponse(response);
  const imageUrl = result?.candidate?.image_url;
  if (result?.candidate?.image_ingest_status !== "stored" ||
      typeof imageUrl !== "string" || !imageUrl.startsWith("/api/public/v1/event-banners/event-banners/")) {
    throw new Error("Máy chủ chưa xác nhận lưu ảnh vào R2.");
  }
  return true;
}

async function sendCandidate() {
  try {
    els.send.disabled = true;
    setStatus("Đang gửi...");
    setImageUploadStatus("");

    const apiToken = els.apiToken.value.trim();
    if (!apiToken) throw new Error("Bạn cần nhập API token để gửi candidate.");

    const payload = buildPayload();

    await chrome.storage.sync.set({ lastSourceName: els.sourceName.value.trim() });
    await chrome.storage.local.set({ apiToken });
    await chrome.storage.sync.remove(["apiToken", "apiUrl"]);

    const headers = {
      "Content-Type": "application/json",
      Authorization: apiToken.startsWith("Bearer ") ? apiToken : `Bearer ${apiToken}`
    };

    const res = await fetch(API_ENDPOINT, {
      method: "POST",
      credentials: "omit",
      redirect: "manual",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await parseApiResponse(res);
    setStatus(data?.duplicate ? "Sự kiện này đã được gửi trước đó." : "Đã gửi sự kiện để duyệt.", "ok");

    if (!payload.image_rights_confirmed) {
      if (els.imageUrl.value.trim() || els.imageFile.files?.[0]) {
        setImageUploadStatus("Ảnh chưa được lưu vì chưa xác nhận quyền sử dụng.", "warn");
      }
      return;
    }
    const candidateId = data?.candidate?.id;
    try {
      const state = await waitForStoredImage(candidateId, headers.Authorization);
      if (state === "stored") {
        setImageUploadStatus("Đã lưu ảnh vào HUB Planner.", "ok");
        return;
      }
      if (state === "pending") {
        setImageUploadStatus("Ảnh vẫn đang được xử lý. Candidate đã được gửi; hãy kiểm tra lại sau.", "warn");
        return;
      }
      await uploadBinaryFallback(candidateId, headers.Authorization);
      setImageUploadStatus("Đã lưu ảnh vào HUB Planner.", "ok");
    } catch (error) {
      setImageUploadStatus(`Candidate đã được gửi nhưng ảnh chưa lưu được: ${error.message || "không rõ nguyên nhân"}`, "warn");
    }
  } catch (err) {
    setStatus(err.message || "Gửi thất bại.", "err");
  } finally {
    els.send.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", loadSettings);
els.saveSettings.addEventListener("click", saveSettings);
els.useCurrentUrl.addEventListener("click", useCurrentUrl);
els.useCurrentImageUrl.addEventListener("click", useCurrentImageUrl);
els.clearImageUrl.addEventListener("click", clearImageUrl);
els.extractText.addEventListener("click", extractText);
els.send.addEventListener("click", sendCandidate);
els.imageUrl.addEventListener("change", () => { els.imageConsent.checked = false; void updateImagePreview(); });
els.imageFile.addEventListener("change", () => { els.imageConsent.checked = false; void updateImagePreview(); });
els.imagePreview.addEventListener("error", () => {
  els.imagePreview.hidden = true;
  els.imagePreviewStatus.textContent = "Không hiển thị được ảnh; có thể chọn tệp gốc hợp lệ từ máy.";
});
