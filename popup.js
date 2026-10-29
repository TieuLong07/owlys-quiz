/* ─── Element refs ─────────────────────────────────────── */
const enabled = document.getElementById("enabled");
const autoWayground = document.getElementById("autoWayground");
const modeFast = document.getElementById("modeFast");
const modeAccurate = document.getElementById("modeAccurate");
const status = document.getElementById("status");
const answer = document.getElementById("answer");
const answerHint = document.getElementById("answerHint");
const resultBox = document.getElementById("resultBox");
const resultNote = document.getElementById("resultNote");
const errorBox = document.getElementById("error");
const captureButton = document.getElementById("capture");
const themeToggle = document.getElementById("themeToggle");
const iconMoon = document.getElementById("iconMoon");
const iconSun = document.getElementById("iconSun");

const hudSlider = document.getElementById("hudSlider");
const hudSizeLabel = document.getElementById("hudSizeLabel");
const hudOpacitySlider = document.getElementById("hudOpacitySlider");
const hudOpacityLabel = document.getElementById("hudOpacityLabel");
const btnStyleDark = document.getElementById("btnStyleDark");
const btnStyleTransparent = document.getElementById("btnStyleTransparent");
const toggleClickDismiss = document.getElementById("toggleClickDismiss");

const secondaryPresetSelect = document.getElementById("secondaryPresetSelect");
const btnRecordTrigger = document.getElementById("btnRecordTrigger");
const triggerStatusText = document.getElementById("triggerStatusText");

let currentBgStyle = "dark";
let isRecordingTrigger = false;

/* ─── Theme ────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const isDark = theme !== "light";
  if (iconMoon) iconMoon.hidden = !isDark;
  if (iconSun) iconSun.hidden = isDark;
  if (themeToggle) {
    themeToggle.title = isDark ? "Chuyển sang sáng" : "Chuyển sang tối";
    themeToggle.ariaLabel = isDark ? "Chuyển sang sáng" : "Chuyển sang tối";
  }
}

if (themeToggle) {
  themeToggle.onclick = async () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "light" ? "dark" : "light";
    applyTheme(next);
    await chrome.storage.local.set({ owlysQuizTheme: next });
  };
}

/* ─── Stealth HUD Controls ─────────────────────────────── */
function updateStyleButtons(style) {
  currentBgStyle = style;
  if (btnStyleDark) btnStyleDark.classList.toggle("is-active", style === "dark");
  if (btnStyleTransparent) btnStyleTransparent.classList.toggle("is-active", style === "transparent");
}

if (btnStyleDark) {
  btnStyleDark.onclick = async () => {
    updateStyleButtons("dark");
    await chrome.storage.local.set({ hudBgStyle: "dark" });
  };
}

if (btnStyleTransparent) {
  btnStyleTransparent.onclick = async () => {
    updateStyleButtons("transparent");
    await chrome.storage.local.set({ hudBgStyle: "transparent" });
  };
}

if (hudSlider && hudSizeLabel) {
  hudSlider.oninput = async () => {
    const val = Number(hudSlider.value);
    hudSizeLabel.textContent = `${val}px`;
    await chrome.storage.local.set({ hudFontSize: val });
  };
}

if (hudOpacitySlider && hudOpacityLabel) {
  hudOpacitySlider.oninput = async () => {
    const val = Number(hudOpacitySlider.value);
    hudOpacityLabel.textContent = `${val}%`;
    await chrome.storage.local.set({ hudOpacity: val });
  };
}

if (toggleClickDismiss) {
  toggleClickDismiss.onclick = async () => {
    const next = toggleClickDismiss.getAttribute("aria-checked") !== "true";
    toggleClickDismiss.setAttribute("aria-checked", String(next));
    toggleClickDismiss.classList.toggle("is-on", next);
    await chrome.storage.local.set({ dismissOnClickPage: next });
  };
}

