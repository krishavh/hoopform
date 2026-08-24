# Basketball Shooting Coach — Open-Source Build Spec (Ox Alpha)

# HOOPFORM — On‑Device, Privacy‑First Basketball Shooting Coach

**Build spec v1.0** · Author: Krishav · Mentor: Kaaval · Single camera (laptop webcam or phone), 100% offline, zero telemetry.

---

## 1. Product & Privacy Posture

A shooter stands ~3–5 m from a side-view camera. The app watches, detects each shot, computes form metrics, and speaks **one** correction at a time. Hard privacy rules enforced in CI:

- No network code anywhere (`grep -rE "requests|urllib|http|socket"` fails build except localhost TTS bindings).
- Video frames exist only in RAM; nothing is recorded unless the user toggles "save clips."
- Session logs are numeric JSONL in `./data/local`, with a one-tap **Delete All Data** button.
- Visible badge in UI: `ON-DEVICE • NO CLOUD • NO ACCOUNT`.

---

## 2. Stack — Every Dependency, Named + Licensed

| Component | Pick | License | Role |
|---|---|---|---|
| Runtime | Python 3.11 | PSF-2.0 | glue |
| Pose | **MediaPipe Pose Landmarker (Tasks API)**, `pose_landmarker_full.task` | Apache-2.0 (code *and* .task weights) | 33 landmarks, image-space + **world landmarks (meters)** |
| Vision primitives | OpenCV ≥4.9 | Apache-2.0 | capture, HSV masking, drawing, KalmanFilter |
| Math | numpy, scipy | BSD-3-Clause both | polyfit arcs, Savitzky–Golay smoothing |
| Ball tracker (default) | **Classical CV**: HSV orange mask + contour + circle fit + Kalman | our code (Apache-2.0) | zero model weight, fastest, cleanest licensing |
| Ball tracker (opt-in, messy gyms) | Ultralytics **YOLO11n** (COCO class 32 "sports ball") | **AGPL-3.0** | ships only in a separate `yolo` build |
| Deep learning (optional, v2 custom models) | PyTorch | BSD-3-Clause | not required for v1 |
| Voice | OS TTS via `pyttsx3` (MPL-2.0 wrapper); fallback `espeak-ng` (GPL-3.0) | see left | offline speech |
| Tests | pytest | MIT | unit/golden suites |
| Font/UI assets | e.g., Inter (OFL-1.1); self-made sounds released CC0 | OFL-1.1 / CC0 | overlay + cues |

**Recommended picks (answering the "best pick" ask):** MediaPipe Pose Landmarker for 2D landmarks + 3D-ish angles — use its **world landmarks** for joint angles (metric-scale, camera-angle-invariant) and image landmarks for overlay/ball association. Ball: start with the OpenCV HSV+Kalman tracker; add YOLO11n only behind an opt-in flag, because AGPL-3.0 makes that build virally licensed (fine for this project, but keep it out of the default Apache artifact). Pin every version + SHA256 of `.task`/`.pt` files in `models/MANIFEST.sha256`.

---

## 3. Legal Hygiene — What We Deliberately DO NOT Copy

Original implementation only. Explicitly avoided:

- **HomeCourt / Nike apps**: their UI layouts, AR overlays, gamification (streak sounds, XP, avatars), scoring/"shot-quality" formulas, tip phrasing, animations, model weights, and any patented real-time-feedback presentation methods.
- **ShotTracker / 94Fifty**: sensor-fusion tracking schemes and hardware concepts (we use one camera, no wearables — a deliberate design-around).
- **Unlicensed GitHub snippets**: any pasted code without a license is "all rights reserved" — banned. All code here is written fresh; thresholds come from public biomechanics literature + our own field tuning, not scraped from closed apps.
- Never decompile/reverse-engineer any commercial APK.

---

## 4. Repo Layout

