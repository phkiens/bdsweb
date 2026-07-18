package com.example.ui.common

import com.example.ui.common.showSnackbar

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun PhoneActionDialog(
    phoneNumber: String,
    onDismissRequest: () -> Unit
) {
    val context = LocalContext.current
    
    AlertDialog(
        onDismissRequest = onDismissRequest,
        shape = RoundedCornerShape(16.dp),
        title = {
            Text(
                text = "Tùy chọn liên hệ",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Số điện thoại: $phoneNumber",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                
                HorizontalDivider(color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.1f))
                
                // Option 1: Gọi thường
                Surface(
                    onClick = {
                        try {
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phoneNumber"))
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            context.showSnackbar("Không thể thực hiện cuộc gọi")
                        }
                        onDismissRequest()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.primaryContainer,
                    tonalElevation = 2.dp
                ) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "Gọi thường",
                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Column {
                            Text(
                                text = "Gọi thường",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Text(
                                text = "Gọi điện thoại thông thường",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
                
                // Option 2: Mở Zalo
                Surface(
                    onClick = {
                        val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "").let {
                            if (it.startsWith("+84")) "0" + it.substring(3)
                            else if (it.startsWith("84") && it.length > 9) "0" + it.substring(2)
                            else it
                        }
                        try {
                            // Try opening the profile directly in Zalo app first
                            val intent = Intent(
                                Intent.ACTION_VIEW,
                                Uri.parse("zalo://qr/p/$cleanPhone")
                            )
                            context.startActivity(intent)
                        } catch (e: Exception) {
                            try {
                                // Fallback to standard web URL if Zalo app is not installed or doesn't support the scheme
                                val intent = Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("https://zalo.me/$cleanPhone")
                                )
                                context.startActivity(intent)
                            } catch (fallbackEx: Exception) {
                                context.showSnackbar("Không thể mở Zalo")
                            }
                        }
                        onDismissRequest()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.secondaryContainer,
                    tonalElevation = 2.dp
                ) {
                    Row(
                        modifier = Modifier
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "Z",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.width(24.dp)
                        )
                        Column {
                            Text(
                                text = "Mở Zalo",
                                style = MaterialTheme.typography.bodyLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                            Text(
                                text = "Nhắn tin hoặc gọi qua Zalo",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismissRequest) {
                Text("Đóng")
            }
        }
    )
}
