# HOOPFORM 🏀 — On-Device Basketball Shooting Coach

Watch the shooter on a single camera → compute form metrics → speak **one** correction at a time.
**100% offline · privacy-first · no cloud · no account.**

Built by Krishav (mentored by Kaaval).

## ✅ Web app (working) — `web/`
A fully functional browser app: **MediaPipe Pose Landmarker** (on-device, in your browser) +
**real-time ball tracking (color/centroid)** + the HOOPFORM metrics table + the one-correction coach.

- **Live now:** serve the `web/` folder and open `index.html`
- How to run:
  ```bash
  cd web && python3 -m http.server 8771
  # open https://localhost:8771  (needs webcam permission; use http://<lan-ip>:8771 on a phone)
  ```
  > Camera apps need a secure context — on `localhost` it works; on a LAN IP use a phone/another page; or host via the Cloudflare tunnel.
- **Stack (all open-source, credited):** MediaPipe Pose Landmarker (Apache-2.0), browser Canvas CV (original), Web Speech for voice (original). No frameworks, no cloud, no tracking.

## Build spec (full mobile plan) — `HOOPFORM_SPEC.md`
The complete Android/iOS implementation spec: KMP or Flutter layout, module design, metrics formulas,
release FSM, coach rule engine, LICENSE headers + CREDITS table, test plan.

## Open-source, with credits
Every dependency open-source + licensed (full in spec):

| Component | License |
|---|---|
| MediaPipe Pose Landmarker | Apache-2.0 |
| numpy / scipy (native build) | BSD-3-Clause |
| pyttsx3 / OS TTS (native) | MPL-2.0 |
| (opt) YOLO11n ball detect | AGPL-3.0 (separate) |

**We do NOT copy proprietary apps** — no HomeCourt/Nike UI, formulas, gamification, weights, or
presentation methods; no ShotTracker/94Fifty sensor schemes; no unlicensed code.

## Status
- ✅ Build spec v1.0 (Ox Alpha, reviewed by Kaaval)
- ✅ **Web app working** (`web/`)
- ⬜ Android/iOS native build (coming next)

Original code, transistor-honest licensing. Built to make you shoot better.
