package com.hoopform

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/** Compose UI shell for HOOPFORM. Wires CameraFeed -> ShotAnalyzer -> coach tip. */
@Composable
fun App() {
    MaterialTheme(colorScheme = lightColorScheme(
        primary = Color(0xFF0EA5A0), secondary = Color(0xFFFF7043))) {
        val scope = rememberCoroutineScope()
        val speaker = remember { Speaker() }
        val analyzer = remember { ShotAnalyzer() }
        var running by remember { mutableStateOf(false) }
        var tip by remember { mutableStateOf("Start the camera and take a shot.") }
        var lastShot by remember { mutableStateOf<ShotMetrics?>(null) }
        var poseOverlay by remember { mutableStateOf<List<Landmark>?>(null) }

        val feed = remember {
            CameraFeed().also { feed ->
                feed.start(onFrame = { frame ->
                    poseOverlay = frame.landmarks
                    analyzer.onFrame(frame.landmarks.map { Landmark(it.x, it.y) },
                                     frame.ball?.let { Landmark(it.x, it.y) },
                                     frame.ballVisible)?.let { m ->
                        lastShot = m
                        decideTip(m)?.let { msg -> tip = msg; scope.launch { speaker.speak(msg) } }
                    }
                }, onError = { tip = "Camera error: $it" })
            }
        }

        DisposableEffect(Unit) { onDispose { feed.stop() } }

        Column(Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🏀 HOOPFORM", fontSize = 22.sp, fontWeight = FontWeight.Bold,
                 color = Color(0xFF1C2430))
            Text("On-device shooting coach · no cloud", fontSize = 11.sp,
                 color = Color(0xFF7A8A9A))
            Spacer(Modifier.height(8.dp))

            // camera preview placeholder (platform camera view renders behind)
            Box(Modifier.fillMaxWidth().aspectRatio(9f / 16f)
                    .background(Color(0xFF000000)).padding(4.dp),
                contentAlignment = Alignment.Center) {
                poseOverlay?.let { lms ->
                    Canvas(Modifier.fillMaxSize()) {
                        val w = size.width; val h = size.height
                        val stroke = androidx.compose.ui.graphics.Paint().apply { color = Color(0xFF0EA5A0); strokeWidth = 4f }
                        lms.forEachIndexed { i, p ->
                            if (i == 0) path.moveTo(p.x * w, p.y * h) else path.lineTo(p.x * w, p.y * h)
                        }
                    }
                } ?: Text("Camera starting…", color = Color.White)
            }
            Spacer(Modifier.height(12.dp))

            TipCard(tip)

            lastShot?.let { m -> MetricsCard(m) }

            Spacer(Modifier.height(12.dp))
            Button(onClick = { running = !running },
                   colors = ButtonDefaults.buttonColors(containerColor =
                       if (running) Color(0xFFFF7043) else Color(0xFF0EA5A0))) {
                Text(if (running) "⏸ Pause" else "▶ Start Camera")
            }
            Text("Stand 3–5 m back, side-on, right hand. Take a shot!", fontSize = 12.sp,
                 color = Color(0xFF7A8A9A))
        }
    }
}

@Composable
private fun TipCard(text: String) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(
        containerColor = Color(0xFFF4F7F9))) {
        Text("🗣️  $text", Modifier.padding(14.dp), fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun MetricsCard(m: ShotMetrics) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Release", fontWeight = FontWeight.Bold, fontSize = 13.sp)
            Text(m.releaseAngle?.let { "${it.roundTo()}°" } ?: "—", fontWeight = FontWeight.Bold)
        }
        Row(Modifier.padding(horizontal = 12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Elbow set", fontSize = 12.sp)
            Text(m.elbowSet?.let { "${it.roundTo()}°" } ?: "—")
        }
        Row(Modifier.padding(horizontal = 12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Knee dip", fontSize = 12.sp)
            Text(m.kneeMin?.let { "${it.roundTo()}°" } ?: "—")
        }
        Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Alignment", fontSize = 12.sp)
            Text(m.alignErr?.let { it.round(2).toString() } ?: "—")
        }
    }
}

private fun Double.roundTo(): Int = kotlin.math.round(this).toInt()
private fun Double.round(d: Int): Double {
    val f = (10.0).pow(d.toDouble()); return kotlin.math.round(this * f) / f
}
private fun Double.pow(x: Double): Double = kotlin.math.pow(this, x)
