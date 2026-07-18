package com.example.ui.common

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

val MaxContentWidth = 600.dp

/**
 * Constrains the maximum width of composables on wide screens (tablets) while
 * allowing them to expand up to the maximum width.
 * 
 * IMPORTANT: widthIn must be called BEFORE fillMaxWidth so that Compose respects
 * the maximum constraint bounds.
 */
fun Modifier.adaptiveContentWidth(): Modifier =
    this.widthIn(max = MaxContentWidth).fillMaxWidth()
