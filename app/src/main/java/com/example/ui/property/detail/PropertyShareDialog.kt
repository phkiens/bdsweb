package com.example.ui.property.detail

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.example.domain.model.Property
import java.io.File
import java.text.NumberFormat
import java.util.Locale

@Composable
fun PropertyShareDialog(
    property: Property,
    onDismissRequest: () -> Unit
) {
    val context = LocalContext.current

    val formatter = remember { NumberFormat.getNumberInstance(Locale.US) }
    val formattedPrice = if (property.price >= 1.0) {
        "${formatter.format(property.price)} tỷ"
    } else {
        "${formatter.format(property.price * 1000)} triệu"
    }

    val imagesList = remember(property.imagePath) {
        property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
    }
    val hasImages = imagesList.isNotEmpty()

    val hasCoords = property.latitude != 0.0 && property.longitude != 0.0

    var includeBasic    by remember { mutableStateOf(true) }
    var includeDesc     by remember { mutableStateOf(true) }
    var includeLocation by remember { mutableStateOf(false) }   // mặc định TẮT
    var includeOwner    by remember { mutableStateOf(false) }   // mặc định TẮT
    var includeImages   by remember { mutableStateOf(hasImages) }

    val isAllSelected = includeBasic && includeDesc &&
        (!hasCoords || includeLocation) &&
        includeOwner &&
        (!hasImages || includeImages)

    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text("Tùy chọn chia sẻ") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.verticalScroll(rememberScrollState())
            ) {
                // "Select All" option
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val target = !isAllSelected
                            includeBasic = target
                            includeDesc = target
                            if (hasCoords) includeLocation = target
                            includeOwner = target
                            if (hasImages) includeImages = target
                        }
                        .padding(vertical = 4.dp)
                ) {
                    Checkbox(
                        checked = isAllSelected,
                        onCheckedChange = { target ->
                            includeBasic = target
                            includeDesc = target
                            if (hasCoords) includeLocation = target
                            includeOwner = target
                            if (hasImages) includeImages = target
                        }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Chọn tất cả", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                }
                Divider()

                Text("Chọn các thông tin muốn chia sẻ:", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 4.dp))
                
                // 1. Cơ bản
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { includeBasic = !includeBasic }
                ) {
                    Checkbox(checked = includeBasic, onCheckedChange = { includeBasic = it })
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("📋 Thông tin cơ bản (khu vực, giá, diện tích, loại hình, hướng)")
                }

                // 2. Mô tả
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { includeDesc = !includeDesc }
                ) {
                    Checkbox(checked = includeDesc, onCheckedChange = { includeDesc = it })
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("📝 Mô tả chi tiết BĐS")
                }

                // 3. Định vị
                if (hasCoords) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().clickable { includeLocation = !includeLocation }
                    ) {
                        Checkbox(checked = includeLocation, onCheckedChange = { includeLocation = it })
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("📍 Định vị (link Google Maps)")
                    }
                }

                // 4. Chủ nhà
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { includeOwner = !includeOwner }
                ) {
                    Checkbox(checked = includeOwner, onCheckedChange = { includeOwner = it })
                    Spacer(modifier = Modifier.width(8.dp))
                    val ownerLabel = if (property.ownerPhone.isNotBlank() || property.ownerName.isNotBlank()) {
                        "📞 Chủ nhà: ${property.ownerName} (${property.ownerPhone})"
                    } else {
                        "📞 Chủ nhà: (Chưa có thông tin)"
                    }
                    Text(ownerLabel)
                }

                // 5. Ảnh
                if (hasImages) {
                    Divider()
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().clickable { includeImages = !includeImages }
                    ) {
                        Checkbox(checked = includeImages, onCheckedChange = { includeImages = it })
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("🖼️ Hình ảnh (${imagesList.size} ảnh)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onDismissRequest()
                    val builder = StringBuilder()
                    builder.append("📢 BĐS ĐẸP ĐANG BÁN:\n")

                    if (includeBasic) {
                        builder.append("📍 Khu vực: ${property.area}\n")
                        builder.append("💰 Giá: $formattedPrice\n")
                        builder.append("📐 Diện tích: ${property.areaSize} m²\n")
                        builder.append("🏠 Loại hình: ${property.propertyType}\n")
                        if (property.direction.isNotBlank()) {
                            val firstDir = property.direction.split("|||").firstOrNull { it.isNotBlank() } ?: property.direction
                            builder.append("🧭 Hướng: $firstDir\n")
                        }
                    }

                    if (includeDesc && property.description.isNotBlank()) {
                        builder.append("📝 Mô tả: ${property.description}\n")
                    }

                    if (includeLocation && hasCoords) {
                        val mapUrl = "https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}"
                        builder.append("📌 Định vị: $mapUrl\n")
                    }

                    if (includeOwner) {
                        val nameStr = property.ownerName.ifBlank { "Chủ nhà" }
                        val phoneStr = property.ownerPhone.ifBlank { "Chưa có SĐT" }
                        builder.append("📞 Liên hệ: $nameStr - $phoneStr\n")
                    }

                    val shareBody = builder.toString().trimEnd()

                    val uriList = ArrayList<Uri>()
                    if (includeImages && hasImages) {
                        imagesList.forEach { path ->
                            val file = File(path)
                            if (file.exists()) {
                                try {
                                    val uri = FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.provider",
                                        file
                                    )
                                    uriList.add(uri)
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }
                        }
                    }

                    val intent = if (uriList.isNotEmpty()) {
                        if (uriList.size == 1) {
                            Intent(Intent.ACTION_SEND).apply {
                                type = "image/*"
                                putExtra(Intent.EXTRA_STREAM, uriList[0])
                                putExtra(Intent.EXTRA_TEXT, shareBody)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                        } else {
                            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                                type = "image/*"
                                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uriList)
                                putExtra(Intent.EXTRA_TEXT, shareBody)
                                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            }
                        }
                    } else {
                        Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, shareBody)
                        }
                    }

                    if (includeImages && hasImages && uriList.size > 1 && shareBody.isNotBlank()) {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE)
                            as ClipboardManager
                        clipboard.setPrimaryClip(
                            ClipData.newPlainText("Tin đăng BĐS", shareBody)
                        )
                        Toast.makeText(
                            context,
                            "Đã copy nội dung. Nếu ảnh gửi đi mà thiếu chữ, hãy dán (paste) vào khung chat.",
                            Toast.LENGTH_LONG
                        ).show()
                    }

                    context.startActivity(Intent.createChooser(intent, "Chia sẻ tin đăng BĐS"))
                }
            ) {
                Text("Chia sẻ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismissRequest) {
                Text("Hủy")
            }
        }
    )
}
