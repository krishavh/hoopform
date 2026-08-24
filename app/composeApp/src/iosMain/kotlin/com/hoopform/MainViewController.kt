package com.hoopform

import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController

/** iOS Compose entry point. */
fun MainViewController(): UIViewController = ComposeUIViewController { App() }
