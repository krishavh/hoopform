package com.hoopform

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

/** Android entry point. */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { App() }
    }
}

// Dummy references so the module resolves context-aware pieces (kept minimal;
// CameraX + MediaPipe Android wiring lives in CameraAndroid.kt).
@Suppress("unused")
object AndroidContextHolder { var appContext: Context? = null }
