package com.example.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.ui.common.SettingsManager
import com.example.ui.common.PropertyActionKey
import com.example.ui.common.ActionMode

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun IconSortingScreen(
    settingsManager: SettingsManager,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var selectedMode by rememberSaveable { mutableStateOf(ActionMode.VERIFIED) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Sắp xếp icon chức năng",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Quay lại"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        },
        modifier = modifier
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                text = "Bật để hiện trực tiếp trên thanh tác vụ, tắt để ẩn vào menu. Cấu hình riêng cho SP bán và SP chờ.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                FilterChip(
                    selected = selectedMode == ActionMode.VERIFIED,
                    onClick = { selectedMode = ActionMode.VERIFIED },
                    label = { Text("SP bán") },
                    modifier = Modifier.weight(1f)
                )
                FilterChip(
                    selected = selectedMode == ActionMode.UNVERIFIED,
                    onClick = { selectedMode = ActionMode.UNVERIFIED },
                    label = { Text("SP chờ") },
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            val filteredActions = remember(selectedMode) {
                PropertyActionKey.entries.filter { actionKey ->
                    if (selectedMode == ActionMode.VERIFIED) {
                        actionKey != PropertyActionKey.VERIFY
                    } else {
                        true
                    }
                }
            }

            filteredActions.forEach { actionKey ->
                val defaultPos = if (selectedMode == ActionMode.VERIFIED) {
                    actionKey.defaultPosition
                } else {
                    actionKey.defaultPositionUnverified
                }

                var isOuter by remember(actionKey, selectedMode) {
                    mutableStateOf(settingsManager.getActionPosition(actionKey.name, defaultPos, selectedMode) == "OUTER")
                }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = actionKey.displayName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (isOuter) "Hiển thị ngoài (Action bar)" else "Ẩn bên trong (Menu ...)",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (isOuter) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = if (isOuter) "Ngoài" else "Trong",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (isOuter) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                            )
                            Switch(
                                checked = isOuter,
                                onCheckedChange = { checked ->
                                    isOuter = checked
                                    settingsManager.setActionPosition(actionKey.name, if (checked) "OUTER" else "INNER", selectedMode)
                                },
                                modifier = Modifier.testTag(
                                    if (selectedMode == ActionMode.VERIFIED) {
                                        "switch_action_${actionKey.name.lowercase()}"
                                    } else {
                                        "switch_action_unv_${actionKey.name.lowercase()}"
                                    }
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}