/* ─── Secondary Trigger Setup ──────────────────────────── */
function updateTriggerUI(trigger) {
  if (!trigger || trigger.type === "none") {
    if (secondaryPresetSelect) secondaryPresetSelect.value = "none";
    if (triggerStatusText) triggerStatusText.textContent = "Phím phụ: Đã tắt (Chỉ dùng Alt + Q)";
    return;
  }

  let matchedVal = "custom";
  if (trigger.type === "mouse") {
    if (trigger.button === 3) matchedVal = "mouse:3";
    else if (trigger.button === 4) matchedVal = "mouse:4";
    else if (trigger.button === 1) matchedVal = "mouse:1";
  } else if (trigger.type === "keyboard") {
    if (trigger.code === "F2") matchedVal = "key:F2";
    else if (trigger.code === "F4") matchedVal = "key:F4";
    else if (trigger.code === "Backquote") matchedVal = "key:Backquote";
  }

  if (secondaryPresetSelect) secondaryPresetSelect.value = matchedVal;
  if (triggerStatusText) {
    triggerStatusText.textContent = `Đang dùng: ${trigger.label || "Tùy chỉnh"}`;
  }
}

if (secondaryPresetSelect) {
  secondaryPresetSelect.onchange = async () => {
    const val = secondaryPresetSelect.value;
    if (val === "custom") {
      startRecordingTrigger();
      return;
    }

    let trigger = { type: "none", label: "Đã tắt" };
    if (val === "mouse:3") {
      trigger = { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" };
    } else if (val === "mouse:4") {
      trigger = { type: "mouse", button: 4, label: "Chuột phụ 2 (Mouse 5)" };
    } else if (val === "mouse:1") {
      trigger = { type: "mouse", button: 1, label: "Chuột giữa (Middle Click)" };
    } else if (val === "key:F2") {
      trigger = { type: "keyboard", code: "F2", key: "F2", label: "Phím F2" };
    } else if (val === "key:F4") {
      trigger = { type: "keyboard", code: "F4", key: "F4", label: "Phím F4" };
    } else if (val === "key:Backquote") {
      trigger = { type: "keyboard", code: "Backquote", key: "~", label: "Phím ~ (Dấu huyền)" };
    }

    await chrome.storage.local.set({ secondaryTrigger: trigger });
    updateTriggerUI(trigger);
  };
}

function startRecordingTrigger() {
  if (isRecordingTrigger) return;
  isRecordingTrigger = true;
  btnRecordTrigger.classList.add("is-recording");
  btnRecordTrigger.querySelector("span").textContent = "Bấm chuột/phím...";
  if (triggerStatusText) triggerStatusText.textContent = "Hãy nhấp chuột hoặc bấm một phím bất kỳ...";

  const cleanUp = () => {
    isRecordingTrigger = false;
    btnRecordTrigger.classList.remove("is-recording");
    btnRecordTrigger.querySelector("span").textContent = "Gán Phím";
    window.removeEventListener("pointerdown", onPointerDown, { capture: true });
    window.removeEventListener("keydown", onKeyDown, { capture: true });
  };

  const onPointerDown = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    let label = `Chuột (Nút ${e.button})`;
    if (e.button === 3) label = "Chuột phụ 1 (Mouse 4)";
    else if (e.button === 4) label = "Chuột phụ 2 (Mouse 5)";
    else if (e.button === 1) label = "Chuột giữa (Middle Click)";
    else if (e.button === 2) label = "Chuột phải (Right Click)";

    const trigger = { type: "mouse", button: e.button, label };
    await chrome.storage.local.set({ secondaryTrigger: trigger });
    updateTriggerUI(trigger);
    cleanUp();
  };

  const onKeyDown = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const label = `Phím ${e.code}`;
    const trigger = { type: "keyboard", code: e.code, key: e.key, label };
    await chrome.storage.local.set({ secondaryTrigger: trigger });
    updateTriggerUI(trigger);
    cleanUp();
  };

  setTimeout(() => {
    window.addEventListener("pointerdown", onPointerDown, { capture: true, once: true });
    window.addEventListener("keydown", onKeyDown, { capture: true, once: true });
  }, 100);
}

if (btnRecordTrigger) {
  btnRecordTrigger.onclick = () => {
    startRecordingTrigger();
  };
}

