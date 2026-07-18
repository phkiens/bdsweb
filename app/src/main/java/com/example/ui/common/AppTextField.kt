package com.example.ui.common

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.TextRange
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.filled.KeyboardHide
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.unit.dp

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable (() -> Unit)? = null,
    placeholder: @Composable (() -> Unit)? = null,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    prefix: @Composable (() -> Unit)? = null,
    suffix: @Composable (() -> Unit)? = null,
    supportingText: @Composable (() -> Unit)? = null,
    textStyle: TextStyle = LocalTextStyle.current,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default,
    keyboardActions: androidx.compose.foundation.text.KeyboardActions = androidx.compose.foundation.text.KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
    interactionSource: MutableInteractionSource? = null,
    shape: Shape = OutlinedTextFieldDefaults.shape,
    colors: TextFieldColors = OutlinedTextFieldDefaults.colors(),
    enabled: Boolean = true,
    readOnly: Boolean = false,
    allowPaste: Boolean = true,
    allowClear: Boolean = true
) {
    val clipboardManager = LocalClipboardManager.current
    val focusManager = LocalFocusManager.current
    val effectiveInteractionSource = interactionSource ?: remember { MutableInteractionSource() }
    val isFocused by effectiveInteractionSource.collectIsFocusedAsState()

    val smartTrailingIcon: @Composable (() -> Unit)? = if (enabled && !readOnly) {
        {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isFocused) {
                    IconButton(onClick = { focusManager.clearFocus() }) {
                        Icon(
                            imageVector = Icons.Default.KeyboardHide,
                            contentDescription = "Ẩn bàn phím",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                }
                if (value.isNotEmpty() && allowClear) {
                    IconButton(onClick = { onValueChange("") }) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Xóa"
                        )
                    }
                } else if (value.isEmpty() && allowPaste) {
                    IconButton(onClick = {
                        val text = clipboardManager.getText()?.text ?: ""
                        if (text.isNotEmpty()) {
                            onValueChange(text)
                        }
                    }) {
                        Icon(
                            imageVector = Icons.Default.ContentPaste,
                            contentDescription = "Dán"
                        )
                    }
                }
                trailingIcon?.invoke()
            }
        }
    } else {
        trailingIcon
    }

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = label,
        placeholder = placeholder,
        leadingIcon = leadingIcon,
        trailingIcon = smartTrailingIcon,
        prefix = prefix,
        suffix = suffix,
        supportingText = supportingText,
        textStyle = textStyle,
        isError = isError,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        maxLines = maxLines,
        minLines = minLines,
        interactionSource = effectiveInteractionSource,
        shape = shape,
        colors = colors,
        enabled = enabled,
        readOnly = readOnly
    )
}

@Composable
fun AppTextField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable (() -> Unit)? = null,
    placeholder: @Composable (() -> Unit)? = null,
    leadingIcon: @Composable (() -> Unit)? = null,
    trailingIcon: @Composable (() -> Unit)? = null,
    prefix: @Composable (() -> Unit)? = null,
    suffix: @Composable (() -> Unit)? = null,
    supportingText: @Composable (() -> Unit)? = null,
    textStyle: TextStyle = LocalTextStyle.current,
    isError: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default,
    keyboardActions: androidx.compose.foundation.text.KeyboardActions = androidx.compose.foundation.text.KeyboardActions.Default,
    singleLine: Boolean = false,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    minLines: Int = 1,
    interactionSource: MutableInteractionSource? = null,
    shape: Shape = OutlinedTextFieldDefaults.shape,
    colors: TextFieldColors = OutlinedTextFieldDefaults.colors(),
    enabled: Boolean = true,
    readOnly: Boolean = false,
    allowPaste: Boolean = true,
    allowClear: Boolean = true
) {
    val clipboardManager = LocalClipboardManager.current
    val focusManager = LocalFocusManager.current
    val effectiveInteractionSource = interactionSource ?: remember { MutableInteractionSource() }
    val isFocused by effectiveInteractionSource.collectIsFocusedAsState()

    val smartTrailingIcon: @Composable (() -> Unit)? = if (enabled && !readOnly) {
        {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (isFocused) {
                    IconButton(onClick = { focusManager.clearFocus() }) {
                        Icon(
                            imageVector = Icons.Default.KeyboardHide,
                            contentDescription = "Ẩn bàn phím",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                }
                if (value.text.isNotEmpty() && allowClear) {
                    IconButton(onClick = { onValueChange(TextFieldValue("")) }) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Xóa"
                        )
                    }
                } else if (value.text.isEmpty() && allowPaste) {
                    IconButton(onClick = {
                        val text = clipboardManager.getText()?.text ?: ""
                        if (text.isNotEmpty()) {
                            onValueChange(TextFieldValue(text, TextRange(text.length)))
                        }
                    }) {
                        Icon(
                            imageVector = Icons.Default.ContentPaste,
                            contentDescription = "Dán"
                        )
                    }
                }
                trailingIcon?.invoke()
            }
        }
    } else {
        trailingIcon
    }

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        label = label,
        placeholder = placeholder,
        leadingIcon = leadingIcon,
        trailingIcon = smartTrailingIcon,
        prefix = prefix,
        suffix = suffix,
        supportingText = supportingText,
        textStyle = textStyle,
        isError = isError,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = singleLine,
        maxLines = maxLines,
        minLines = minLines,
        interactionSource = effectiveInteractionSource,
        shape = shape,
        colors = colors,
        enabled = enabled,
        readOnly = readOnly
    )
}
