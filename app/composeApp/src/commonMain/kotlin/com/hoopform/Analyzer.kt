package com.hoopform

import com.hoopform.Geo.angleAt
import com.hoopform.Geo.dist
import kotlin.math.*

/**
 * Real-time shot analyzer: consumes per-frame skeleton + ball position and
 * emits a ShotMetrics + coaching tip each time a shot is detected.
 * Pure Kotlin (KMP commonMain). Original code, Apache-2.0. y grows downward.
 */
class ShotAnalyzer {
    private enum class S { READY, HELD, FLIGHT }

    private var state = S.READY
    private var heldFrames = 0
    private val flight = mutableListOf<Pt>()
    private var akk = ShotMetrics(null, null, null, null, null, false)
    private var stature = 60.0
    private var lastBallY = Double.NaN

    /** Returns a ShotMetrics+tip when a full shot completes, else null. */
    fun onFrame(landmarks: List<Pt>, ball: Pt?, ballVisible: Boolean): ShotMetrics? {
        if (landmarks.size <= LM.ANKLE) return null
        val head = landmarks[LM.HEAD]; val sh = landmarks[LM.SHOULDER]
        val el = landmarks[LM.ELBOW]; val wr = landmarks[LM.WRIST]
        val hip = landmarks[LM.HIP]; val kn = landmarks[LM.KNEE]
        val an = landmarks[LM.ANKLE]

        val statureN = dist(kn, an)
        if (statureN > 1.0) stature = statureN
        val eElbow = angleAt(sh, el, wr)
        val eKnee = angleAt(hip, kn, an)
        val relHeight = (head.y - wr.y) / stature
        val alignErr = abs(sh.x - an.x) / stature

        akk = akk.copy(kneeMin = minOf(akk.kneeMin ?: eKnee, eKnee),
                       elbowSet = minOf(akk.elbowSet ?: eElbow, eElbow),
                       relHeight = relHeight, alignErr = alignErr)

        val d = if (ballVisible && ball != null) dist(ball, wr) / stature else 9.0
        val vy = if (ballVisible && ball != null && !lastBallY.isNaN()) ball.y - lastBallY else 0.0
        if (ballVisible && ball != null) lastBallY = ball.y

        when (state) {
            S.READY, S.HELD -> {
                if (ballVisible && ball != null && d < 0.6) {
                    if (state == S.READY) {           // shot starts: reset accumulators
                        akk = ShotMetrics(null, null, null, relHeight, alignErr, false)
                        flight.clear()
                    }
                    state = S.HELD; heldFrames++
                } else if (state == S.HELD && heldFrames >= 6 && ballVisible && ball != null
                           && d > 0.7 && vy < -2) {
                    state = S.FLIGHT; flight.clear(); lastBallY = Double.NaN
                } else if (!ballVisible) heldFrames = 0
            }
            S.FLIGHT -> {
                if (ball != null) flight.add(ball)
                if (flight.size >= 10 && flight.last().y - flight.first().y > 12) {
                    val p0 = flight[0]; val p1 = flight[1]
                    val dx = p1.x - p0.x; val dy = p1.y - p0.y
                    if (hypot(dx, dy) > 1.0) {
                        val releaseAngle = round(Math.toDegrees(atan2(-dy, dx)))
                        val m = akk.copy(releaseAngle = releaseAngle,
                                         followThrough = eElbow >= 150)
                        state = S.READY; heldFrames = 0; flight.clear(); lastBallY = Double.NaN
                        return m
                    }
                }
            }
        }
        return null
    }
}
