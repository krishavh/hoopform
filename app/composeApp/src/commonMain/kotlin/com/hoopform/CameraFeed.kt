package com.hoopform

/** A frame's detection results: skeleton landmarks + ball estimate (pixels). */
data class FrameData(
    val landmarks: List<Pt>,
    val ball: Pt?,
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
