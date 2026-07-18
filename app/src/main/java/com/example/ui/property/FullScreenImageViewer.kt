package com.example.ui.property

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Composable
fun FullScreenImageViewer(
    imagePaths: List<String>,
    initialIndex: Int,
    onDismiss: () -> Unit,
    onSetAsAvatar: (Int) -> Unit
) {
    var isVisible by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        isVisible = true
    }

    fun animateAndDismiss() {
        isVisible = false
        scope.launch {
            delay(250)
            onDismiss()
        }
    }

    Dialog(
        onDismissRequest = { animateAndDismiss() },
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false
        )
    ) {
        AnimatedVisibility(
            visible = isVisible,
            enter = fadeIn(animationSpec = tween(300)) + scaleIn(initialScale = 0.8f, animationSpec = tween(300)),
            exit = fadeOut(animationSpec = tween(250)) + scaleOut(targetScale = 0.8f, animationSpec = tween(250))
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            ) {
                val screenHeight = constraints.maxHeight.toFloat()
                val density = LocalDensity.current
                val dismissThreshold = with(density) { 150.dp.toPx() }

                val animOffsetY = remember { Animatable(0f) }
                var activeImageScale by remember { mutableStateOf(1f) }
                val isZoomed = activeImageScale > 1.05f

                val backgroundAlpha = (1f - (animOffsetY.value / 600f)).coerceIn(0f, 1f)
                val currentUIScale = (1f - (animOffsetY.value / 3000f)).coerceIn(0.8f, 1f)

                // Background container with dynamic alpha and gestures
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = backgroundAlpha))
                        .pointerInput(isZoomed) {
                            if (!isZoomed) {
                                detectDragGestures(
                                    onDrag = { change, dragAmount ->
                                        if (dragAmount.y > 0 || animOffsetY.value > 0f) {
                                            change.consume()
                                            scope.launch {
                                                animOffsetY.snapTo((animOffsetY.value + dragAmount.y).coerceAtLeast(0f))
                                            }
                                        }
                                    },
                                    onDragEnd = {
                                        if (animOffsetY.value > dismissThreshold) {
                                            scope.launch {
                                                animOffsetY.animateTo(screenHeight, spring())
                                                onDismiss()
                                            }
                                        } else {
                                            scope.launch {
                                                animOffsetY.animateTo(0f, spring(dampingRatio = 0.7f))
                                            }
                                        }
                                    },
                                    onDragCancel = {
                                        scope.launch {
                                            animOffsetY.animateTo(0f, spring(dampingRatio = 0.7f))
                                        }
                                    }
                                )
                            }
                        }
                        .offset { IntOffset(0, animOffsetY.value.roundToInt()) }
                        .graphicsLayer {
                            scaleX = currentUIScale
                            scaleY = currentUIScale
                        }
                ) {
                    val pagerState = rememberPagerState(
                        initialPage = initialIndex,
                        pageCount = { imagePaths.size }
                    )

                    // Track page changes to reset scale of ZoomableImage
                    LaunchedEffect(pagerState.currentPage) {
                        activeImageScale = 1f
                    }

                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                        userScrollEnabled = !isZoomed // Disable pager swipe when zoomed in
                    ) { page ->
                        val path = imagePaths[page]
                        ZoomableImage(
                            imagePath = path,
                            modifier = Modifier.fillMaxSize(),
                            onScaleChanged = { scale ->
                                if (page == pagerState.currentPage) {
                                    activeImageScale = scale
                                }
                            }
                        )
                    }

                    // Close button and page counter
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.TopCenter)
                            .statusBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "${pagerState.currentPage + 1} / ${imagePaths.size}",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White
                        )

                        IconButton(
                            onClick = { animateAndDismiss() },
                            colors = IconButtonDefaults.iconButtonColors(
                                containerColor = Color.Black.copy(alpha = 0.5f),
                                contentColor = Color.White
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Đóng"
                            )
                        }
                    }

                    // Bottom Row for Avatar Actions & Swipe Down Hint
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .align(Alignment.BottomCenter)
                            .padding(
                                start = 16.dp,
                                end = 16.dp,
                                top = 16.dp,
                                bottom = 32.dp  // tăng lên để tránh navigation bar
                            ),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val isAvatar = pagerState.currentPage == 0
                        if (isAvatar) {
                            Button(
                                onClick = {},
                                enabled = false,
                                colors = ButtonDefaults.buttonColors(
                                    disabledContainerColor = Color.DarkGray.copy(alpha = 0.5f),
                                    disabledContentColor = Color(0xFFFFD700) // Gold
                                ),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = "⭐ Đang là đại diện",
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }
                        } else {
                            OutlinedButton(
                                onClick = {
                                    onSetAsAvatar(pagerState.currentPage)
                                },
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = Color.White
                                ),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.7f)),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                Text(
                                    text = "☆ Đặt làm đại diện",
                                    style = MaterialTheme.typography.labelLarge
                                )
                            }
                        }

                        // Swipe-down indicator hint
                        Text(
                            text = "Vuốt xuống để thoát",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        }
    }
}
