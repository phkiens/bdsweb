package com.example.ui.property.detail

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.domain.model.Property
import com.example.domain.usecase.media.ExportMode

@Composable
fun PropertyExportPhotosDialog(
    property: Property,
    isExportingPhotos: Boolean,
    onDismissRequest: () -> Unit,
    onExportPhotos: (Property, ExportMode) -> Unit
) {
    var keepPerProperty by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isExportingPhotos) onDismissRequest() },
        title = { Text("Xuất ảnh để đăng FB") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Sao chép ảnh của sản phẩm này vào thư viện ảnh công cộng để ứng dụng Facebook (hoặc ứng dụng khác) có thể chọn ảnh dễ dàng.",
                    style = MaterialTheme.typography.bodyMedium
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(enabled = !isExportingPhotos) { keepPerProperty = !keepPerProperty }
                        .padding(vertical = 4.dp)
                ) {
                    Checkbox(
                        checked = keepPerProperty,
                        onCheckedChange = { keepPerProperty = it },
                        enabled = !isExportingPhotos
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Giữ lại album này (không tự xoá)",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                Text(
                    text = if (keepPerProperty) {
                        "Chế độ B (Giữ lại): Tạo album riêng 'Pictures/BĐS/...' cho sản phẩm này. Album không bị tự xoá khi xuất sản phẩm khác."
                    } else {
                        "Chế độ A (Đăng nhanh - Mặc định): Xuất vào album chung 'Pictures/BĐS Đăng FB/'. Tự động xoá ảnh cũ đã xuất trước đó để album gọn gàng."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                if (isExportingPhotos) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.padding(top = 8.dp)
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                        Text("Đang xuất ảnh...", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val mode = if (keepPerProperty) {
                        ExportMode.KEEP_PER_PROPERTY
                    } else {
                        ExportMode.QUICK_OVERWRITE
                    }
                    onExportPhotos(property, mode)
                },
                enabled = !isExportingPhotos
            ) {
                Text("Xuất ảnh")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismissRequest,
                enabled = !isExportingPhotos
            ) {
                Text("Hủy")
            }
        }
    )
}
