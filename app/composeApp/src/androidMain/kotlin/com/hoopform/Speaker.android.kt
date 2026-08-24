package com.hoopform

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.speech.tts.TextToSpeech
import android.widget.Toast
import androidx.activity.ComponentActivity
import java.util.Locale

/** Android TTS speaker. Original, Apache-2.0. Uses system speech engine (offline capable). */
actual class Speaker actual constructor() {
    private var tts: TextToSpeech? = null

    fun ready(activity: ComponentActivity) {
        if (tts == null) tts = TextToSpeech(activity) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val r = tts?.setLanguage(Locale("en", "US"))
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Toast.makeText(activity, "TTS lang unavailable", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    actual fun speak(text: String) {
        try { tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hoopform") } catch (_: Exception) {}
    }

    actual fun stop() { tts?.stop() }

    companion object {
        fun hasCameraPermission(activity: ComponentActivity): Boolean =
            if (Build.VERSION.SDK_INT >= 23) {
                activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            } else true
    }
}
