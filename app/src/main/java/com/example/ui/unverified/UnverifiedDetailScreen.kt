package com.example.ui.unverified

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.example.ui.common.adaptiveContentWidth
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.UnverifiedPropertyType
import com.example.domain.model.ExtractionType
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import java.io.File
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UnverifiedDetailScreen(
    viewModel: UnverifiedViewModel,
    unverifiedId: String,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: (String, Boolean) -> Unit,
    modifier: Modifier = Modifier
) {
    val propertyFlow = remember(unverifiedId) { viewModel.getById(unverifiedId) }
    val itemState by propertyFlow.collectAsStateWithLifecycle(initialValue = null)
    val context = LocalContext.current
    var phoneDialogNumber by remember { mutableStateOf<String?>(null) }
    var showDeleteConfirmation by remember { mutableStateOf(false) }

    val syncState by viewModel.syncState.collectAsStateWithLifecycle()
    LaunchedEffect(syncState) {
        when (syncState) {
            is SyncUiState.Success -> {
                context.showSnackbar((syncState as SyncUiState.Success).message)
                viewModel.resetSyncState()
            }
            is SyncUiState.Error -> {
                context.showSnackbar((syncState as SyncUiState.Error).message)
                viewModel.resetSyncState()
            }
            else -> {}
        }
    }

    val mediaDownloadState by viewModel.mediaDownloadState.collectAsStateWithLifecycle()
    LaunchedEffect(mediaDownloadState) {
        when (mediaDownloadState) {
            is MediaDownloadUiState.Success -> {
                val count = (mediaDownloadState as MediaDownloadUiState.Success).count
                if (count > 0) {
                    context.showSnackbar("Đã tải $count ảnh về máy")
                } else {
                    context.showSnackbar("Không có ảnh cần tải")
                }
                viewModel.resetMediaDownloadState()
            }
            is MediaDownloadUiState.Error -> {
                context.showSnackbar((mediaDownloadState as MediaDownloadUiState.Error).message)
                viewModel.resetMediaDownloadState()
            }
            else -> {}
        }
    }

    val driveToken by produceState<String>("", viewModel) {
        value = viewModel.getValidToken()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = itemState?.address ?: "Chi tiết BĐS thô",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Quay lại")
                    }
                },
                actions = {
                    // Single Backup Action
                    IconButton(
                        onClick = { viewModel.syncSingleUnverified(unverifiedId) },
                        enabled = syncState !is SyncUiState.Loading,
                        modifier = Modifier.testTag("backup_unverified_button")
                    ) {
                        if (syncState is SyncUiState.Loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.CloudUpload,
                                contentDescription = "Sao lưu lên Google Drive"
                            )
                        }
                    }
                    // Single Download Media Action
                    IconButton(
                        onClick = { viewModel.downloadUnverifiedImages(unverifiedId) },
                        enabled = mediaDownloadState !is MediaDownloadUiState.Loading,
                        modifier = Modifier.testTag("download_unverified_media_button")
                    ) {
                        if (mediaDownloadState is MediaDownloadUiState.Loading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.CloudDownload,
                                contentDescription = "Tải ảnh về máy"
                            )
                        }
                    }
                    IconButton(onClick = { onNavigateToEdit(unverifiedId, false) }) {
                        Icon(Icons.Default.Edit, contentDescription = "Chỉnh sửa")
                    }
                    IconButton(onClick = { onNavigateToEdit(unverifiedId, true) }) {
                        Icon(Icons.Default.VerifiedUser, contentDescription = "Xác thực", tint = MaterialTheme.colorScheme.primary)
                    }
                    IconButton(onClick = { showDeleteConfirmation = true }) {
                        Icon(Icons.Default.Delete, contentDescription = "Xóa", tint = MaterialTheme.colorScheme.error)
                    }
                }
            )
        },
        modifier = modifier
    ) { innerPadding ->
        val item = itemState
        if (item == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
            val priceVal = (item.price as? Number)?.toDouble() ?: 0.0
            val formattedPrice = if (priceVal > 0.0) {
                if (priceVal >= 1.0) "${formatter.format(priceVal)} tỷ"
                else "${formatter.format(priceVal * 1000)} triệu"
            } else {
                "Thỏa thuận"
            }

            val areaVal = (item.area as? Number)?.toDouble() ?: 0.0
            val formattedArea = if (areaVal > 0.0) "${formatter.format(areaVal)} m²" else "Chưa xác định"

            val zippedImages = remember(item.mediaPaths, item.driveMediaIds) {
                val maxLen = maxOf(item.mediaPaths.size, item.driveMediaIds.size)
                (0 until maxLen).map { idx ->
                    val localPath = item.mediaPaths.getOrNull(idx) ?: ""
                    val driveId = item.driveMediaIds.getOrNull(idx) ?: ""
                    Pair(localPath, driveId)
                }.filter { it.first.isNotBlank() || it.second.isNotBlank() }
            }
            val imageCount = zippedImages.size

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.TopCenter
            ) {
                LazyColumn(
                    modifier = Modifier
                        .adaptiveContentWidth()
                        .fillMaxHeight(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    if (imageCount > 0) {
                        item {
                        Text(
                            text = "Hình ảnh thực tế ($imageCount)",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(imageCount) { i ->
                                val pair = zippedImages[i]
                                val localPath = pair.first
                                val driveId = pair.second
                                
                                val imageModel = remember(driveId, localPath, item.id, driveToken) {
                                    val conventionFile = if (driveId.isNotBlank()) {
                                        File("${context.filesDir.absolutePath}/media/unverified/unv_${item.id}_${driveId}.jpg")
                                    } else null
                                    val legacyLocal = if (localPath.isNotBlank()) File(localPath) else null
                                    when {
                                        conventionFile != null && conventionFile.exists() -> conventionFile
                                        legacyLocal != null && legacyLocal.exists() -> legacyLocal
                                        driveId.isNotBlank() -> {
                                            if (driveToken.isNotBlank()) {
                                                coil.request.ImageRequest.Builder(context)
                                                    .data("https://www.googleapis.com/drive/v3/files/$driveId?alt=media")
                                                    .addHeader("Authorization", "Bearer $driveToken")
                                                    .crossfade(true)
                                                    .build()
                                            } else {
                                                "https://drive.google.com/thumbnail?sz=w400&id=$driveId"
                                            }
                                        }
                                        else -> null
                                    }
                                }
                                Card(
                                    modifier = Modifier
                                        .size(120.dp)
                                        .clip(RoundedCornerShape(8.dp)),
                                    elevation = CardDefaults.cardElevation(2.dp)
                                ) {
                                    if (imageModel != null) {
                                        AsyncImage(
                                            model = imageModel,
                                            contentDescription = "Property Image",
                                            contentScale = ContentScale.Crop,
                                            modifier = Modifier.fillMaxSize()
                                        )
                                    } else {
                                        Box(
                                            modifier = Modifier
                                                .fillMaxSize()
                                                .background(MaterialTheme.colorScheme.surfaceVariant),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.BrokenImage,
                                                contentDescription = "No Image Available",
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                                modifier = Modifier.size(36.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // General Information Card
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

                            // Dòng 1: Khu vực + Badge Loại BĐS
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.Top
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = item.address ?: "Chưa rõ khu vực",
                                        style = MaterialTheme.typography.titleLarge,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    val syncStatusText = if (item.isTextSynced) {
                                        val date = java.util.Date(item.updatedAt)
                                        val timeStr = java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(date)
                                        "Đã sao lưu lúc $timeStr"
                                    } else {
                                        "Chưa sao lưu"
                                    }
                                    Text(
                                        text = syncStatusText,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (item.isTextSynced) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                                        modifier = Modifier.padding(top = 2.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = if (item.propertyType == UnverifiedPropertyType.LAND) "Đất" else "Nhà",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            // Dòng 2: Giá • m² • hướng
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(20.dp)
                            ) {
                                // Giá
                                if (item.price != null && item.price > 0.0) {
                                    val priceStr = if (item.price >= 1.0)
                                        "${formatter.format(item.price)} tỷ"
                                    else
                                        "${formatter.format(item.price * 1000)} triệu"
                                    Text(
                                        text = priceStr,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.MonetizationOn,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                                    )
                                }

                                // Diện tích
                                if (item.area != null && item.area > 0f) {
                                    Text(
                                        text = "${formatter.format(item.area)} m²",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Straighten,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                                    )
                                }

                                // Hướng
                                if (!item.direction.isNullOrBlank()) {
                                    Text(
                                        text = item.direction,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                } else {
                                    Icon(
                                        imageVector = Icons.Default.Explore,
                                        contentDescription = null,
                                        modifier = Modifier.size(20.dp),
                                        tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                                    )
                                }
                            }
                        }
                    }
                }

                // Contact Information Card
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            val hasName = !item.ownerName.isNullOrBlank()
                            val hasPhone = !item.ownerPhone.isNullOrBlank()

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                if (hasName && hasPhone) {
                                    Text(
                                        text = item.ownerName!!,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Spacer(modifier = Modifier.weight(1f))
                                    Text(
                                        text = item.ownerPhone!!,
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            color = MaterialTheme.colorScheme.primary,
                                            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline
                                        ),
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.clickable {
                                            phoneDialogNumber = item.ownerPhone
                                        }
                                    )
                                } else if (hasName) {
                                    Text(
                                        text = item.ownerName!!,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        fontWeight = FontWeight.Medium
                                    )
                                } else if (hasPhone) {
                                    Text(
                                        text = item.ownerPhone!!,
                                        style = MaterialTheme.typography.bodyMedium.copy(
                                            color = MaterialTheme.colorScheme.primary,
                                            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline
                                        ),
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.clickable {
                                            phoneDialogNumber = item.ownerPhone
                                        }
                                    )
                                } else {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Person,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp),
                                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                                        )
                                        Icon(
                                            imageVector = Icons.Default.Phone,
                                            contentDescription = null,
                                            modifier = Modifier.size(20.dp),
                                            tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.25f)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // Location Card (Vị trí)
                val hasLocation = (item.latitude != null && item.longitude != null) || !item.mapLink.isNullOrBlank()
                if (hasLocation) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                if (item.latitude != null && item.longitude != null) {
                                    DetailRow(
                                        label = "Tọa độ",
                                        value = "${item.latitude}, ${item.longitude}",
                                        icon = Icons.Default.MyLocation
                                    )
                                }

                                if (!item.mapLink.isNullOrBlank()) {
                                    DetailRow(
                                        label = "Link bản đồ",
                                        value = item.mapLink!!,
                                        icon = Icons.Default.Map
                                    )
                                }

                                if (item.latitude != null && item.longitude != null) {
                                    Spacer(modifier = Modifier.height(4.dp))
                                    OutlinedButton(
                                        onClick = {
                                            val uri = Uri.parse("geo:${item.latitude},${item.longitude}?q=${item.latitude},${item.longitude}(${Uri.encode(item.title ?: "BĐS")})")
                                            val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                                                setPackage("com.google.android.apps.maps")
                                            }
                                            try {
                                                context.startActivity(intent)
                                            } catch (e: Exception) {
                                                val webUri = Uri.parse("https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}")
                                                context.startActivity(Intent(Intent.ACTION_VIEW, webUri))
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        shape = RoundedCornerShape(12.dp)
                                    ) {
                                        Icon(Icons.Default.Navigation, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Đi xem")
                                    }
                                }
                            }
                        }
                    }
                }

                // Description Card
                val displayDescription = item.description.ifBlank { item.rawText }
                if (displayDescription.isNotBlank()) {
                    item {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                            ),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                verticalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = "Mô tả chi tiết",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.1f))
                                Text(
                                    text = displayDescription,
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurface
                                )

                                if (item.rawText.isNotBlank() && item.description.isNotBlank() && item.rawText != item.description) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text(
                                        text = "Tin nhắn gốc",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.outline
                                    )
                                    HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.05f))
                                    Text(
                                        text = item.rawText,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }


            }
        }
        }
    }

    if (phoneDialogNumber != null) {
        com.example.ui.common.PhoneActionDialog(
            phoneNumber = phoneDialogNumber!!,
            onDismissRequest = { phoneDialogNumber = null }
        )
    }

    if (showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirmation = false },
            title = { Text("Xác nhận xóa") },
            text = { Text("Bạn có chắc chắn muốn xóa sản phẩm chờ này khỏi hệ thống? Thao tác này không thể hoàn tác.") },
            confirmButton = {
                Button(
                    onClick = {
                        showDeleteConfirmation = false
                        viewModel.deleteUnverifiedAndFiles(unverifiedId, context)
                        onNavigateBack()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError
                    )
                ) {
                    Text("Xóa")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirmation = false }) {
                    Text("Hủy")
                }
            }
        )
    }
}

@Composable
fun DetailRow(
    label: String,
    value: String,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier
                .padding(top = 2.dp)
                .size(18.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Medium
            )
        }
    }
}
