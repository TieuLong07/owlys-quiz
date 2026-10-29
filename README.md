# Owlys Quiz

> High-performance AI Exam and Quiz Assistant engineered for precision, speed, and distraction-free operation.

Owlys Quiz is a lightweight Chromium browser extension (Manifest V3) that captures on-screen quiz questions and queries the Owlys AI Solver on Cloudflare Edge to return clean, verified answers in sub-3-second latency.

All AI model orchestration, reasoning logic, token accounting, and secure fallbacks run exclusively on the Owlys Backend Gateway. The browser client remains strictly unbloated, secure, and ready for commercial credit-based quota management.

---

## Key Highlights

- **Instant Visual Solving**: Compresses and dispatches visible viewport snapshots to the edge solver with sub-3s round-trip time.
- **Dual Reasoning Engines**:
  - `Fast Mode`: Instant answer extraction optimized for speed.
  - `Accurate Mode`: Deep reasoning pass to catch trick questions and complex logic.
- **Stealth HUD**: Minimalist on-screen heads-up display. Supports matte black or ghost-transparent styling, customizable font sizes, opacity controls, and instant click-to-dismiss.
- **Custom Hardware Triggers**: Full support for side mouse buttons (Mouse 4 / Mouse 5), middle click, or custom function keys with a built-in 1.5-second anti-spam debounce.
- **Multi-Question Parsing**: Accurately formats single-letter answers (`A`, `B`, `C`) as well as clustered multi-question blocks (`1A - 2B - 3C`).
- **One-Click Panic Restart**: Recovers from stuck DOM observers or tab disconnects in 0.12 seconds without browser restarts.
- **Automated Wayground Solver**: Optional DOM observer mode that identifies active questions and selects answers automatically.

---

## Operational Hotkeys

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`Alt + Q`** | **Capture & Solve** | Snap active viewport and display answer in Stealth HUD |
| **`Alt + W`** | **Toggle AI Mode** | Switch between Fast Mode and Accurate Mode with HUD notice |
| **`Alt + R`** | **Panic Restart** | Clear in-flight request queues and reload extension state |
| **`Alt + A`** | **Auto Solver** | Toggle automatic question solving for Wayground |
| **`Mouse 4`** | **Secondary Trigger** | Optional hardware mouse button to capture without keyboard |

---

## System Architecture

```
[ Chromium Tab / Exam Page ]
         │
         ▼  (Alt + Q / Pointer Trigger)
[ Owlys Quiz Extension (Client MV3) ]
         │  - High-efficiency OffscreenCanvas compression (JPEG 0.78, max 1280px)
         │  - Zero API keys or model names exposed in client code
         ▼
[ HTTPS POST /api/answer ]
         │
         ▼
[ Owlys Cloudflare Edge Gateway ]
         │  - Identity & Credit Balance verification
         │  - Dynamic model routing (Gemini 3.8 Flash / reasoning workers)
         │  - Strict formatting & anti-hallucination sanitization
         ▼
[ Clean Answer Payload ] -> [ Stealth HUD Overlay ]
```

---

## Installation Guide (Developer Mode)

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/TieuLong07/owlys-quiz.git
   ```
2. Open your Chromium-based browser (Google Chrome, Microsoft Edge, Brave).
3. Navigate to `chrome://extensions` (or `edge://extensions`).
4. Enable **Developer mode** toggle in the top-right corner.
5. Click **Load unpacked** and select the `owlys-quiz` directory.
6. Pin **Owlys Quiz** to your toolbar. Press `Alt + Q` on any supported webpage to test.

---

## Security & Privacy Notice

- **No Third-Party Tracker**: Owlys Quiz contains zero analytical tracking scripts or third-party advertising SDKs.
- **Client-Side Sanitation**: Snapshots are processed in volatile browser memory and sent exclusively over encrypted TLS to the designated Owlys API gateway.
- **Academic Integrity**: This tool is developed for research, workflow automation, and educational evaluation purposes. Users are responsible for complying with the terms of their respective examination platforms and institutions.

---

## Owlys Studio Ecosystem

Owlys Quiz is part of the **Owlys Apps** division:
- **Studio Portal**: [owlys.io.vn](https://owlys.io.vn)
- **Apps Division**: [apps.owlys.io.vn](https://apps.owlys.io.vn)
- **CamLauncher**: High-performance Minecraft launcher built with Go and Wails v2.
- **FormFit**: Client-first automated document formatting engine.

---

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Owlys Studio.
