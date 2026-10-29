// Owlys Quiz - Background Service Worker
// Secure client: all AI processing, prompts, models, and credit management are handled by Owlys Backend.

const OWLYS_API_URL = "https://api.owlys.io.vn/api/answer";

const pendingTabs = new Set();
let lastBgTriggerTime = 0;
const MAX_IMAGE_DIMENSION = 1280;
const JPEG_QUALITY = 0.78;

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get({
    enabled: true,
    autoWayground: false,
    answerMode: "fast",
    questionType: "mcq",
    owlysQuizTheme: "dark",
    hudFontSize: 24,
    hudBgStyle: "dark",
    hudOpacity: 85,
    dismissOnClickPage: true,
    secondaryTrigger: { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" }
  });

  await chrome.storage.local.set({
    enabled: typeof data.enabled === "boolean" ? data.enabled : true,
    autoWayground: typeof data.autoWayground === "boolean" ? data.autoWayground : false,
    answerMode: data.answerMode === "accurate" ? "accurate" : "fast",
    questionType: data.questionType === "fill" || data.questionType === "essay" ? data.questionType : "mcq",
    owlysQuizTheme: data.owlysQuizTheme || "dark",
    hudFontSize: data.hudFontSize || 24,
    hudBgStyle: data.hudBgStyle || "dark",
    hudOpacity: data.hudOpacity || 85,
    dismissOnClickPage: data.dismissOnClickPage !== false,
    secondaryTrigger: data.secondaryTrigger || { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" }
  });
});

async function toggleAnswerMode(tabId = null) {
  const data = await chrome.storage.local.get({ answerMode: "fast" });
  const nextMode = data.answerMode === "accurate" ? "fast" : "accurate";
  await chrome.storage.local.set({ answerMode: nextMode });

  const label = nextMode === "accurate" ? "Chế độ: Làm Kĩ (Phân tích bẫy)" : "Chế độ: Nhanh (Tức thì)";
  try {
    if (!tabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tabs[0]?.id;
    }
    if (tabId) {
      await show(tabId, label, false, "mcq");
    }
  } catch {}
  return nextMode;
}

async function restartExtension() {
  pendingTabs.clear();
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      await show(tabs[0].id, "Đã khởi động lại sạch sẽ", false, "mcq");
    }
  } catch {}
  setTimeout(() => {
    chrome.runtime.reload();
  }, 120);
}

chrome.commands.onCommand.addListener(async command => {
  if (command === "toggle-extension") {
    const data = await chrome.storage.local.get({ enabled: true });
    const enabled = !data.enabled;
    await chrome.storage.local.set({ enabled });
    if (!enabled) {
      await updateAutoWatcher(false);
    }
    return;
  }

  if (command === "toggle-auto-wayground") {
    const state = await chrome.storage.local.get({
      enabled: true,
      autoWayground: false
    });
    if (!state.enabled) return;
    const autoWayground = !state.autoWayground;
    await chrome.storage.local.set({ autoWayground });
    await updateAutoWatcher(autoWayground);
    return;
  }

  if (command === "restart-extension") {
    await restartExtension();
    return;
  }

  if (command === "toggle-mode") {
    await toggleAnswerMode();
    return;
  }

  if (command === "capture-answer") {
    const now = Date.now();
    if (now - lastBgTriggerTime < 1500) return;
    lastBgTriggerTime = now;
    await captureAndAnswer(true);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RESTART_EXTENSION") {
    restartExtension().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "TOGGLE_MODE") {
    toggleAnswerMode(sender.tab?.id).then(mode => sendResponse({ ok: true, mode }));
    return true;
  }

  if (message.type === "TRIGGER_CAPTURE" || message.type === "CAPTURE_AND_ANSWER") {
    captureAndAnswer(true, message.mode, message.questionType)
      .then(sendResponse)
      .catch(error => {
        sendResponse({
          ok: false,
          error: error.message
        });
      });
    return true;
  }

  if (message.type === "SET_AUTO_WAYGROUND") {
    updateAutoWatcher(message.enabled);
    return;
  }

  if (message.type === "WAYGROUND_QUESTION") {
    const tabId = sender.tab?.id;
    if (!tabId || !message.signature) {
      sendResponse({ status: "ignored" });
      return false;
    }

    runAuto(tabId, message.signature)
      .then(sendResponse)
      .catch(() => sendResponse({ status: "retry" }));

    return true;
  }
});

async function captureOptimized(windowId) {
  const original = await chrome.tabs.captureVisibleTab(windowId, {
    format: "jpeg",
    quality: 80
  });

  const response = await fetch(original);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;

  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(originalWidth, originalHeight)
  );

  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");

  context.drawImage(bitmap, 0, 0, width, height);

  const output = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: JPEG_QUALITY
  });

  bitmap.close();

  const buffer = await output.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `data:image/jpeg;base64,${btoa(binary)}`;
}

