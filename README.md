# HOOPFORM 🏀 — On-Device Basketball Shooting Coach

Watch the shooter on a single camera → compute form metrics → speak **one** correction at a time.
**100% offline · privacy-first · no cloud · no account.**

Built by Krishav (mentored by Kaaval). This repo currently contains the **full build spec** —
a complete, implementable design for the app.

## What it does
- Stands ~3–5 m away with a laptop webcam or phone. HOOPFORM detects each shot, computes
  angles/metrics, and suggests **one improvement at a time** ("Bend your knees more.",
  "Tuck your elbow to ninety degrees.").
- Tracks: set-point elbow angle, release elbow extension, knee bend, launch angle, release
  height, follow-through, shoulder/ankle alignment, kinetic-chain timing, arc + make-guess.

## Open-source, with proper credits
Every dependency is open-source and named with its license (full list in the spec's CREDITS.md):

| Component | License |
|---|---|
| MediaPipe Pose Landmarker | Apache-2.0 |
| OpenCV | Apache-2.0 |
| numpy / scipy | BSD-3-Clause |
| pyttsx3 (offline TTS) | MPL-2.0 |
| pytest | MIT |
| (opt) Ultralytics YOLO11n ball detect | AGPL-3.0 (separate build) |

**We do NOT copy proprietary apps** — no HomeCourt/Nike UI, formulas, gamification, weights,
or presentation methods; no ShotTracker/94Fifty sensor schemes; no unlicensed code.

## Files
- `HOOPFORM_SPEC.md` — the complete build spec (architecture, modules, metrics, code sketches,
  test plan, LICENSE header + CREDITS.md sample)

## Status
- ✅ Build spec v1.0 complete (Ox Alpha, reviewed by Kaaval)
- ⬜ Implementation (MediaPipe + OpenCV app) — next

Built for anyone who wants to shoot better. Original code, transistor-honest licensing.
