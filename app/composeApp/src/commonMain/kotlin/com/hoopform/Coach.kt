package com.hoopform

import kotlin.math.*

/**
 * HOOPFORM core coach engine — pure Kotlin, platform-agnostic (KMP commonMain).
 * Ported from the web app's proven logic. Original code, Apache-2.0.
 */

/** MediaPipe Pose landmark indices (33 points). */
object LM {
    const val HEAD = 8; const val SHOULDER = 11; const val ELBOW = 13
    const val WRIST = 15; const val HIP = 23; const val KNEE = 25; const val ANKLE = 27
}

/** One analyzed shot's form metrics. */
data class ShotMetrics(
    val releaseAngle: Double?,   // degrees from horizontal
    val elbowSet: Double?,       // elbow deg at set point (min during load)
    val kneeMin: Double?,        // knee deg at deepest dip
    val relHeight: Double?,      // (head_y - wrist_y)/stature, >0 = above head
    val alignErr: Double?,       // |shoulder_x - ankle_x| / stature
    val followThrough: Boolean,  // elbow stayed extended through release
)

data class Rule(val id: String, val ok: (ShotMetrics) -> Boolean, val msg: String)

/** Original, one-line coaching tips (priority order). */
val COACH_RULES: List<Rule> = listOf(
    Rule("knees",  { (it.kneeMin ?: 999.0) <= 135.0 }, "Bend your knees more."),
    Rule("elbow",  { (it.elbowSet ?: 0.0)   <= 105.0 }, "Tuck your elbow to ninety degrees."),
    Rule("align",  { (it.alignErr ?: 9.0)   <= 0.15 },  "Line your shoulder over your foot."),
    Rule("height", { (it.relHeight ?: -9.0) >= 0 },     "Release the ball above your eyes."),
    Rule("follow", { it.followThrough },                 "Hold your follow-through."),
)

/** Geometry helpers (degrees). */
object Geo {
    fun angleAt(a: Pt, b: Pt, c: Pt): Double {
        val u = Pt(a.x - b.x, a.y - b.y)
        val v = Pt(c.x - b.x, c.y - b.y)
        val nu = sqrt(u.x * u.x + u.y * u.y)
        val nv = sqrt(v.x * v.x + v.y * v.y)
        if (nu == 0.0 || nv == 0.0) return 180.0
        val cos = ((u.x * v.x + u.y * v.y) / (nu * nv)).coerceIn(-1.0, 1.0)
        return Math.toDegrees(acos(cos))
    }
    fun dist(a: Pt, b: Pt): Double = sqrt((a.x - b.x).pow(2) + (a.y - b.y).pow(2))
}

/** Per-shot coach decision: pick the highest-priority violated rule (or null). */
fun decideTip(m: ShotMetrics): String? {
    for (r in COACH_RULES) if (!r.ok(m)) return r.msg
    return null
}
