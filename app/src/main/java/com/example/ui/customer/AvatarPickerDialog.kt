package com.example.ui.customer

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.domain.model.Customer
import com.example.ui.common.showSnackbar

/**
 * Dialog chọn ảnh đại diện cho khách hàng, dùng chung cho CustomerScreen và AddEditCustomerDialog.
 * Gói toàn bộ 3 launcher (chụp ảnh / thư viện / xin quyền camera) + AlertDialog 3 lựa chọn.
 */
@Composable
fun AvatarPickerDialog(
    visible: Boolean,
    editingCustomer: Customer?,
    viewModel: CustomerViewModel,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var tempPhotoUri by remember { mutableStateOf<Uri?>(null) }
    val formAvatarDriveUrl by viewModel.avatarDriveUrl.collectAsStateWithLifecycle()

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri ->
        if (uri != null) {
            editingCustomer?.let { customer ->
                viewModel.uploadAndSetAvatar(context, customer.id, uri, customer)
            }
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && tempPhotoUri != null) {
            editingCustomer?.let { customer ->
                viewModel.uploadAndSetAvatar(context, customer.id, tempPhotoUri!!, customer)
            }
        }
    }

    fun launchCamera() {
        try {
            val tempFile = java.io.File(context.cacheDir, "temp_camera_${System.currentTimeMillis()}.jpg").apply {
                parentFile?.mkdirs()
                createNewFile()
            }
            val providerUri = androidx.core.content.FileProvider.getUriForFile(
                context,
                "${context.packageName}.provider",
                tempFile
            )
            tempPhotoUri = providerUri
            cameraLauncher.launch(providerUri)
        } catch (e: Exception) {
            context.showSnackbar("Không thể mở máy ảnh: ${e.localizedMessage}")
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            launchCamera()
        } else {
            context.showSnackbar("Cần có quyền CAMERA để chụp ảnh đại diện.")
        }
    }

    if (visible && editingCustomer != null) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Chọn ảnh đại diện", fontWeight = FontWeight.Bold) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)
                ) {
                    // Chụp ảnh
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onDismiss()
                                val permissionCheck = androidx.core.content.ContextCompat.checkSelfPermission(
                                    context,
                                    android.Manifest.permission.CAMERA
                                )
                                if (permissionCheck == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                                    launchCamera()
                                } else {
                                    cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
                                }
                            }
                            .padding(vertical = 12.dp, horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(16.dp))
                        Text("Chụp ảnh mới", style = MaterialTheme.typography.bodyLarge)
                    }

                    // Chọn từ thư viện
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onDismiss()
                                imagePickerLauncher.launch("image/*")
                            }
                            .padding(vertical = 12.dp, horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.PhotoLibrary, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(16.dp))
                        Text("Chọn từ thư viện", style = MaterialTheme.typography.bodyLarge)
                    }

                    // Xóa ảnh hiện tại (chỉ khi đã có ảnh Drive)
                    if (!formAvatarDriveUrl.isNullOrBlank()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onDismiss()
                                    viewModel.deleteAvatar(context, editingCustomer)
                                }
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Spacer(modifier = Modifier.width(16.dp))
                            Text("Xóa ảnh hiện tại", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = onDismiss) {
                    Text("Đóng")
                }
            }
        )
    }
}
