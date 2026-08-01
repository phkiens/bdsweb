package com.example.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.domain.model.UnverifiedProperty
import com.example.ui.common.showSnackbar
import kotlinx.coroutines.launch

@Composable
fun RegexConfigDialog(
    viewModel: SettingsViewModel,
    onDismiss: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var jsonText by remember { mutableStateOf(viewModel.getActiveRegexJson()) }
    var validationResult by remember { mutableStateOf<Result<Unit>?>(null) }
    var testText by remember { mutableStateOf("") }
    var testResult by remember { mutableStateOf<UnverifiedProperty?>(null) }
    val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "Bộ regex bóc tách tùy chỉnh",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Tự cấu hình bộ biểu thức chính quy (Regex) để tự động trích xuất các trường thông tin mà không cần cài lại ứng dụng.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val activeJson = viewModel.getActiveRegexJson()
                            clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(activeJson))
                            context.showSnackbar("Đã sao chép bộ regex hiện tại.")
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Copy bộ hiện tại", style = MaterialTheme.typography.bodySmall)
                    }

                    OutlinedButton(
                        onClick = {
                            val defaultJson = viewModel.getDefaultRegexJson()
                            jsonText = defaultJson
                            validationResult = viewModel.validateRegexJson(defaultJson)
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text("Mẫu mặc định", style = MaterialTheme.typography.bodySmall)
                    }
                }

                OutlinedTextField(
                    value = jsonText,
                    onValueChange = {
                        jsonText = it
                        validationResult = null
                    },
                    label = { Text("Nội dung cấu hình JSON") },
                    placeholder = { Text("Dán JSON regex vào đây...") },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    textStyle = androidx.compose.ui.text.TextStyle(fontFamily = FontFamily.Monospace, fontSize = MaterialTheme.typography.bodySmall.fontSize),
                    singleLine = false,
                    maxLines = 15
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Button(
                        onClick = {
                            validationResult = viewModel.validateRegexJson(jsonText)
                        },
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Kiểm tra cú pháp")
                    }

                    validationResult?.let { res ->
                        if (res.isSuccess) {
                            Text(
                                text = "✅ Hợp lệ",
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        } else {
                            val errMessage = res.exceptionOrNull()?.localizedMessage ?: "Lỗi không xác định"
                            Text(
                                text = "❌ Lỗi: $errMessage",
                                color = MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.weight(1f).padding(start = 8.dp),
                                textAlign = TextAlign.End
                            )
                        }
                    }
                }

                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)

                Text(
                    text = "Chạy thử nghiệm bộ regex",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )

                OutlinedTextField(
                    value = testText,
                    onValueChange = { testText = it },
                    label = { Text("Tin mẫu chạy thử") },
                    placeholder = { Text("Nhập tin nhắn BĐS mẫu để kiểm tra...") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )

                Button(
                    onClick = {
                        scope.launch {
                            val valRes = viewModel.validateRegexJson(jsonText)
                            if (valRes.isSuccess) {
                                testResult = viewModel.testRunRegex(testText, jsonText)
                            } else {
                                context.showSnackbar("Vui lòng sửa lỗi cú pháp regex trước khi chạy thử.")
                            }
                        }
                    },
                    shape = RoundedCornerShape(8.dp),
                    enabled = testText.isNotBlank()
                ) {
                    Text("Chạy thử")
                }

                testResult?.let { res ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(12.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("Kết quả bóc tách thử nghiệm:", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            Text("• SĐT: ${res.ownerPhone ?: "Không tìm thấy"}")
                            Text("• Diện tích: ${res.area?.let { "$it m²" } ?: "Không tìm thấy"}")
                            Text("• Giá: ${res.price?.let { "$it tỷ" } ?: "Không tìm thấy"}")
                            Text("• Link bản đồ: ${res.mapLink ?: "Không tìm thấy"}")
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val valRes = viewModel.validateRegexJson(jsonText)
                    if (valRes.isSuccess) {
                        viewModel.saveCustomRegex(jsonText)
                        context.showSnackbar("Đã áp dụng bộ regex mới.")
                        onDismiss()
                    } else {
                        context.showSnackbar("Không thể áp dụng cấu hình có lỗi cú pháp.")
                    }
                },
                enabled = validationResult?.isSuccess == true
            ) {
                Text("Áp dụng")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(
                    onClick = {
                        viewModel.restoreDefaultRegex()
                        context.showSnackbar("Đã khôi phục bộ regex mặc định.")
                        onDismiss()
                    }
                ) {
                    Text("Khôi phục mặc định", color = MaterialTheme.colorScheme.error)
                }

                TextButton(onClick = onDismiss) {
                    Text("Hủy")
                }
            }
        }
    )
}
