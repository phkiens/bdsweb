package com.example.ui.common

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag

@Composable
fun PermissionRationaleDialog(
    title: String,
    message: String,
    icon: ImageVector,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = title)
        },
        text = {
            Text(text = message)
        },
        icon = {
            Icon(imageVector = icon, contentDescription = null)
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                modifier = androidx.compose.ui.Modifier.testTag("permission_rationale_confirm")
            ) {
                Text("Cho phép")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = androidx.compose.ui.Modifier.testTag("permission_rationale_dismiss")
            ) {
                Text("Hủy")
            }
        }
    )
}

@Composable
fun PermissionSettingsDialog(
    title: String,
    message: String,
    icon: ImageVector,
    context: Context,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = title)
        },
        text = {
            Text(text = message)
        },
        icon = {
            Icon(imageVector = icon, contentDescription = null)
        },
        confirmButton = {
            Button(
                onClick = {
                    onDismiss()
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.fromParts("package", context.packageName, null)
                    }
                    context.startActivity(intent)
                },
                modifier = androidx.compose.ui.Modifier.testTag("permission_settings_confirm")
            ) {
                Text("Mở Cài đặt")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                modifier = androidx.compose.ui.Modifier.testTag("permission_settings_dismiss")
            ) {
                Text("Đóng")
            }
        }
    )
}