```
hoopform/
├─ LICENSE  NOTICE  CREDITS.md  README.md  pyproject.toml
├─ models/pose_landmarker_full.task   models/MANIFEST.sha256
├─ src/hoopform/
│  ├─ main.py            # orchestrator loop
│  ├─ capture.py         # camera thread (cv2.VideoCapture, MJPEG)
│  ├─ pose.py            # MediaPipe wrapper + One-Euro smoothing
│  ├─ ball.py            # HSV+Kalman tracker, held/flight states
│  ├─ calib.py           # one-time rim tap + stature scale
│  ├─ metrics.py         # joint angles, heights, timing
│  ├─ release.py         # release-frame FSM + arc fit
│  ├─ coach.py           # rule engine, one-tip policy
│  ├─ voice.py  overlay.py
│  └─ session_log.py     # local JSONL, delete-all
├─ tests/                # unit + golden clips
└─ docs/eval_protocol.md
```

---

## 5. Core Modules — Code Sketches

### 5.1 Geometry utilities (`metrics.py`)

```python
import numpy as np
def angle_at(a, b, c):
    """Interior angle ABC in degrees, vertex at b."""
    u, v = np.array(a) - np.array(b), np.array(c) - np.array(b)
    return np.degrees(np.arccos(np.clip(u @ v /
        (np.linalg.norm(u) * np.linalg.norm(v)), -1, 1)))
```

### 5.2 Pose wrapper (`pose.py`) — world landmarks for angles

```python
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
opts = vision.PoseLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path="models/pose_landmarker_full.task"),
    running_mode=vision.RunningMode.VIDEO,
    num_poses=1, min_pose_detection_confidence=0.6)
lm = vision.PoseLandmarker.create_from_options(opts)
def step(frame_bgr, ts_ms):
    rgb = __import__("cv2").cvtColor(frame_bgr, __import__("cv2").COLOR_BGR2RGB)
    res = lm.detect_for_image(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts_ms)
    return res.pose_landmarks[0], res.pose_world_landmarks[0]  # 33 pts each
```

Smooth image landmarks with a One-Euro filter (published algorithm; implement ~30 lines, cite DOI in header comment).

### 5.3 Ball tracker (`ball.py`)

HSV mask (orange: H≈5–25, S>90, V>80, tunable per gym via calibration slider) → largest contour → minEnclosingCircle → reject radius outliers → `cv2.KalmanFilter(4,2)` constant-velocity model → sub-frame centers. Held-vs-flight decided jointly with wrists (below).

### 5.4 Key metrics (side view, shooting side = right)

| Metric | Formula (world landmarks unless noted) | Target band (tunable) |
|---|---|---|
| Set-point elbow | `angle_at(R_SHOULDER, R_ELBOW, R_WRIST)` at load bottom | 85–100° |
| Release elbow extension | same at t_release | ≥155° |
| Knee bend at set point | `angle_at(R_HIP, R_KNEE, R_ANKLE)` minimum during load | ≤135° dip |
| Release (launch) angle | atan2 of ball velocity at t_release (image-plane, gravity-corrected) | 48–55° |
| Release height | `(head_top_y − wrist_y) / stature_px` (image lm) | ≥ 0 (at/above head) |
| Follow-through | wrist stays extended ≥300 ms; forearm 80–100° from horizontal at t_release+5f | pass/fail |
| Alignment | \|R_shoulder_x − R_ankle_x\| / stature at set point (image lm) | ≤0.15 |
| Kinetic-chain timing | knee-max-extension timestamp vs release | knees finish extending ≤80 ms before release |

### 5.5 Release frame + arc (`release.py`)

FSM: `HELD → LOADING → RELEASED → FLIGHT → DONE`.

```python
# d = ||ball - wrist|| / stature ; vy = ball vertical vel (px/frame, up = negative)
if state == HELD and d < 0.35: state = HELD
elif d > 0.45 and vy < -0.02 for 2 consecutive frames:
    t_release = t - 1; state = FLIGHT
# FLIGHT: collect >=8 centers, fit y = ax^2+bx+c (np.polyfit deg 2)
# accept if R^2 >= 0.98; launch_angle = degrees(arctan(-(2a*x0+b))) at t_release
# apex = -b/(2a); if rim calibrated: entry_angle = slope at rim_x on descent;
# make_guess = crosses rim_y downward within [rim_x0, rim_x1]
```

