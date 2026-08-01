package com.example.ui.property.detail

import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.ContentPaste
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.example.domain.model.Property

@Composable
fun PropertyEditListingDialog(
    property: Property,
    onDismissRequest: () -> Unit,
    onSaveDescription: (Property, String) -> Unit,
    onShareClick: () -> Unit
) {
    val context = LocalContext.current

    var draftText by remember(property.id) {
        mutableStateOf(property.description.ifBlank { property.rawText })
    }

    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = { Text("Chỉnh sửa tin đăng") },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.verticalScroll(rememberScrollState())
            ) {
                // Header row with quick action icons (Paste & Clear)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Nội dung mô tả / tin đăng:",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        // Quick Paste Icon
                        IconButton(
                            onClick = {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                val clipData = clipboard?.primaryClip
                                if (clipData != null && clipData.itemCount > 0) {
                                    val pastedStr = clipData.getItemAt(0).text?.toString().orEmpty()
                                    if (pastedStr.isNotBlank()) {
                                        draftText = if (draftText.isBlank()) pastedStr else "$draftText\n\n$pastedStr"
                                        Toast.makeText(context, "Đã dán nội dung", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ContentPaste,
                                contentDescription = "Dán",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        // Quick Clear Icon
                        IconButton(
                            onClick = { draftText = "" },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = "Xoá",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = draftText,
                    onValueChange = { draftText = it },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 160.dp, max = 280.dp),
                    placeholder = { Text("Nhập nội dung tin đăng...") }
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSaveDescription(property, draftText)
                    onDismissRequest()
                    Toast.makeText(context, "Đã lưu nội dung tin đăng", Toast.LENGTH_SHORT).show()
                }
            ) {
                Text("Lưu")
            }
        },
        dismissButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    onClick = {
                        onDismissRequest()
                        onShareClick()
                    }
                ) {
                    Text("Chia sẻ")
                }

                TextButton(onClick = onDismissRequest) {
                    Text("Hủy")
                }
            }
        }
    )
}
