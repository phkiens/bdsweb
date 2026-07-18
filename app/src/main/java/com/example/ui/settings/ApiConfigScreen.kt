package com.example.ui.settings

import com.example.ui.common.showSnackbar
import androidx.lifecycle.compose.collectAsStateWithLifecycle

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.example.ui.common.KeyboardAwareScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

fun parseConfigContent(content: String): Triple<String?, String?, String?> {
    var url: String? = null
    var key: String? = null
    var gemini: String? = null

    // 1. Try to parse as JSON first (handles both camelCase and UPPER_SNAKE)
    try {
        val json = org.json.JSONObject(content)
        
        url = when {
            json.has("supabaseUrl") -> json.optString("supabaseUrl")
            json.has("supabase_url") -> json.optString("supabase_url")
            json.has("SUPABASE_URL") -> json.optString("SUPABASE_URL")
            json.has("url") -> json.optString("url")
            json.has("URL") -> json.optString("URL")
            else -> null
        }
        
        key = when {
            json.has("supabaseAnonKey") -> json.optString("supabaseAnonKey")
            json.has("supabase_anon_key") -> json.optString("supabase_anon_key")
            json.has("SUPABASE_ANON_KEY") -> json.optString("SUPABASE_ANON_KEY")
            json.has("anonKey") -> json.optString("anonKey")
            json.has("anon_key") -> json.optString("anon_key")
            json.has("ANON_KEY") -> json.optString("ANON_KEY")
            json.has("supabaseKey") -> json.optString("supabaseKey")
            json.has("supabase_key") -> json.optString("supabase_key")
            json.has("SUPABASE_KEY") -> json.optString("SUPABASE_KEY")
            else -> null
        }
        
        gemini = when {
            json.has("geminiApiKey") -> json.optString("geminiApiKey")
            json.has("gemini_api_key") -> json.optString("gemini_api_key")
            json.has("GEMINI_API_KEY") -> json.optString("GEMINI_API_KEY")
            json.has("geminiKey") -> json.optString("geminiKey")
            json.has("gemini_key") -> json.optString("gemini_key")
            json.has("GEMINI_KEY") -> json.optString("GEMINI_KEY")
            else -> null
        }

        url = url?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
        key = key?.trim()?.takeIf { it.isNotEmpty() && it != "null" }
        gemini = gemini?.trim()?.takeIf { it.isNotEmpty() && it != "null" }

        if (url != null || key != null || gemini != null) {
            return Triple(url, key, gemini)
        }
    } catch (e: Exception) {
        // Not a valid JSON or parsing failed, fallback to env parser
    }

    // 2. Parse as env property lines
    content.lines().forEach { line ->
        val trimmedLine = line.trim()
        if (trimmedLine.isNotEmpty() && !trimmedLine.startsWith("#")) {
            // Remove 'export ' prefix if present
            val cleanedLine = if (trimmedLine.startsWith("export ", ignoreCase = true)) {
                trimmedLine.substring("export ".length).trim()
            } else {
                trimmedLine
            }
            
            val parts = cleanedLine.split("=", limit = 2)
            if (parts.size == 2) {
                val rawKey = parts[0].trim()
                val rawVal = parts[1].trim()
                    .removeSurrounding("\"")
                    .removeSurrounding("'")
                    .trim()
                
                if (rawVal.isNotEmpty()) {
                    when {
                        rawKey.equals("SUPABASE_URL", ignoreCase = true) || 
                        rawKey.equals("supabase_url", ignoreCase = true) || 
                        rawKey.equals("supabaseUrl", ignoreCase = true) ||
                        rawKey.equals("NEXT_PUBLIC_SUPABASE_URL", ignoreCase = true) -> {
                            url = rawVal
                        }
                        rawKey.equals("SUPABASE_ANON_KEY", ignoreCase = true) || 
                        rawKey.equals("supabase_anon_key", ignoreCase = true) || 
                        rawKey.equals("supabaseAnonKey", ignoreCase = true) ||
                        rawKey.equals("NEXT_PUBLIC_SUPABASE_ANON_KEY", ignoreCase = true) ||
                        rawKey.equals("SUPABASE_KEY", ignoreCase = true) ||
                        rawKey.equals("supabaseKey", ignoreCase = true) -> {
                            key = rawVal
                        }
                        rawKey.equals("GEMINI_API_KEY", ignoreCase = true) || 
                        rawKey.equals("gemini_api_key", ignoreCase = true) || 
                        rawKey.equals("geminiApiKey", ignoreCase = true) ||
                        rawKey.equals("GEMINI_KEY", ignoreCase = true) ||
                        rawKey.equals("geminiKey", ignoreCase = true) -> {
                            gemini = rawVal
                        }
                    }
                }
            }
        }
    }

    return Triple(
        url?.trim()?.takeIf { it.isNotEmpty() },
        key?.trim()?.takeIf { it.isNotEmpty() },
        gemini?.trim()?.takeIf { it.isNotEmpty() }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApiConfigScreen(
    viewModel: SettingsViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current
    val scope = rememberCoroutineScope()

    val apiConfig by viewModel.apiConfig.collectAsStateWithLifecycle()
    val savedGeminiKey by viewModel.geminiApiKey.collectAsStateWithLifecycle()
    val savedGeminiModel by viewModel.geminiModel.collectAsStateWithLifecycle()
    val isCheckingApiKey by viewModel.isCheckingApiKey.collectAsStateWithLifecycle()

    var supabaseUrl by remember { mutableStateOf("") }
    var supabaseAnonKey by remember { mutableStateOf("") }
    var geminiApiKey by remember { mutableStateOf("") }
    var geminiModel by remember { mutableStateOf("") }

    var isInitialized by remember { mutableStateOf(false) }
    LaunchedEffect(apiConfig, savedGeminiKey, savedGeminiModel) {
        if (!isInitialized) {
            supabaseUrl = apiConfig.supabaseUrl
            supabaseAnonKey = apiConfig.supabaseAnonKey
            geminiApiKey = savedGeminiKey
            geminiModel = savedGeminiModel
            if (supabaseUrl.isNotEmpty() || supabaseAnonKey.isNotEmpty() || geminiApiKey.isNotEmpty()) {
                isInitialized = true
            }
        }
    }

    // Config file picker
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                try {
                    val parsed = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { inputStream ->
                            inputStream.bufferedReader().use { it.readText() }
                        }?.let { text ->
                            parseConfigContent(text)
                        }
                    }

                    if (parsed != null && (parsed.first != null || parsed.second != null || parsed.third != null)) {
                        parsed.first?.let { supabaseUrl = it }
                        parsed.second?.let { supabaseAnonKey = it }
                        parsed.third?.let { geminiApiKey = it }
                        isInitialized = true
                        context.showSnackbar("Đã nạp cấu hình từ file! Nhớ nhấn 'Lưu cấu hình' để hoàn tất.")
                    } else {
                        context.showSnackbar("Không tìm thấy thông tin cấu hình hợp lệ trong file!")
                    }
                } catch (e: Exception) {
                    context.showSnackbar("Không đọc được file: ${e.localizedMessage}")
                }
            }
        }
    }

    // Config file saver (Export)
    val fileSaverLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri: Uri? ->
        if (uri != null) {
            scope.launch {
                try {
                    val exportJson = org.json.JSONObject().apply {
                        put("supabaseUrl", supabaseUrl.trim())
                        put("supabaseAnonKey", supabaseAnonKey.trim())
                        put("geminiApiKey", geminiApiKey.trim())
                    }.toString(4)

                    val ok = withContext(Dispatchers.IO) {
                        try {
                            context.contentResolver.openOutputStream(uri)?.use { outputStream ->
                                outputStream.bufferedWriter().use { it.write(exportJson) }
                            }
                            true
                        } catch (e: Exception) {
                            false
                        }
                    }

                    if (ok) {
                        context.showSnackbar("Đã xuất cấu hình thành công! ✓")
                    } else {
                        context.showSnackbar("Lỗi xảy ra khi ghi file!")
                    }
                } catch (e: Exception) {
                    context.showSnackbar("Lỗi xuất cấu hình: ${e.localizedMessage}")
                }
            }
        }
    }

    var showSupabaseKey by remember { mutableStateOf(false) }
    var showGeminiKey by remember { mutableStateOf(false) }

    // Dropdown model state
    val modelOptions = listOf("gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "Tùy chỉnh (Nhập thủ công)")
    var dropdownExpanded by remember { mutableStateOf(false) }
    var selectedModelOption by remember(geminiModel) {
        mutableStateOf(
            if (geminiModel in listOf("gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro")) {
                geminiModel
            } else if (geminiModel.isNotBlank()) {
                "Tùy chỉnh (Nhập thủ công)"
            } else {
                "gemini-2.5-flash" // default
            }
        )
    }
    var customModelText by remember(geminiModel) {
        mutableStateOf(if (geminiModel !in listOf("gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro")) geminiModel else "")
    }

    var isTestingSupabase by remember { mutableStateOf(false) }

    KeyboardAwareScreen {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            text = "Cấu hình API & AI",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleLarge
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
                        containerColor = MaterialTheme.colorScheme.surface
                    )
                )
            },
            modifier = modifier
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Thiết lập endpoint kết nối máy chủ dữ liệu Supabase và khóa API Gemini cho tính năng AI bóc tách thông tin.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                // Quick Import/Export Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = "Thiết lập nhanh & Sao lưu cấu hình",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Text(
                            text = "Tải lên file cấu hình (.env hoặc .json) để tự động điền hoặc tải xuống cấu hình hiện tại làm file sao lưu.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Button(
                                onClick = { filePickerLauncher.launch(arrayOf("*/*")) },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary
                                ),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(imageVector = Icons.Default.FolderOpen, contentDescription = "Nhập file")
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Nhập file")
                            }
                            
                            Button(
                                onClick = {
                                    val defaultFileName = "bds_config.json"
                                    fileSaverLauncher.launch(defaultFileName)
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.secondary
                                ),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(imageVector = Icons.Default.CloudDownload, contentDescription = "Xuất file")
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Xuất file")
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Section 1: Supabase Configuration
                Text(
                    text = "SUPABASE CONFIGURATION",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )

                OutlinedTextField(
                    value = supabaseUrl,
                    onValueChange = { supabaseUrl = it },
                    label = { Text("Supabase URL") },
                    placeholder = { Text("https://your-project.supabase.co") },
                    leadingIcon = { Icon(imageVector = Icons.Default.Cloud, contentDescription = null) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("supabase_url_input")
                )

                OutlinedTextField(
                    value = supabaseAnonKey,
                    onValueChange = { supabaseAnonKey = it },
                    label = { Text("Supabase Anon Key") },
                    placeholder = { Text("your-anon-key") },
                    leadingIcon = { Icon(imageVector = Icons.Default.Key, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { showSupabaseKey = !showSupabaseKey }) {
                            Icon(
                                imageVector = if (showSupabaseKey) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                contentDescription = if (showSupabaseKey) "Ẩn" else "Hiện"
                            )
                        }
                    },
                    visualTransformation = if (showSupabaseKey) VisualTransformation.None else PasswordVisualTransformation(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                    modifier = Modifier.fillMaxWidth().testTag("supabase_key_input")
                )

                Button(
                    onClick = {
                        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
                            context.showSnackbar("Vui lòng nhập đầy đủ Supabase URL & Key trước khi test!")
                            return@Button
                        }
                        scope.launch {
                            isTestingSupabase = true
                            context.showSnackbar("Đang kiểm tra kết nối Supabase...")
                            val ok = viewModel.testSupabaseConnection(supabaseUrl.trim(), supabaseAnonKey.trim())
                            isTestingSupabase = false
                            if (ok) {
                                context.showSnackbar("Kết nối Supabase thành công! ✓")
                            } else {
                                context.showSnackbar("Kết nối Supabase thất bại! Vui lòng kiểm tra lại cấu hình hoặc mạng.")
                            }
                        }
                    },
                    enabled = !isTestingSupabase,
                    colors = ButtonDefaults.outlinedButtonColors(),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.align(Alignment.End)
                ) {
                    if (isTestingSupabase) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(imageVector = Icons.Default.NetworkCheck, contentDescription = null, modifier = Modifier.size(16.dp))
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Kiểm tra kết nối Supabase")
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Section 2: Gemini Configuration
                Text(
                    text = "GEMINI AI CONFIGURATION",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )

                OutlinedTextField(
                    value = geminiApiKey,
                    onValueChange = { geminiApiKey = it },
                    label = { Text("Gemini API Key") },
                    placeholder = { Text("AIzaSy...") },
                    leadingIcon = { Icon(imageVector = Icons.Default.Key, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { showGeminiKey = !showGeminiKey }) {
                            Icon(
                                imageVector = if (showGeminiKey) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                contentDescription = if (showGeminiKey) "Ẩn" else "Hiện"
                            )
                        }
                    },
                    visualTransformation = if (showGeminiKey) VisualTransformation.None else PasswordVisualTransformation(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() }),
                    modifier = Modifier.fillMaxWidth().testTag("gemini_config_key_input")
                )

                // Gemini Model Dropdown Select
                ExposedDropdownMenuBox(
                    expanded = dropdownExpanded,
                    onExpandedChange = { dropdownExpanded = it }
                ) {
                    OutlinedTextField(
                        value = selectedModelOption,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Mô hình Gemini (Model)") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor(),
                        colors = OutlinedTextFieldDefaults.colors()
                    )
                    ExposedDropdownMenu(
                        expanded = dropdownExpanded,
                        onDismissRequest = { dropdownExpanded = false }
                    ) {
                        modelOptions.forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option) },
                                onClick = {
                                    selectedModelOption = option
                                    dropdownExpanded = false
                                }
                            )
                        }
                    }
                }

                if (selectedModelOption == "Tùy chỉnh (Nhập thủ công)") {
                    OutlinedTextField(
                        value = customModelText,
                        onValueChange = { customModelText = it },
                        label = { Text("Nhập tên mô hình tùy chọn") },
                        placeholder = { Text("gemini-2.5-pro") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.align(Alignment.End)
                ) {
                    Button(
                        onClick = {
                            if (geminiApiKey.isBlank()) {
                                context.showSnackbar("Vui lòng nhập API Key Gemini trước khi test!")
                                return@Button
                            }
                            context.showSnackbar("Đang kiểm tra API Key Gemini...")
                            viewModel.checkApiKey(geminiApiKey.trim()) { valid ->
                                if (valid) {
                                    context.showSnackbar("API Key Gemini hợp lệ! ✓")
                                } else {
                                    context.showSnackbar("API Key không hợp lệ hoặc hết hạn!")
                                }
                            }
                        },
                        enabled = !isCheckingApiKey,
                        colors = ButtonDefaults.outlinedButtonColors(),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        if (isCheckingApiKey) {
                            CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(imageVector = Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Kiểm tra API Key")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        focusManager.clearFocus()
                        if (supabaseUrl.isBlank() || supabaseAnonKey.isBlank()) {
                            context.showSnackbar("Vui lòng nhập đầy đủ URL và Key của Supabase")
                            return@Button
                        }

                        val targetModel = if (selectedModelOption == "Tùy chỉnh (Nhập thủ công)") {
                            customModelText.trim()
                        } else {
                            selectedModelOption
                        }

                        if (targetModel.isBlank()) {
                            context.showSnackbar("Vui lòng chọn hoặc nhập tên mô hình AI")
                            return@Button
                        }

                        // Save API credentials
                        viewModel.saveApiConfig(
                            supabaseUrl = supabaseUrl.trim(),
                            supabaseAnonKey = supabaseAnonKey.trim(),
                            geminiKey = geminiApiKey.trim()
                        ) { success ->
                            if (success) {
                                viewModel.saveGeminiModel(targetModel)
                                context.showSnackbar("Đã lưu cấu hình thành công ✓")
                                onNavigateBack()
                            } else {
                                context.showSnackbar("Lỗi xảy ra khi lưu cấu hình!")
                            }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(50.dp)
                        .testTag("save_config_button"),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(imageVector = Icons.Default.Save, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Lưu cấu hình",
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.titleMedium
                    )
                }
            }
        }
    }
}