/* ─── Status Render ────────────────────────────────────── */
function renderStatus() {
  const isEnabled = enabled.getAttribute("aria-checked") === "true";
  const isAuto = autoWayground.getAttribute("aria-checked") === "true";

  enabled.setAttribute("aria-checked", String(isEnabled));
  autoWayground.setAttribute("aria-checked", String(isAuto));

  status.textContent = isEnabled ? "Sẵn sàng" : "Đã tắt";
  status.style.color = isEnabled ? "var(--green)" : "var(--text-muted)";
  const dot = document.querySelector(".status-pulse-dot");
  if (dot) {
    dot.style.background = isEnabled ? "var(--green)" : "var(--text-dim)";
    dot.style.boxShadow = isEnabled ? "0 0 6px var(--green)" : "none";
  }
  autoWayground.disabled = !isEnabled;
  if (captureButton) captureButton.disabled = !isEnabled;

  enabled.classList.toggle("is-on", isEnabled);
  autoWayground.classList.toggle("is-on", isAuto);
}

function showError(message) {
  if (errorBox) errorBox.textContent = message || "";
}

function sanitizeQuestionType(value) {
  if (value === "fill") return "fill";
  if (value === "essay") return "essay";
  if (value === "multi-question") return "multi-question";
  return "mcq";
}

let freshBoxTimer = null;

function renderAnswerValue(value, questionType = "mcq") {
  const text = String(value ?? "-");
  const isPlaceholder = text === "-" || text === "..." || text.trim() === "?";
  const isMultiQuestion = text.includes(" - ");
  const isEssay = !isPlaceholder && !isMultiQuestion && (questionType === "essay" || text.length > 35 || text.includes("\n"));
  const isMulti = !isPlaceholder && !isEssay && (isMultiQuestion || questionType === "fill" || text.length > 5);

  answer.textContent = text;
  answer.classList.toggle("answer-loading", text === "...");
  answer.classList.toggle("answer-unknown", text.trim() === "?");
  answer.classList.toggle("answer-multi", isMulti);
  answer.classList.toggle("answer-essay", isEssay);

  answer.classList.remove("is-popping");
  if (!isPlaceholder) {
    void answer.offsetWidth;
    answer.classList.add("is-popping");
    if (resultBox) {
      resultBox.classList.add("is-fresh");
      clearTimeout(freshBoxTimer);
      freshBoxTimer = setTimeout(() => {
        resultBox.classList.remove("is-fresh");
      }, 900);
    }
  } else if (resultBox) {
    resultBox.classList.remove("is-fresh");
  }
}

async function copyAnswerToClipboard(text) {
  const cleanText = String(text ?? "").trim();
  if (!cleanText || cleanText === "-" || cleanText === "..." || cleanText === "?") {
    return false;
  }
  try {
    await navigator.clipboard.writeText(cleanText);
    if (resultNote) {
      resultNote.textContent = "✓ Đã copy đáp án: " + cleanText;
    }
    return true;
  } catch {
    return false;
  }
}

function renderAnswerMode(mode) {
  const isAccurate = mode === "accurate";
  modeFast.checked = !isAccurate;
  modeAccurate.checked = isAccurate;
  modeFast.closest(".mode-radio").classList.toggle("is-selected", !isAccurate);
  modeAccurate.closest(".mode-radio").classList.toggle("is-selected", isAccurate);
}

async function setAnswerMode(mode) {
  const answerMode = mode === "accurate" ? "accurate" : "fast";
  await chrome.storage.local.set({ answerMode });
  renderAnswerMode(answerMode);
}

/* ─── Event Handlers ───────────────────────────────────── */
enabled.onclick = async () => {
  const next = enabled.getAttribute("aria-checked") !== "true";
  enabled.setAttribute("aria-checked", String(next));
  await chrome.storage.local.set({ enabled: next });

  if (!next) {
    await chrome.storage.local.set({ autoWayground: false });
    autoWayground.setAttribute("aria-checked", "false");
    await chrome.runtime.sendMessage({ type: "SET_AUTO_WAYGROUND", enabled: false });
  }

  renderStatus();
};