Rim calibration (`calib.py`): freeze frame, user taps rim front/back → store rim line; stature = median ankle-to-head pixel length over last 30 frames.

### 5.6 Coach engine (`coach.py`) — ONE change at a time

```python
RULES = [  # priority order; each returns (violated: bool, severity: float)
 Rule("knees", 1, lambda m: m.knee_min > 135, "Bend your knees more."),
 Rule("elbow", 2, lambda m: m.elbow_set > 105, "Tuck your elbow to ninety degrees."),
 Rule("align", 3, lambda m: m.align_err > 0.15, "Line your shoulder over your knee."),
 Rule("height",4, lambda m: m.rel_height < 0, "Release the ball above your eyes."),
 Rule("follow",5, lambda m: not m.follow_through, "Hold your follow-through."),
]
# Policy: rank violations by (priority, severity); require streak>=2 shots on the
# same rule before speaking; 10 s voice cooldown; never two new tips back-to-back;
# reinforce success after 3 clean shots ("Nice — that knee bend looked great.").
```

Voice phrases are original, short (<2 s), friendly; visual overlay mirrors the same single tip in a bottom banner, plus skeleton, ball trail, dashed fitted arc, and a last-shot card (launch angle, knee dip, release height). Tips rotate only after the targeted metric improves for 3 shots.

---

## 6. LICENSE Header + CREDITS.md

Every source file starts with:

```python
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2025 Krishav <contact>. Mentor review: Kaaval.
# HOOPFORM — on-device, privacy-first shooting coach. No cloud, no telemetry.
# Licensed under Apache-2.0; see LICENSE and CREDITS.md for dependencies.
```

Project license: **Apache-2.0** (with `NOTICE`). The optional YOLO11 build is distributed separately under **AGPL-3.0** compliance notes — never mixed into the default artifact.

Sample `CREDITS.md`:

```markdown
# CREDITS & THIRD-PARTY LICENSES
HOOPFORM is original code by Krishav (mentored by Kaaval), Apache-2.0.
It depends on these open-source projects — thank you!

| Component | Version | License | Source | Used for |
|---|---|---|---|---|
| MediaPipe + pose_landmarker_full.task | 0.10.x | Apache-2.0 | github.com/google-ai-edge/mediapipe | pose landmarks |
| OpenCV | 4.9+ | Apache-2.0 | opencv.org | capture, tracking, overlay |
| numpy / scipy | pinned | BSD-3-Clause | numpy.org, scipy.org | math, filtering |
| pyttsx3 | pinned | MPL-2.0 | pypi | offline TTS wrapper (OS voices) |
| pytest | pinned | MIT | pytest.org | tests |
| Inter font | pinned | SIL OFL-1.1 | rsms.me/inter | overlay text |
| (opt) Ultralytics YOLO11n | pinned | AGPL-3.0 | github.com/ultralytics/ultralytics | ball detect (separate build) |

Full license texts ship in LICENSES/. Model files: SHA256 in models/MANIFEST.sha256.
```

---

## 7. Test Plan & Evaluation

**Unit tests (pytest):** synthetic skeletons with known geometry → angles within ±1°; synthetic noisy parabolas → release detector precision/recall ≥0.95; rule-engine golden cases (each rule fires alone, priority ordering, streak/cooldown behavior); JSONL logger round-trip; "no-network" static check.

**Golden-clip suite:** 30 side-view clips, 5 shooters, human-labeled release frames (`tools/label_golden_clips.py`). Targets: release-frame MAE ≤2 frames, F1 ≥0.90; arc-fit acceptance R² ≥0.98 on ≥90% of real shots.

**Latency budget:** ≥24 fps end-to-end on
