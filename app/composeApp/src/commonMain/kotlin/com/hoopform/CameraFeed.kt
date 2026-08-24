package com.hoopform

import kotlinx.coroutines.flow.StateFlow

/** A single detected landmark in PIXEL coordinates. */
data class Landmark(val x: Double, val y: Double)

/** A frame's detection results: skeleton landmarks + ball estimate. */
data class FrameData(
    val landmarks: List<Landmark>,
    val ball: Landmark?,
    val ballVisible: Boolean,
)

/** Platform camera + pose abstraction (expect / actual per platform). */
expect class CameraFeed() {
    fun start(onFrame: (FrameData) -> Unit, onError: (String) -> Unit)
    fun stop()
    val isRunning: Boolean
}

/** Platform speech output (TTS) for coaching tips. */
expect class Speaker {
    fun speak(text: String)
    fun stop()
}