autoWayground.onclick = async () => {
  if (enabled.getAttribute("aria-checked") !== "true") return;
  const next = autoWayground.getAttribute("aria-checked") !== "true";
  autoWayground.setAttribute("aria-checked", String(next));
  await chrome.storage.local.set({ autoWayground: next });
  await chrome.runtime.sendMessage({ type: "SET_AUTO_WAYGROUND", enabled: next });
  renderStatus();
};

modeFast.onchange = () => {
  if (modeFast.checked) setAnswerMode("fast");
};
modeAccurate.onchange = () => {
  if (modeAccurate.checked) setAnswerMode("accurate");
};

if (resultBox) {
  resultBox.onclick = () => {
    copyAnswerToClipboard(answer.textContent);
  };
}

/* ─── Capture Action ───────────────────────────────────── */
captureButton.onclick = async () => {
  renderAnswerValue("...");
  answerHint.textContent = "AI đang xử lý...";
  if (resultNote) {
    resultNote.textContent = "Đang gửi ảnh tới Owlys Cloud...";
  }
  showError("");

  const { answerMode = "fast" } = await chrome.storage.local.get({
    answerMode: "fast"
  });

  const result = await chrome.runtime.sendMessage({
    type: "CAPTURE_AND_ANSWER",
    mode: answerMode === "accurate" ? "accurate" : "fast"
  });

  if (result?.ok) {
    const detectedType = sanitizeQuestionType(result.questionType);
    renderAnswerValue(result.answer, detectedType);

    if (result.answer === "?") {
      answerHint.textContent = "Không nhận diện được";
      if (resultNote) resultNote.textContent = "Không tìm thấy câu hỏi hoàn chỉnh trên màn hình.";
    } else {
      answerHint.textContent = "Đã giải xong";
      if (resultNote) resultNote.textContent = "Click vào khung để sao chép đáp án";
    }
  } else {
    renderAnswerValue("-");
    answerHint.textContent = "Lỗi";
    showError(result?.error || "Không thể kết nối máy chủ");
  }
};

/* ─── Init ─────────────────────────────────────────────── */
async function init() {
  const data = await chrome.storage.local.get({
    enabled: true,
    autoWayground: false,
    answerMode: "fast",
    owlysQuizTheme: "dark",
        hudFontSize: 24,
    hudBgStyle: "dark",
    hudOpacity: 85,
    dismissOnClickPage: true,
    secondaryTrigger: { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" }
  });

  applyTheme(data.owlysQuizTheme || "dark");
  renderAnswerMode(data.answerMode === "accurate" ? "accurate" : "fast");
  updateStyleButtons(data.hudBgStyle || "dark");
  updateTriggerUI(data.secondaryTrigger);

  if (hudSlider && hudSizeLabel) {
    const fs = Number(data.hudFontSize) || 24;
    hudSlider.value = fs;
    hudSizeLabel.textContent = `${fs}px`;
  }

  if (hudOpacitySlider && hudOpacityLabel) {
    const op = Number(data.hudOpacity) || 85;
    hudOpacitySlider.value = op;
    hudOpacityLabel.textContent = `${op}%`;
  }

  if (toggleClickDismiss) {
    const isDismiss = data.dismissOnClickPage !== false;
    toggleClickDismiss.setAttribute("aria-checked", String(isDismiss));
    toggleClickDismiss.classList.toggle("is-on", isDismiss);
  }

  enabled.setAttribute("aria-checked", String(Boolean(data.enabled)));
  autoWayground.setAttribute("aria-checked", String(Boolean(data.autoWayground)));
  renderStatus();
}

const btnRestart = document.getElementById("btnRestart");
if (btnRestart) {
  btnRestart.onclick = async () => {
    btnRestart.style.transform = "rotate(180deg)";
    btnRestart.style.transition = "transform 0.3s ease";
    showError("");
    if (resultNote) resultNote.textContent = "Đang khởi động lại...";
    await chrome.runtime.sendMessage({ type: "RESTART_EXTENSION" }).catch(() => {});
    setTimeout(() => {
      window.close();
    }, 200);
  };
}

init();
