package com.example.ui.property

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.*
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import java.io.File
import kotlinx.coroutines.launch

@Composable
fun ZoomableImage(
    imagePath: String,
    imageModel: Any? = null,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    onScaleChanged: (Float) -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    val scale = remember { Animatable(1f) }
    val offsetX = remember { Animatable(0f) }
    val offsetY = remember { Animatable(0f) }

    LaunchedEffect(scale.value) {
        onScaleChanged(scale.value)
    }

    BoxWithConstraints(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        val width = constraints.maxWidth.toFloat()
        val height = constraints.maxHeight.toFloat()

        Box(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures(
                        onDoubleTap = { tapOffset ->
                            val targetScale = if (scale.value > 1.1f) 1f else 2.5f
                            scope.launch {
                                scale.animateTo(targetScale, spring())
                            }
                            scope.launch {
                                if (targetScale == 1f) {
                                    offsetX.animateTo(0f, spring())
                                    offsetY.animateTo(0f, spring())
                                } else {
                                    // Zoom towards the tapped position
                                    val maxOffsetX = (width * targetScale - width).coerceAtLeast(0f) / 2f
                                    val maxOffsetY = (height * targetScale - height).coerceAtLeast(0f) / 2f

                                    val desiredOffsetX = (width / 2f - tapOffset.x) * (targetScale - 1f)
                                    val desiredOffsetY = (height / 2f - tapOffset.y) * (targetScale - 1f)

                                    offsetX.animateTo(desiredOffsetX.coerceIn(-maxOffsetX, maxOffsetX), spring())
                                    offsetY.animateTo(desiredOffsetY.coerceIn(-maxOffsetY, maxOffsetY), spring())
                                }
                            }
                        }
                    )
                }
                .pointerInput(Unit) {
                    detectZoomPanGestures(
                        onGesture = { pan, zoom ->
                            scope.launch {
                                val newScale = (scale.value * zoom).coerceIn(1f, 4f)
                                scale.snapTo(newScale)

                                val maxOffsetX = (width * newScale - width).coerceAtLeast(0f) / 2f
                                val maxOffsetY = (height * newScale - height).coerceAtLeast(0f) / 2f

                                val newOffsetX = (offsetX.value + pan.x).coerceIn(-maxOffsetX, maxOffsetX)
                                val newOffsetY = (offsetY.value + pan.y).coerceIn(-maxOffsetY, maxOffsetY)

                                offsetX.snapTo(newOffsetX)
                                offsetY.snapTo(newOffsetY)
                            }
                        },
                        onGestureRelease = {
                            val currentScale = scale.value
                            val maxOffsetX = (width * currentScale - width).coerceAtLeast(0f) / 2f
                            val maxOffsetY = (height * currentScale - height).coerceAtLeast(0f) / 2f

                            val targetOffsetX = offsetX.value.coerceIn(-maxOffsetX, maxOffsetX)
                            val targetOffsetY = offsetY.value.coerceIn(-maxOffsetY, maxOffsetY)

                            scope.launch {
                                offsetX.animateTo(targetOffsetX, spring())
                                offsetY.animateTo(targetOffsetY, spring())
                            }
                        },
                        shouldConsume = {
                            scale.value > 1.05f
                        }
                    )
                }
                .graphicsLayer(
                    scaleX = scale.value,
                    scaleY = scale.value,
                    translationX = offsetX.value,
                    translationY = offsetY.value
                ),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = imageModel ?: File(imagePath),
                contentDescription = contentDescription,
                contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

private suspend fun PointerInputScope.detectZoomPanGestures(
    onGesture: (pan: Offset, zoom: Float) -> Unit,
    onGestureRelease: () -> Unit,
    shouldConsume: () -> Boolean
) {
    awaitEachGesture {
        var zoom = 1f
        var pan = Offset.Zero
        var pastTouchSlop = false
        val touchSlop = viewConfiguration.touchSlop

        awaitFirstDown()
        do {
            val event = awaitPointerEvent()
            val canceled = event.changes.any { it.isConsumed }
            if (!canceled) {
                val zoomChange = event.calculateZoom()
                val panChange = event.calculatePan()

                if (!pastTouchSlop) {
                    zoom *= zoomChange
                    pan += panChange

                    val centroidSize = event.calculateCentroidSize(useCurrent = false)
                    val zoomMotion = kotlin.math.abs(1 - zoom) * centroidSize
                    val panMotion = pan.getDistance()

                    if (zoomMotion > touchSlop || panMotion > touchSlop) {
                        pastTouchSlop = true
                    }
                }

                if (pastTouchSlop) {
                    if (zoomChange != 1f || panChange != Offset.Zero) {
                        onGesture(panChange, zoomChange)
                    }
                    if (shouldConsume() || zoomChange != 1f) {
                        event.changes.forEach {
                            val positionChanged = it.previousPosition != it.position
                            if (positionChanged) {
                                it.consume()
                            }
                        }
                    }
                }
            }
        } while (event.changes.any { it.pressed })
        onGestureRelease()
    }
}
