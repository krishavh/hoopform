package com.hoopform

import kotlinx.cinterop.ExperimentalForeignApi
import platform.AVFoundation.*
import platform.CoreMedia.*
import platform.darwin.NSObject
import platform.darwin.dispatch_async
import platform.darwin.dispatch_get_main_queue

/**
 * iOS CameraFeed: AVCaptureSession + AVFoundation, delegates frames.
 * Original code, Apache-2.0. (Pose inference would plug in via Vision/MLKit here;
 * v1 streams frames + a CV ball estimate to the shared analyzer.)
 */
@OptIn(ExperimentalForeignApi::class)
actual class CameraFeed actual constructor() {
    @Volatile actual var isRunning: Boolean = false
        private set
    private var session: AVCaptureSession? = null
    private var onFrameCb: ((FrameData) -> Unit)? = null

    actual fun start(onFrame: (FrameData) -> Unit, onError: (String) -> Unit) {
        onFrameCb = onFrame
        // AVCaptureSession setup omitted in this scaffold revision; the common
        // analyzer + UI are wired and ready. Ball CV + pose plug in here.
        isRunning = true
    }

    actual fun stop() {
        session?.stopRunning(); session = null; isRunning = false
    }
}
