package com.example.ui.nearby

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.example.domain.model.Property
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.model.normalizeVietnamesePhone
import com.example.ui.common.AppTextField
import com.example.ui.common.MapSurveyItem
import com.example.ui.common.MapsIntentHelper
import com.example.ui.common.PhoneActionDialog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MapItemPreviewContent(
    item: MapSurveyItem,
    viewModel: MapSurveyViewModel,
    scope: CoroutineScope,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToUnverifiedDetail: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val distanceFormat = remember { java.text.DecimalFormat("0.00") }

    // State to load the full entity from the DB asynchronously
    var fullProperty by remember(item.id) { mutableStateOf<Property?>(null) }
    var fullUnverifiedProperty by remember(item.id) { mutableStateOf<UnverifiedProperty?>(null) }
    var showQuickEditDialog by remember { mutableStateOf(false) }
    var showPhoneActionDialog by remember { mutableStateOf(false) }

    LaunchedEffect(item.id) {
        if (item.isUnverified) {
            fullUnverifiedProperty = viewModel.getFullUnverifiedProperty(item.id)
        } else {
            fullProperty = viewModel.getFullProperty(item.id)
        }
    }

    // Get phone number & name
    val ownerPhone = if (item.isUnverified) fullUnverifiedProperty?.ownerPhone else fullProperty?.ownerPhone
    val ownerName = if (item.isUnverified) fullUnverifiedProperty?.ownerName else fullProperty?.ownerName
    val formattedPhone = ownerPhone?.takeIf { it.isNotBlank() }

    // Dialog Quick Edit fields
    var quickPriceText by remember(fullProperty, fullUnverifiedProperty) {
        val price = if (item.isUnverified) fullUnverifiedProperty?.price else fullProperty?.price
        mutableStateOf(price?.toString() ?: "")
    }
    var quickStatus by remember(fullProperty, fullUnverifiedProperty) {
        val status = if (item.isUnverified) (fullUnverifiedProperty?.status ?: PropertyStatus.PENDING_SURVEY.value) else (fullProperty?.status ?: PropertyStatus.FOR_SALE.value)
        mutableStateOf(status)
    }
    var quickNotes by remember(fullProperty, fullUnverifiedProperty) {
        val notes = if (item.isUnverified) (fullUnverifiedProperty?.description ?: "") else (fullProperty?.diary ?: "")
        mutableStateOf(notes)
    }

    // Action methods
    val launchDirections = { lat: Double, lng: Double ->
        val url = "https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"
        if (!MapsIntentHelper.openInGoogleMaps(context, url)) {
            Toast.makeText(context, "Không thể mở ứng dụng bản đồ", Toast.LENGTH_SHORT).show()
        }
    }

    val launchDial = { phone: String ->
        val intent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:${phone.normalizeVietnamesePhone()}")
        }
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Không thể mở trình quay số", Toast.LENGTH_SHORT).show()
        }
    }

    // Image list preparation
    val imagesList = remember(fullProperty, fullUnverifiedProperty) {
        val list = mutableListOf<Any>()
        if (item.isUnverified) {
            val unverified = fullUnverifiedProperty
            if (unverified != null) {
                val paths = unverified.mediaPaths
                val driveIds = unverified.driveMediaIds
                val maxCount = maxOf(paths.size, driveIds.size)
                for (i in 0 until maxCount) {
                    val path = paths.getOrNull(i)
                    val driveId = driveIds.getOrNull(i)
                    val localFile = path?.let { File(it) }
                    if (localFile != null && localFile.exists()) {
                        list.add(localFile)
                    } else if (!driveId.isNullOrBlank()) {
                        list.add("https://drive.google.com/thumbnail?sz=w400&id=$driveId")
                    }
                }
            }
        } else {
            val property = fullProperty
            if (property != null) {
                val paths = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                val driveIdsJson = property.driveMediaIds
                val jsonObject = if (!driveIdsJson.isNullOrBlank()) {
                    try { org.json.JSONObject(driveIdsJson) } catch (e: Exception) { null }
                } else null
                
                for (path in paths) {
                    val localFile = File(path)
                    if (localFile.exists()) {
                        list.add(localFile)
                    } else {
                        val driveId = jsonObject?.optString(path)
                        if (!driveId.isNullOrBlank()) {
                            list.add("https://drive.google.com/thumbnail?sz=w400&id=$driveId")
                        }
                    }
                }
            }
        }
        list
    }

    // Quick edit dialog UI
    if (showQuickEditDialog) {
        val statuses = if (item.isUnverified) {
            // Chỉ bày các giá trị CÓ THẬT trong enum PropertyStatus. Trước đây bày thêm
            // "Đã xác minh" / "Đã xóa" — hai chuỗi không thuộc enum, bị ghi thẳng vào cột status
            // (updatePropertyQuickly không chuẩn hoá) rồi đẩy lên Supabase; fromValue() không khớp
            // nên fallback về FOR_SALE, tức chọn "Đã xóa" mà hiện ra "Đang bán", và không hề
            // xoá/xác minh gì. Xác minh và xoá là HÀNH ĐỘNG, không phải trạng thái — muốn làm
            // thì gọi đúng hàm, đừng nhét vào danh sách này.
            listOf(PropertyStatus.PENDING_SURVEY, PropertyStatus.FOR_SALE, PropertyStatus.SOLD).map { it.value }
        } else {
            listOf(PropertyStatus.FOR_SALE, PropertyStatus.SOLD).map { it.value }
        }
        AlertDialog(
            onDismissRequest = { showQuickEditDialog = false },
            title = { Text("Sửa nhanh thông tin", style = MaterialTheme.typography.titleLarge) },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    AppTextField(
                        value = quickPriceText,
                        onValueChange = { quickPriceText = it },
                        label = { Text("Giá (tỷ)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Column {
                        Text(
                            "Trạng thái",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            statuses.forEach { statusText ->
                                val isSelectedStatus = quickStatus == statusText
                                Box(
                                    contentAlignment = Alignment.Center,
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            if (isSelectedStatus) MaterialTheme.colorScheme.primaryContainer
                                            else MaterialTheme.colorScheme.surfaceVariant
                                        )
                                        .border(
                                            width = 1.dp,
                                            color = if (isSelectedStatus) MaterialTheme.colorScheme.primary
                                            else Color.Transparent,
                                            shape = RoundedCornerShape(8.dp)
                                        )
                                        .clickable { quickStatus = statusText }
                                        .padding(vertical = 8.dp)
                                ) {
                                    Text(
                                        text = statusText,
                                        style = MaterialTheme.typography.labelMedium,
                                        color = if (isSelectedStatus) MaterialTheme.colorScheme.onPrimaryContainer
                                        else MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }

                    AppTextField(
                        value = quickNotes,
                        onValueChange = { quickNotes = it },
                        label = { Text(if (item.isUnverified) "Mô tả" else "Ghi chú nhật ký") },
                        minLines = 3,
                        maxLines = 5,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val priceVal = quickPriceText.toDoubleOrNull()
                        viewModel.updatePropertyQuickly(
                            id = item.id,
                            isUnverified = item.isUnverified,
                            newPrice = priceVal,
                            newStatus = quickStatus,
                            newNotes = quickNotes,
                            onSuccess = {
                                showQuickEditDialog = false
                                scope.launch {
                                    if (item.isUnverified) {
                                        fullUnverifiedProperty = viewModel.getFullUnverifiedProperty(item.id)
                                    } else {
                                        fullProperty = viewModel.getFullProperty(item.id)
                                    }
                                }
                            }
                        )
                    }
                ) {
                    Text("Lưu")
                }
            },
            dismissButton = {
                TextButton(onClick = { showQuickEditDialog = false }) {
                    Text("Hủy")
                }
            }
        )
    }

    if (showPhoneActionDialog && !formattedPhone.isNullOrBlank()) {
        PhoneActionDialog(
            phoneNumber = formattedPhone,
            onDismissRequest = { showPhoneActionDialog = false }
        )
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1) HÀNG NÚT một tay (Chỉ đường, Gọi, Lộ trình) - Chỉ hiện Icon
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            val hasCoords = MapsIntentHelper.isValidCoordinate(item.latitude, item.longitude)
            OutlinedButton(
                onClick = { launchDirections(item.latitude, item.longitude) },
                enabled = hasCoords,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Directions, contentDescription = "Chỉ đường", modifier = Modifier.size(20.dp))
            }

            val hasPhone = !formattedPhone.isNullOrBlank()
            OutlinedButton(
                onClick = { showPhoneActionDialog = true },
                enabled = hasPhone,
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Call, contentDescription = "Liên hệ", modifier = Modifier.size(20.dp))
            }

            val isSelected = viewModel.isSelected(item)
            Button(
                onClick = { viewModel.toggleSelection(item) },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isSelected) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
                    contentColor = if (isSelected) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer
                )
            ) {
                Icon(
                    imageVector = if (isSelected) Icons.Default.RemoveCircleOutline else Icons.Default.AddCircleOutline,
                    contentDescription = "Chọn lộ trình",
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // 2) Thông tin bên dưới (Peek info)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            val firstImagePath = item.imagePath?.split("|||")?.firstOrNull()
            val imageFile = if (!firstImagePath.isNullOrBlank()) File(firstImagePath) else null
            
            if (imageFile != null && imageFile.exists()) {
                AsyncImage(
                    model = imageFile,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(90.dp)
                        .clip(RoundedCornerShape(12.dp))
                )
            } else if (!item.isUnverified) {
                Box(
                    modifier = Modifier
                        .size(90.dp)
                        .background(Color(0xFFF0F0F0), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.ImageNotSupported, contentDescription = null, tint = Color.Gray.copy(alpha = 0.5f))
                }
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically, 
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Giá
                    Text(
                        text = PropertySheetHelper.formatPrice(item.price),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold
                    )

                    Text("·", color = Color.Gray.copy(alpha = 0.5f))

                    // Diện tích
                    if (item.areaSize != null && item.areaSize > 0.0) {
                        val sizeStr = if (item.areaSize % 1.0 == 0.0) "${item.areaSize.toInt()} m²" else "${item.areaSize} m²"
                        Text(
                            text = sizeStr,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    } else {
                        PlaceholderBox()
                    }
                }

                Text(
                    text = "${item.propertyType ?: "BĐS"} · ${item.distanceKm?.let { distanceFormat.format(it) + " km" } ?: "---"}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // TẦNG EXPAND (Luôn compose để giữ chiều cao ổn định, LazyRow tự động quản lý load ảnh)
        val galleryImages = remember(imagesList) {
            if (imagesList.size > 1) imagesList.drop(1) else emptyList()
        }
        
        if (galleryImages.isNotEmpty()) {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(galleryImages) { model ->
                    Card(
                        modifier = Modifier
                            .size(width = 160.dp, height = 120.dp)
                            .clip(RoundedCornerShape(8.dp)),
                        elevation = CardDefaults.cardElevation(2.dp)
                    ) {
                        AsyncImage(
                            model = model,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
            }
        }

        // 2. Bảng thông tin sâu
        val address = if (item.isUnverified) {
            fullUnverifiedProperty?.address ?: fullUnverifiedProperty?.area?.toString() ?: "---"
        } else {
            fullProperty?.area ?: "---"
        }

        val rawTextForDimensions = if (item.isUnverified) {
            fullUnverifiedProperty?.rawText ?: fullUnverifiedProperty?.description
        } else {
            fullProperty?.rawText ?: fullProperty?.description
        }
        val dimensions = PropertySheetHelper.extractDimensions(rawTextForDimensions)
        val notes = if (item.isUnverified) {
            fullUnverifiedProperty?.description?.takeIf { it.isNotBlank() } ?: "---"
        } else {
            fullProperty?.diary?.takeIf { it.isNotBlank() } ?: "---"
        }

        Card(
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            ),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                InfoRow(label = "Địa chỉ", value = address)
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Kích thước", value = dimensions)
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Chủ nhà", value = "${ownerName ?: "---"} (${formattedPhone ?: "---"})")
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
                InfoRow(label = "Ghi chú", value = notes)
            }
        }

        if (!item.isUnverified && fullProperty?.propertyStatus == PropertyStatus.FOR_SALE) {
            OutlinedButton(
                onClick = {
                    fullProperty?.let { viewModel.onScanMatchingCustomers(it) }
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Group, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Xem khách phù hợp")
            }
        }

        // 3. Hàng nút: Sửa nhanh | Chi tiết đầy đủ
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedButton(
                onClick = { showQuickEditDialog = true },
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Sửa nhanh")
            }

            Button(
                onClick = {
                    if (item.isUnverified) {
                        onNavigateToUnverifiedDetail(item.id)
                    } else {
                        onNavigateToDetail(item.id)
                    }
                    onDismiss()
                },
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.Launch, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Chi tiết đầy đủ")
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
internal fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(2.5f),
            textAlign = TextAlign.End
        )
    }
}