function sanitizeQuestionType(value) {
  if (value === "mcq") return "mcq";
  if (value === "fill") return "fill";
  if (value === "essay") return "essay";
  return "auto";
}

async function runAuto(tabId, signature) {
  const state = await chrome.storage.local.get({
    enabled: true,
    autoWayground: false,
    answerMode: "fast"
  });

  if (!state.enabled || !state.autoWayground) {
    return { status: "ignored" };
  }

  if (pendingTabs.has(tabId)) {
    return { status: "busy" };
  }

  pendingTabs.add(tabId);

  try {
    await new Promise(resolve => setTimeout(resolve, 200));

    const current = await getSignature(tabId);
    if (current !== signature) {
      return { status: "changed" };
    }

    const tab = await chrome.tabs.get(tabId);
    if (!tab.windowId || !tab.active) {
      return { status: "changed" };
    }

    const image = await captureOptimized(tab.windowId);
    const data = await askAI(image, state.answerMode, "mcq");

    if (!data.ok || data.answer === "?") {
      return { status: "retry" };
    }

    const latest = await getSignature(tabId);
    if (latest !== signature) {
      return { status: "changed" };
    }

    await chrome.tabs.sendMessage(tabId, {
      type: "AUTO_SELECT",
      answer: data.answer,
      signature
    });

    return { status: "done" };
  } catch (error) {
    console.error("Auto error:", error);
    return { status: "retry" };
  } finally {
    pendingTabs.delete(tabId);
  }
}

async function captureAndAnswer(showToast, requestedMode = null, requestedQuestionType = null) {
  const state = await chrome.storage.local.get({
    enabled: true,
    answerMode: "fast"
  });

  const answerMode = requestedMode === "accurate"
    ? "accurate"
    : requestedMode === "fast"
      ? "fast"
      : state.answerMode === "accurate"
        ? "accurate"
        : "fast";

  const questionType = sanitizeQuestionType(requestedQuestionType || "auto");

  if (!state.enabled) {
    return {
      ok: false,
      error: "Extension đang tắt"
    };
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !tab.windowId || !/^https?:/.test(tab.url || "")) {
    return {
      ok: false,
      error: "Trang này không thể chụp"
    };
  }

  if (pendingTabs.has(tab.id)) {
    return {
      ok: false,
      error: "Đang chờ AI giải..."
    };
  }

  pendingTabs.add(tab.id);

  try {
    const image = await captureOptimized(tab.windowId);

    if (showToast) {
      await show(tab.id, "...", true, "mcq");
    }

    const data = await askAI(image, answerMode, questionType);

    if (!data.ok) {
      throw new Error(data.error || "Máy chủ giải đề lỗi");
    }

    if (showToast) {
      await show(tab.id, data.answer, false, data.questionType || "mcq");
    }

    return data;
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "AI phản hồi quá lâu. Vui lòng thử lại."
      : error.message || "Không thể lấy đáp án";

    if (showToast) {
      await show(tab.id, `Lỗi: ${message}`, false, "mcq");
    }

    return {
      ok: false,
      error: message
    };
  } finally {
    pendingTabs.delete(tab.id);
  }
}

// Secure call to Owlys Edge Backend
async function askAI(image, mode = "fast", questionType = "auto") {
  const response = await fetch(OWLYS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image,
      mode: mode === "accurate" ? "accurate" : "fast",
      questionType: sanitizeQuestionType(questionType)
    }),
    signal: AbortSignal.timeout(35000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok || typeof data.answer !== "string") {
    throw new Error(data.error || `Lỗi máy chủ (${response.status})`);
  }

  return data;
}

async function getSignature(tabId) {
  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: "GET_WAYGROUND_SIGNATURE"
    });
    return result?.signature || "";
  } catch {
    return "";
  }
}

async function show(tabId, text, loading = false, questionType = "mcq") {
  try {
    await ensureContent(tabId);
    const cfg = await chrome.storage.local.get({
      hudFontSize: 24,
      hudBgStyle: "dark",
      hudOpacity: 85,
      dismissOnClickPage: true
    });
    await chrome.tabs.sendMessage(tabId, {
      type: "AI_ANSWER",
      text,
      loading,
      questionType,
      hudFontSize: Number(cfg.hudFontSize) || 24,
      hudBgStyle: cfg.hudBgStyle || "dark",
      hudOpacity: Number(cfg.hudOpacity) || 85,
      dismissOnClickPage: cfg.dismissOnClickPage !== false
    });
  } catch {}
}

async function ensureContent(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function updateAutoWatcher(enabled) {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id || !/^https?:/.test(tab.url || "")) {
    return;
  }

  try {
    await ensureContent(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: enabled ? "START_WAYGROUND_AUTO" : "STOP_WAYGROUND_AUTO"
    });
  } catch (error) {
    console.error("Watcher error:", error);
  }
}
