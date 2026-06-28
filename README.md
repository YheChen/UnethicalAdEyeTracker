# EyeTrack Ad Demo

A YouTube-style advertisement that **only plays while you are looking at it**. The moment
your gaze drifts away — or you turn your head, or no face is detected — playback pauses and
the ad blurs behind an overlay. Look back at the screen and it resumes.

Everything runs **entirely in your browser**. The webcam feed is processed locally with
[MediaPipe Face Landmarker](https://developers.google.com/mediapipe/solutions/vision/face_landmarker);
no video, images, or gaze data are ever uploaded, recorded, or stored.

> This is a demo exploring attention-aware media. It is deliberately a little dystopian —
> a commentary on engagement-maximizing advertising — and is meant for experimentation, not
> production ad delivery.

---

## How it works

1. **Consent** — A privacy screen explains exactly what the demo does before any camera
   access is requested.
2. **Calibrate** — You look at the centre of the ad and press *Calibrate*. The app captures
   a baseline reading of your iris position and head pose, and scores its stability.
3. **Watch** — A live `requestAnimationFrame` loop tracks your gaze every frame. While you
   are attentive the ad clock advances; when you look away it pauses (after a short grace
   window that naturally absorbs blinks and momentary tracking loss).

### The gaze pipeline

```
webcam <video>  ─▶  MediaPipe FaceLandmarker  ─▶  raw 478 landmarks + transform matrix
      │                                                     │
      │                                          computeGazeMetrics()
      │                                                     ▼
      │                                          GazeMetrics (iris ratios, EAR, head pose)
      │                                                     │
      │                                          MovingAverage smoothing
      │                                                     ▼
      │                                          evaluateGaze(metrics, baseline)
      │                                                     │
      │                                          AttentionGate + grace window
      │                                                     ▼
      └──────────────────────────────────────▶  attentive: boolean  ─▶  play / pause
```

- **Iris ratios** measure where each iris sits horizontally and vertically within the eye
  opening; averaged across both eyes they give a normalized gaze direction.
- **Eye-aspect-ratio (EAR)** detects blinks (lid distance over eye width).
- **Head pose** (yaw / pitch / roll) comes from MediaPipe's facial transformation matrix, so
  turning away counts as looking away even if the eyes stay centred.
- All signals are judged **relative to your calibration baseline**, then smoothed over a few
  frames and gated by a short grace window before flipping play/pause — so the experience
  feels stable rather than twitchy.

---

## Privacy

- Webcam frames are decoded and analysed **on-device, in the browser**.
- **No images or video leave your computer.** There is no backend and no network upload of
  any camera data.
- **Nothing is recorded or saved.**
- Camera access can be revoked at any time via your browser's site permissions, or by
  closing the tab.

The only network requests are for the MediaPipe WebAssembly runtime and the Face Landmarker
model bundle, fetched once from a public CDN.

---

## Tech stack

- **React 18** + **TypeScript** (strict, `isolatedModules`, `noUnusedLocals` /
  `noUnusedParameters`)
- **Vite** for dev server and build
- **Tailwind CSS** with a small set of custom component classes for the dark glassmorphism UI
- **@mediapipe/tasks-vision** Face Landmarker (GPU delegate, CPU fallback)
- **Web Audio API** for an optional, very quiet ambient ad tone (muted by default)

---

## Getting started

### Prerequisites

- Node.js 18+ and a package manager (npm / pnpm / yarn)
- A webcam
- A modern browser with `getUserMedia` and WebAssembly support (recent Chrome, Edge, or
  Firefox recommended; the GPU delegate prefers Chromium-based browsers)

### Install & run

```bash
npm install
npm run dev      # start the Vite dev server
```

Then open the printed local URL (typically `http://localhost:5173`) and click **Start Demo**.

> Camera access requires a **secure context**. `localhost` is treated as secure; if you serve
> the app from another host, use **HTTPS** or the browser will block `getUserMedia`.

### Build & preview

```bash
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build locally
```

---

## Using the demo

1. Click **Start Demo** and **allow** camera access when prompted.
2. Position your face in the preview, look at the centre target, and wait for the quality bar
   to read *Ready* — then press **Calibrate**.
3. Watch the ad. Look away and it pauses; look back and it resumes.
4. Controls and affordances:
   - **Play/pause** reflects your gaze (it is gaze-driven, not clickable).
   - **Mute/unmute**, **fullscreen**, and a **Skip Ad** affordance (enabled after 5s).
   - The right sidebar offers an **Up next** list to switch ads, plus live stats (status,
     confidence, total watch time, FPS).

### Keyboard shortcuts

| Key | Action |
| --- | ------ |
| `c` / `r` | Recalibrate (returns to the calibration step) |

A floating **Debug** panel (bottom-left) exposes live metrics and thresholds for tuning, and
a **Webcam preview** (bottom-right) shows a mirrored feed with a gaze-indicator dot.

---

## Project structure

```
src/
├── types/
│   └── gaze.ts              # shared pipeline types (GazeState, GazeMetrics, …)
├── utils/
│   ├── constants.ts         # all tunable thresholds & MediaPipe asset URLs
│   ├── smoothing.ts         # clamp/lerp helpers + MovingAverage
│   ├── headPose.ts          # transform matrix → yaw/pitch/roll
│   ├── gaze.ts              # landmark math: metrics, evaluation, calibration quality
│   └── timers.ts            # AttentionGate + timing helpers
├── data/
│   └── ads.ts              # self-contained animated mock ad creatives
├── hooks/
│   ├── useWebcam.ts         # shared MediaStream lifecycle
│   ├── useFaceTracking.ts   # MediaPipe load + rAF detection loop
│   ├── useAdClock.ts        # play/pause-able ad clock
│   └── useGazeDetection.ts  # orchestrator → attentive boolean
├── components/
│   ├── StatusBadge.tsx
│   ├── ConfidenceMeter.tsx
│   ├── PrivacyNote.tsx
│   ├── ConsentScreen.tsx
│   ├── PauseOverlay.tsx
│   ├── WebcamPreview.tsx
│   ├── CalibrationPanel.tsx
│   ├── DebugPanel.tsx
│   └── AdPlayer.tsx
├── App.tsx                  # DemoState machine + watch-page layout
├── index.css                # Tailwind layers + custom glass/btn classes
└── main.tsx
```

---

## Configuration & tuning

All thresholds live in [`src/utils/constants.ts`](src/utils/constants.ts) so the experience
can be tuned in one place. Key values:

| Constant | Default | Meaning |
| -------- | ------- | ------- |
| `ATTENTION_GRACE_MS` | `500` | How long you may look away before the ad pauses |
| `BLINK_LEEWAY_MS` | `500` | Blink/tracking-loss tolerance (covered by the grace window) |
| `GAZE_SMOOTHING_WINDOW` | `5` | Frames averaged to damp jitter |
| `MIN_CONFIDENCE` | `0.65` | Confidence required to count as "looking at the ad" |
| `GAZE_RATIO_THRESHOLD_X` | `0.17` | Max horizontal iris drift from baseline |
| `GAZE_RATIO_THRESHOLD_Y` | `0.22` | Max vertical iris drift from baseline |
| `HEAD_YAW_THRESHOLD_DEG` | `24` | Max head turn (left/right) from baseline |
| `HEAD_PITCH_THRESHOLD_DEG` | `18` | Max head tilt (up/down) from baseline |
| `EYE_OPEN_EAR_THRESHOLD` | `0.16` | EAR below which an eye is considered closed |
| `MIN_CALIBRATION_QUALITY` | `0.55` | Minimum stability to accept a calibration |

The live debug panel surfaces the resulting deviation, confidence, head pose, grace
remaining, and FPS so you can see how a change in these values affects behaviour.

---

## Troubleshooting

- **Camera blocked / "denied"** — Check the browser's site permissions and re-allow camera
  access, then use *Try again* / recalibrate. Remember the page must run on `localhost` or
  HTTPS.
- **"No camera found"** — Ensure a webcam is connected and not in use by another app.
- **Tracking failed to load** — The MediaPipe runtime/model is fetched from a CDN; if you are
  offline or the CDN is blocked, a non-blocking banner appears and the page stays usable.
- **Calibration won't accept** — Hold still and stay well-lit and centred until the quality
  bar reads *Ready*; jitter lowers the stability score.
- **Pauses too eagerly / too slowly** — Adjust the thresholds above (notably the gaze ratio,
  head-pose, and grace-window values).

---

## License

Provided as a demonstration. See the repository for license details.
