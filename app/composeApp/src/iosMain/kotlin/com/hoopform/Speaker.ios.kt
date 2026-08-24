package com.hoopform

import platform.AVFAudio.AVSpeechSynthesizer
import platform.AVFAudio.AVSpeechUtterance
import platform.AVFAudio.AVSpeechSynthesisVoice

/** iOS TTS speaker (system AVSpeechSynthesizer, offline-capable). Apache-2.0. */
actual class Speaker actual constructor() {
    private val synth = AVSpeechSynthesizer()

    actual fun speak(text: String) {
        val u = AVSpeechUtterance.speechUtteranceWithString(text)
        u.voice = AVSpeechSynthesisVoice.speechSynthesisVoiceWithLanguage("en-US")
        synth.speakUtterance(u)
    }
    actual fun stop() { synth.stopSpeakingAtBoundary(0u) }
}
