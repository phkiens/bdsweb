package com.example.ui.activation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@Composable
fun ActivationScreen(
    state: ActivationUiState,
    onActivate: (String) -> Unit,
    onRetry: () -> Unit,
    onExitApp: () -> Unit
) {
    BackHandler {
        onExitApp()
    }

    var codeText by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Default.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(64.dp)
            )

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Kích hoạt BĐS Collector",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Ứng dụng cần mã mời và kết nối Internet ở lần kích hoạt đầu tiên.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            when (state) {
                is ActivationUiState.Checking, is ActivationUiState.Activating -> {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = if (state is ActivationUiState.Checking) "Đang kiểm tra trạng thái kích hoạt..." else "Đang kích hoạt...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                is ActivationUiState.ClockChanged -> {
                    Text(
                        text = "Thời gian thiết bị đã thay đổi. Hãy bật ngày giờ tự động, kết nối Internet rồi thử lại.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(onClick = onRetry) {
                        Text("Thử lại")
                    }
                }
                is ActivationUiState.StorageError -> {
                    Text(
                        text = "Không thể lưu trạng thái kích hoạt an toàn trên thiết bị.",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedButton(onClick = onRetry) {
                        Text("Thử lại")
                    }
                }
                else -> {
                    OutlinedTextField(
                        value = codeText,
                        onValueChange = { input ->
                            val clean = input.uppercase().replace("\\s+".toRegex(), "")
                            if (clean.length <= 64) {
                                codeText = clean
                            }
                        },
                        label = { Text("Mã mời kích hoạt") },
                        placeholder = { Text("Nhập mã mời của bạn") },
                        singleLine = true,
                        visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            IconButton(onClick = { showPassword = !showPassword }) {
                                Icon(
                                    imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (showPassword) "Ẩn mã" else "Hiện mã"
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    val isButtonEnabled = codeText.isNotBlank() && state !is ActivationUiState.Activating
                    Button(
                        onClick = { onActivate(codeText) },
                        enabled = isButtonEnabled,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Kích hoạt")
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    when (state) {
                        is ActivationUiState.RequiresConnection -> {
                            Text(
                                text = "Không thể xác minh. Hãy kiểm tra kết nối Internet rồi thử lại.",
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedButton(onClick = onRetry) {
                                Text("Thử lại")
                            }
                        }
                        is ActivationUiState.Error -> {
                            Text(
                                text = state.message,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            OutlinedButton(onClick = onRetry) {
                                Text("Thử lại")
                            }
                        }
                        else -> {}
                    }
                }
            }
        }
    }
}
