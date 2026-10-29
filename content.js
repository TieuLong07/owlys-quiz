(() => {
  if (window.__owlysQuizLoaded) return;
  window.__owlysQuizLoaded = true;

  let observer = null;
  let lastSignature = "";
  let inFlightSignature = "";
  let timer = null;
  let stabilityTimer = null;
  const retryCounts = new Map();

  function clean(text) {
    return text?.trim().replace(/\s+/g, " ") || "";
  }

  function isElementVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity ?? 1) < 0.85
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return false;
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function getRawVisibleOptions() {
    return [
      ...document.querySelectorAll(
        'button[role="option"][data-cy^="option-"], [role="option"][data-cy^="option-"]'
      )
    ].filter(isElementVisible);
  }

  function getOptions() {
    const raw = getRawVisibleOptions();
    // Sort in visual reading order (top-to-bottom, then left-to-right)
    // to match how the system reads the screenshot.
    return raw.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > 24) {
        return ra.top - rb.top;
      }
      return ra.left - rb.left;
    });
  }

  function getQuestionElement() {
    const selectors = [
      '[data-cy="question-text"]',
      '[data-testid="question-text"]',
      '#questionText',
      '.question-text',
      '[class*="question-text"]',
      '[class*="questionText"]',
      '[data-cy="question-container"]',
      '[data-testid="question-container"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && isElementVisible(el)) return el;
    }

    return null;
  }

  function getQuestionText() {
    const selectors = [
      '[data-cy="question-text"]',
      '[data-testid="question-text"]',
      '#questionText',
      '.question-text',
      '[class*="question-text"]',
      '[class*="questionText"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = clean(el?.innerText);

      if (text) return text;
    }

    return "";
  }

  function getOptionText(option) {
    const specific =
      option.querySelector("#optionText") ||
      option.querySelector('[data-cy="option-text"]') ||
      option.querySelector('[data-testid="option-text"]') ||
      option.querySelector('[class*="option-text"]') ||
      option.querySelector('[class*="optionText"]');

    if (specific) {
      const t = clean(specific.innerText);
      if (t) return t;
    }

    // Fallback: clone and strip shortcut number badge if present
    const raw = clean(option.innerText);
    return raw.replace(/^[1-9]\s+(?=[A-Za-zÀ-ỹ0-9(\[])/, "");
  }

  function getImagesSignatureAndCheckLoaded(containers) {
    const urls = [];
    for (const root of containers) {
      if (!root) continue;
      const imgs = root.querySelectorAll("img");
      for (const img of imgs) {
        const src = img.getAttribute("src") || "";
        if (!src) continue;
        const rect = img.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && img.offsetParent === null) {
          continue;
        }
        if (!img.complete) {
          img.addEventListener("load", () => scheduleCheck(250), { once: true });
          img.addEventListener("error", () => scheduleCheck(250), { once: true });
          return { loaded: false, urls: [] };
        }
        urls.push(src);
      }
    }
    return { loaded: true, urls };
  }

  function getSignature() {
    const rawOptions = getRawVisibleOptions();
    if (rawOptions.length < 2) return "";

    // During slide transitions between two questions, duplicate data-cy values
    // (old question + new question) can exist simultaneously. Wait until old ones leave.
    const seenCy = new Set();
    for (const opt of rawOptions) {
      const cy = opt.getAttribute("data-cy") || "";
      if (cy && seenCy.has(cy)) {
        return "";
      }
      if (cy) seenCy.add(cy);
    }

    const options = getOptions();
    const questionEl = getQuestionElement();
    const imgCheck = getImagesSignatureAndCheckLoaded([questionEl, ...options]);
    if (!imgCheck.loaded) return "";

    const question = getQuestionText();

    const answers = options
      .map((option, idx) => {
        const id = option.getAttribute("data-cy") || `opt-${idx}`;
        const text = getOptionText(option);
        const optImgs = [...option.querySelectorAll("img")]
          .map(i => i.getAttribute("src") || "")
          .filter(Boolean)
          .join(",");
        return `${id}:${text}:${optImgs}`;
      })
      .join("|");

    const qImgs = questionEl
      ? [...questionEl.querySelectorAll("img")]
          .map(i => i.getAttribute("src") || "")
          .filter(Boolean)
          .join(",")
      : "";

    if (!question && !qImgs && options.every(opt => !getOptionText(opt) && !opt.querySelector("img"))) {
      return "";
    }

    return `${question}[${qImgs}]||${answers}`;
  }

  function getLayoutSnapshot() {
    const options = getOptions();
    if (options.length < 2) return "";
    return options
      .map(opt => {
        const r = opt.getBoundingClientRect();
        return `${Math.round(r.left / 3)},${Math.round(r.top / 3)},${Math.round(r.width / 3)},${Math.round(r.height / 3)}`;
      })
      .join("|");
  }

  function detectQuestion() {
    const signature = getSignature();

    if (!signature || signature === lastSignature || signature === inFlightSignature) {
      return;
    }

    const layout1 = getLayoutSnapshot();
    if (!layout1) return;

    clearTimeout(stabilityTimer);
    stabilityTimer = setTimeout(() => {
      const signature2 = getSignature();
      const layout2 = getLayoutSnapshot();

      // If signature or element positions changed during 250ms, animation is still running
      if (!signature2 || signature2 !== signature || layout2 !== layout1) {
        scheduleCheck(300);
        return;
      }

      if (signature2 === lastSignature || signature2 === inFlightSignature) {
        return;
      }

      inFlightSignature = signature2;

      chrome.runtime.sendMessage(
        {
          type: "WAYGROUND_QUESTION",
          signature: signature2
        },
        response => {
          inFlightSignature = "";
          if (chrome.runtime.lastError) {
            return;
          }

          const status = response?.status;
          if (status === "done") {
            lastSignature = signature2;
            retryCounts.delete(signature2);
          } else if (status === "busy" || status === "changed") {
            scheduleCheck(450);
          } else if (status === "retry") {
            const count = retryCounts.get(signature2) || 0;
            if (count < 1) {
              retryCounts.set(signature2, count + 1);
              scheduleCheck(700);
            } else {
              lastSignature = signature2;
            }
          }
        }
      );
    }, 250);
  }

  function scheduleCheck(delayMs = 550) {
    clearTimeout(timer);
    timer = setTimeout(detectQuestion, delayMs);
  }

  function startAuto() {
    if (observer) {
      scheduleCheck();
      return;
    }

    lastSignature = "";
    inFlightSignature = "";

    observer = new MutationObserver(() => {
      scheduleCheck();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    scheduleCheck();
  }

  function stopAuto() {
    observer?.disconnect();
    observer = null;

    clearTimeout(timer);
    clearTimeout(stabilityTimer);
    timer = null;
    stabilityTimer = null;
    lastSignature = "";
    inFlightSignature = "";
  }

  function extractExplicitOptionLabel(text) {
    if (!text) return null;
    const match = text.match(
      /^\s*(?:\(([A-Za-z])\)|\[([A-Za-z])\]|([A-Za-z])\s*[\.\)\:\-\/])\s*\S/
    );
    if (!match) return null;
    return (match[1] || match[2] || match[3]).toUpperCase();
  }

  async function selectAnswer(answer, signature) {
    if (!signature || getSignature() !== signature) return;

    const letters = answer
      ?.trim()
      .toUpperCase()
      .split(",")
      .map(x => x.trim())
      .filter(x => /^[A-Z]$/.test(x));

    if (!letters?.length) return;

    const options = getOptions();
    if (!options.length) return;

    // Check if options contain explicit A./B./C./D. prefixes in their text
    // (common when teachers paste questions with A/B/C/D and Wayground shuffles options)
    const explicitMap = new Map();
    for (const option of options) {
      const label = extractExplicitOptionLabel(getOptionText(option));
      if (label && !explicitMap.has(label)) {
        explicitMap.set(label, option);
      }
    }
    const useExplicitLabels = explicitMap.size >= 2;

    const targets = [];
    for (const letter of letters) {
      let target = null;
      if (useExplicitLabels && explicitMap.has(letter)) {
        target = explicitMap.get(letter);
      } else {
        const index = letter.charCodeAt(0) - 65;
        target = options[index] || null;
      }
      if (target && !targets.includes(target)) {
        targets.push(target);
      }
    }

    for (let i = 0; i < targets.length; i++) {
      if (getSignature() !== signature) return;
      targets[i].click();
      if (targets.length > 1 && i < targets.length - 1) {
        await new Promise(r => setTimeout(r, 120));
      }
    }

    // If multi-select question has a submit button, click it after selecting options
    if (targets.length > 1) {
      await new Promise(r => setTimeout(r, 180));
      const submitBtn = document.querySelector(
        'button[data-cy="submit-button"], button[data-testid="submit-button"]'
      );
      if (submitBtn && isElementVisible(submitBtn)) {
        submitBtn.click();
      }
    }
  }

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (message.type === "START_WAYGROUND_AUTO") {
        startAuto();
        return;
      }

      if (message.type === "STOP_WAYGROUND_AUTO") {
        stopAuto();
        return;
      }

      if (message.type === "GET_WAYGROUND_SIGNATURE") {
        sendResponse({
          signature: getSignature()
        });
        return;
      }

      if (message.type === "AUTO_SELECT") {
        selectAnswer(
          message.answer,
          message.signature
        );
        return;
      }

      if (message.type !== "AI_ANSWER") return;

      // Clean up any existing toast and prior click listeners
      if (window.__owlysQuizDismissHandler) {
        window.removeEventListener("click", window.__owlysQuizDismissHandler, { capture: true });
        window.__owlysQuizDismissHandler = null;
      }
      document.getElementById("__owlys_quiz_answer_toast")?.remove();

      const text = String(message.text || "").trim();
      if (!text) return;

      const fontSize = Number(message.hudFontSize || 24);
      const bgStyle = message.hudBgStyle || "dark";
      const opacityVal = Math.max(0.15, Math.min(1.0, (Number(message.hudOpacity || 85) / 100)));
      const isTransparent = bgStyle === "transparent";
      const isError = text.startsWith("Lỗi:");
      const dismissOnClickPage = message.dismissOnClickPage !== false;

      const el = document.createElement("div");
      el.id = "__owlys_quiz_answer_toast";
      el.textContent = text;

      // Stealth HUD: Clean white text with matte black or ghost transparent background
      Object.assign(el.style, {
        position: "fixed",
        right: "24px",
        top: "24px",
        zIndex: "2147483647",
        padding: isTransparent ? "2px 6px" : `${Math.round(fontSize * 0.35)}px ${Math.round(fontSize * 0.7)}px`,
        borderRadius: isTransparent ? "3px" : "8px",
        background: isTransparent
          ? "transparent"
          : (isError ? "rgba(185, 28, 28, 0.9)" : "rgba(0, 0, 0, 0.92)"),
        backdropFilter: isTransparent ? "none" : "blur(6px)",
        WebkitBackdropFilter: isTransparent ? "none" : "blur(6px)",
        color: "#ffffff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        fontSize: `${fontSize}px`,
        fontWeight: "700",
        lineHeight: "1.2",
        letterSpacing: "0.5px",
        textAlign: "center",
        boxShadow: isTransparent ? "none" : "0 4px 16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)",
        textShadow: isTransparent
          ? "0 0 3px #000, 0 1px 3px #000, 0 0 6px rgba(0,0,0,0.9)"
          : "0 1px 2px rgba(0,0,0,0.5)",
        opacity: String(opacityVal),
        cursor: "pointer",
        userSelect: "none",
        transition: "opacity 0.2s ease, transform 0.15s ease"
      });

      function dismissToast() {
        if (window.__owlysQuizDismissHandler) {
          window.removeEventListener("click", window.__owlysQuizDismissHandler, { capture: true });
          window.__owlysQuizDismissHandler = null;
        }
        if (el.parentNode) {
          el.style.opacity = "0";
          setTimeout(() => el.remove(), 120);
        }
      }

      // Click on HUD itself dismisses immediately
      el.title = "Bấm để ẩn ngay";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        dismissToast();
      });

      // Hover increases opacity temporarily if set low
      el.addEventListener("mouseenter", () => {
        el.style.opacity = "1";
      });
      el.addEventListener("mouseleave", () => {
        el.style.opacity = String(opacityVal);
      });

      document.documentElement.appendChild(el);

      // Feature: Click anywhere on webpage to dismiss HUD
      if (dismissOnClickPage && !message.loading) {
        window.__owlysQuizDismissHandler = () => {
          dismissToast();
        };
        setTimeout(() => {
          if (window.__owlysQuizDismissHandler) {
            window.addEventListener("click", window.__owlysQuizDismissHandler, { capture: true, once: true });
          }
        }, 200);
      }

      // Auto dismiss timeout
      if (!message.loading) {
        const timeoutMs = isError ? 5000 : text.includes(" - ") ? 10000 : 6000;
        setTimeout(() => {
          dismissToast();
        }, timeoutMs);
      }
    }
  );

  // ── Secondary Trigger Listener (Mouse side button or Key) ──
  let secondaryTrigger = { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" };

  chrome.storage.local.get({
    secondaryTrigger: { type: "mouse", button: 3, label: "Chuột phụ 1 (Mouse 4)" }
  }).then(data => {
    secondaryTrigger = data.secondaryTrigger;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.secondaryTrigger) {
      secondaryTrigger = changes.secondaryTrigger.newValue;
    }
  });

  // Anti-spam debounce for mouse and keyboard triggers
  let lastTriggerTime = 0;
  function safeTriggerCapture() {
    const now = Date.now();
    if (now - lastTriggerTime < 1500) return; // Prevent double clicks / spam clicks
    lastTriggerTime = now;
    chrome.runtime.sendMessage({ type: "TRIGGER_CAPTURE" });
  }

  // Mouse / Pointer button trigger (Mouse 4, Mouse 5, Middle button, etc.)
  window.addEventListener("pointerdown", (e) => {
    if (!secondaryTrigger || secondaryTrigger.type !== "mouse") return;
    if (e.button === secondaryTrigger.button) {
      e.preventDefault();
      e.stopPropagation();
      safeTriggerCapture();
    }
  }, { capture: true });

  window.addEventListener("auxclick", (e) => {
    if (!secondaryTrigger || secondaryTrigger.type !== "mouse") return;
    if (e.button === secondaryTrigger.button) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { capture: true });

      // Hotkey Alt + W: Toggle Mode (Nhanh <-> Lam Ki)
    if (e.altKey && (e.code === "KeyW" || e.key === "w" || e.key === "W")) {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: "TOGGLE_MODE" });
      return;
    }

  // Keyboard secondary trigger
  window.addEventListener("keydown", (e) => {
    if (!secondaryTrigger || secondaryTrigger.type !== "keyboard") return;
    const target = e.target;
    const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (isInput && !e.code.startsWith("F")) return;

    if (e.code === secondaryTrigger.code) {
      e.preventDefault();
      e.stopPropagation();
      safeTriggerCapture();
    }
  }, { capture: true });

  chrome.storage.local.get({
    enabled: true,
    autoWayground: false
  }).then(state => {
    if (state.enabled && state.autoWayground) {
      startAuto();
    }
  });
})();