package com.example.ui.property

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CompassDialog(
    onDismiss: () -> Unit,
    onDirectionSelected: (String) -> Unit
) {
    val context = LocalContext.current
    val sensorManager = remember { context.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    
    var azimuth by remember { mutableStateOf(0f) }
    var hasSensors by remember { mutableStateOf(false) }

    // Sensor listener
    DisposableEffect(Unit) {
        val accel = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val magnet = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
        
        val listener = object : SensorEventListener {
            var gravity: FloatArray? = null
            var geomagnetic: FloatArray? = null
            
            override fun onSensorChanged(event: SensorEvent?) {
                if (event == null) return
                if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                    gravity = event.values
                }
                if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
                    geomagnetic = event.values
                }
                
                if (gravity != null && geomagnetic != null) {
                    val r = FloatArray(9)
                    val i = FloatArray(9)
                    if (SensorManager.getRotationMatrix(r, i, gravity, geomagnetic)) {
                        val orientation = FloatArray(3)
                        SensorManager.getOrientation(r, orientation)
                        val deg = Math.toDegrees(orientation[0].toDouble()).toFloat()
                        azimuth = (deg + 360) % 360
                        hasSensors = true
                    }
                }
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

        if (accel != null && magnet != null) {
            sensorManager.registerListener(listener, accel, SensorManager.SENSOR_DELAY_UI)
            sensorManager.registerListener(listener, magnet, SensorManager.SENSOR_DELAY_UI)
        }

        onDispose {
            sensorManager.unregisterListener(listener)
        }
    }

    // Map degrees to directions
    fun getDirectionFromDegrees(deg: Float): String {
        return when (((deg + 22.5) / 45).roundToInt() % 8) {
            0 -> "Bắc"
            1 -> "Đông Bắc"
            2 -> "Đông"
            3 -> "Đông Nam"
            4 -> "Nam"
            5 -> "Tây Nam"
            6 -> "Tây"
            7 -> "Tây Bắc"
            else -> "Bắc"
        }
    }

    val currentDirectionName = getDirectionFromDegrees(azimuth)
    val animatedAzimuth by animateFloatAsState(targetValue = azimuth, label = "CompassRotation")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "La Bàn Đo Hướng",
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.fillMaxWidth()
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "${azimuth.roundToInt()}° - $currentDirectionName",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                
                // Visual Compass Rose using Canvas
                Box(
                    modifier = Modifier
                        .size(200.dp)
                        .border(2.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(100.dp))
                        .padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    val needleColor = MaterialTheme.colorScheme.error
                    val dialColor = MaterialTheme.colorScheme.onSurface
                    
                    Canvas(modifier = Modifier.fillMaxSize()) {
                        rotate(degrees = -animatedAzimuth) {
                            drawCircle(
                                color = dialColor.copy(alpha = 0.1f),
                                radius = size.minDimension / 2
                            )
                            
                            val centerX = size.width / 2
                            val centerY = size.height / 2
                            
                            // North pointer
                            drawLine(
                                color = needleColor,
                                start = Offset(centerX, centerY),
                                end = Offset(centerX, 20f),
                                strokeWidth = 8f
                            )
                            
                            // South pointer
                            drawLine(
                                color = dialColor.copy(alpha = 0.5f),
                                start = Offset(centerX, centerY),
                                end = Offset(centerX, size.height - 20f),
                                strokeWidth = 8f
                            )
                        }
                        
                        // Static heading indicator
                        drawPolygon(
                            points = listOf(
                                Offset(size.width / 2 - 10f, 10f),
                                Offset(size.width / 2 + 10f, 10f),
                                Offset(size.width / 2, 30f)
                            ),
                            color = needleColor
                        )
                    }
                    
                    Text(
                        text = "🧭",
                        style = MaterialTheme.typography.headlineSmall
                    )
                }

                if (!hasSensors) {
                    Text(
                        text = "Không phát hiện cảm biến la bàn. Di chuyển thanh trượt để giả lập:",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline,
                        modifier = Modifier.padding(horizontal = 8.dp)
                    )
                    
                    Slider(
                        value = azimuth,
                        onValueChange = { azimuth = it },
                        valueRange = 0f..360f,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onDirectionSelected(currentDirectionName) },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
            ) {
                Text("Chọn Hướng Này")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Hủy")
            }
        }
    )
}

fun DrawScope.drawPolygon(
    points: List<Offset>,
    color: Color
) {
    val path = Path().apply {
        if (points.isNotEmpty()) {
            moveTo(points[0].x, points[0].y)
            for (i in 1 until points.size) {
                lineTo(points[i].x, points[i].y)
            }
            close()
        }
    }
    drawPath(path = path, color = color)
}
