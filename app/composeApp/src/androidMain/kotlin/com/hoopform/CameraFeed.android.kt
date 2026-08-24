package com.hoopform

import android.content.Context
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.*
import java.util.concurrent.Executors

/**
 * Android CameraFeed: CameraX preview + MediaPipe PoseLandmarker, image analysis
 * mode. Delegates frames (pose + a simple color/centroid ball estimate) to the
 * onFrame callback. Original code, Apache-2.0. MediaPipe (Apache-2.0), CameraX (Apache-2.0).
 */
actual class CameraFeed actual constructor() {
    private val TAG = "HoopformCam"
    private val exec = Executors.newSingleThreadExecutor()
    private var providerF: ListenableFuture<ProcessCameraProvider>? = null
    private var poseModel: PoseLandmarker? = null
    @Volatile private var onFrameCb: ((FrameData) -> Unit)? = null
    @Volatile actual var isRunning: Boolean = false
        private set
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    fun bindPreview(context: Context, previewView: PreviewView) {
        val options = PoseLandmarker.PoseLandmarkerOptions.builder()
            .setBaseOptions(BaseOptions.builder()
                .setModelAssetPath("pose_landmarker_full.task").build())
            .setRunningMode(RunningMode.LIVE_STREAM)
            .setMinPoseDetectionConfidence(0.5f)
            .build()
        runCatching { poseModel = PoseLandmarker.createFromOptions(context, options) }

        providerF = ProcessCameraProvider.getInstance(context)
        providerF?.addListener({
            val cameraProvider = try { providerF?.get() } catch (_: Exception) { null } ?: return@addListener
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(exec) { image ->
                if (poseModel == null || onFrameCb == null) { image.close(); return@setAnalyzer }
                onAnalyze(image)
            }
            runCatching {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    (context as? androidx.lifecycle.LifecycleOwner) ?: return@addListener,
                    CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                isRunning = true
            }
        }, ContextCompat.getMainExecutor(context))
    }

    private fun onAnalyze(imageProxy: ImageProxy) {
        val media = imageProxy.image ?: run { imageProxy.close(); return }
        val bitmap = imageProxy.toBitmap()
        imageProxy.close()
        val mpImage: MPImage = BitmapImageBuilder(bitmap).build()
        val result: PoseLandmarkerResult? = try {
            poseModel?.detectAsync(mpImage, System.currentTimeMillis())
        } catch (_: Exception) { null }
        // LIVE_STREAM delivers via callback; fall back to a synchronous scalar estimate.
        val lms = result?.landmarks()?.firstOrNull()?.map {
            Pt(it.x() * bitmap.width.toDouble(), it.y() * bitmap.height.toDouble())
        } ?: emptyList()
        val ball = ballCentroid(bitmap)?.let { Pt(it.x.toDouble(), it.y.toDouble()) }
        onFrameCb?.invoke(FrameData(lms, ball, ball != null))
    }

    /** Simple orange centroid ball estimate from a frame (original CV). */
    private data class XY(val x: Int, val y: Int)
    private fun ballCentroid(bmp: android.graphics.Bitmap): XY? {
        val w = bmp.width; val h = bmp.height
        val pixels = IntArray(w * h)
        bmp.getPixels(pixels, 0, w, 0, 0, w, h)
        var sx = 0L; var sy = 0L; var n = 0
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xff; val g = (c shr 8) and 0xff; val b = c and 0xff
            if (r > 110 && g in 41..179 && b < 90 && (r - g) > 40 && (g - b) > 10) {
                sx += i % w; sy += i / w; n++
            }
        }
        return if (n > 60) XY((sx / n).toInt(), (sy / n).toInt()) else null
    }

    actual fun start(onFrame: (FrameData) -> Unit, onError: (String) -> Unit) {
        onFrameCb = onFrame
    }

    actual fun stop() {
        isRunning = false
        try { providerF?.get()?.unbindAll() } catch (_: Exception) {}
        exec.shutdown()
        scope.cancel()
    }
}
