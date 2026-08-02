package com.example.ui.settings
import com.example.BuildConfig

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.model.toUnverified
import com.example.domain.model.toProperty
import com.example.domain.model.PropertyStatus
import com.example.ui.common.AppLogger
import com.example.data.remote.supabase.SupabaseTestHelper
import com.example.ui.common.SettingsManager
import com.example.ui.common.ZipHelper
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import javax.inject.Inject
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.OneTimeWorkRequestBuilder
import android.os.Build
import android.content.Intent
import com.example.SyncForegroundService
import com.example.ui.common.SyncScheduler
import com.example.domain.usecase.sync.SyncMediaUseCase
import com.example.domain.usecase.sync.SyncSingleCustomerUseCase
import com.example.domain.usecase.sync.SyncTextUseCase
import com.example.data.remote.drive.DriveAccountInfoProvider
import com.example.data.remote.drive.DriveAuthorizationProvider
import com.example.data.remote.drive.DriveAuthorizationResult
import com.example.data.remote.drive.DriveHelper
import com.example.domain.model.ApiConfig
import com.example.domain.repository.ApiConfigRepository

private fun Double?.safe(): Double = if (this == null || this.isNaN() || this.isInfinite()) 0.0 else this
private fun Float?.safe(): Double = if (this == null || this.isNaN() || this.isInfinite()) 0.0 else this.toDouble()

private fun JSONObject.optSafeDouble(key: String, default: Double): Double {
    val value = this.optDouble(key, default)
    return if (value.isNaN() || value.isInfinite()) default else value
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    val settingsManager: SettingsManager,
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val syncScheduler: SyncScheduler,
    private val syncMediaUseCase: SyncMediaUseCase,
    private val syncSingleCustomerUseCase: SyncSingleCustomerUseCase,
    private val syncTextUseCase: SyncTextUseCase,
    private val driveHelper: DriveHelper,
    private val driveAuthorizationProvider: DriveAuthorizationProvider,
    private val driveAccountInfoProvider: DriveAccountInfoProvider,
    private val supabaseTestHelper: SupabaseTestHelper,
    private val apiConfigRepository: ApiConfigRepository,
    @param:ApplicationContext private val context: Context,
    val networkStateObserver: com.example.ui.common.NetworkStateObserver,
    private val realtimeSyncManager: com.example.data.remote.supabase.RealtimeSyncManager,
    private val findOrphanDriveFoldersUseCase: com.example.domain.usecase.media.FindOrphanDriveFoldersUseCase
) : ViewModel() {

    private val TAG = "SettingsViewModel"

    val apiConfig: StateFlow<ApiConfig> = apiConfigRepository.getConfig()
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = ApiConfig("", "")
        )

    private val _geminiApiKey = MutableStateFlow(settingsManager.geminiApiKey)
    val geminiApiKey = _geminiApiKey.asStateFlow()

    private val _geminiModel = MutableStateFlow(settingsManager.geminiModel)
    val geminiModel = _geminiModel.asStateFlow()

    private val _promptTemplate = MutableStateFlow(settingsManager.promptTemplate)
    val promptTemplate = _promptTemplate.asStateFlow()

    private val _googleEmail = MutableStateFlow(settingsManager.googleEmail)
    val googleEmail = _googleEmail.asStateFlow()

    private val _googleName = MutableStateFlow(settingsManager.googleName)
    val googleName = _googleName.asStateFlow()

    private val _isBackingUp = MutableStateFlow(false)
    val isBackingUp = _isBackingUp.asStateFlow()

    private val isMediaRestoreRunning = WorkManager.getInstance(context)
        .getWorkInfosForUniqueWorkFlow("MediaRestoreWork")
        .map { workInfos ->
            workInfos.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }
        }

    val isRestoreWorkerRunning: StateFlow<Boolean> = isMediaRestoreRunning.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = false
    )

    val isGoogleDriveSyncing: StateFlow<Boolean> = combine(
        SyncForegroundService.isRunning,
        isRestoreWorkerRunning
    ) { serviceRunning, workerRunning ->
        serviceRunning || workerRunning
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = false
    )

    private val _lastSyncStatus = MutableStateFlow("")
    val lastSyncStatus = _lastSyncStatus.asStateFlow()

    private val _lastRestoreStatus = MutableStateFlow("")
    val lastRestoreStatus = _lastRestoreStatus.asStateFlow()

    private val _lastZipExportTime = MutableStateFlow("")
    val lastZipExportTime = _lastZipExportTime.asStateFlow()

    private val _lastZipImportTime = MutableStateFlow("")
    val lastZipImportTime = _lastZipImportTime.asStateFlow()

    private val _autoSyncEnabled = MutableStateFlow(settingsManager.autoSyncEnabled)
    val autoSyncEnabled = _autoSyncEnabled.asStateFlow()

    private val _autoSyncTimes = MutableStateFlow(syncScheduler.getTimesList())
    val autoSyncTimes = _autoSyncTimes.asStateFlow()

    private val _defaultPropertyType = MutableStateFlow(settingsManager.defaultPropertyType)
    val defaultPropertyType = _defaultPropertyType.asStateFlow()

    private val _defaultStatus = MutableStateFlow(settingsManager.defaultStatus)
    val defaultStatus = _defaultStatus.asStateFlow()

    private val _rememberLastFilter = MutableStateFlow(settingsManager.rememberLastFilter)
    val rememberLastFilter = _rememberLastFilter.asStateFlow()

    private val _wifiOnlyForMediaRestore = MutableStateFlow(settingsManager.wifiOnlyForMediaRestore)
    val wifiOnlyForMediaRestore = _wifiOnlyForMediaRestore.asStateFlow()

    fun setWifiOnlyForMediaRestore(enabled: Boolean) {
        settingsManager.wifiOnlyForMediaRestore = enabled
        _wifiOnlyForMediaRestore.value = enabled
        if (BuildConfig.DEBUG) {
            AppLogger.log("MediaRestore", if (enabled) "Bật: chỉ tải ảnh qua Wi-Fi" else "Tắt: cho phép tải ảnh qua dữ liệu di động")
        }
    }

    private val _mapMinZoomScope = MutableStateFlow(settingsManager.mapMinZoomScope)
    val mapMinZoomScope = _mapMinZoomScope.asStateFlow()

    fun setMapMinZoomScope(scope: com.example.ui.common.MapZoomScope) {
        settingsManager.mapMinZoomScope = scope.key
        _mapMinZoomScope.value = scope.key
        if (BuildConfig.DEBUG) {
            AppLogger.log("Map", "Đặt mức thu nhỏ tối đa bản đồ: ${scope.displayName} (minZoom=${scope.minZoom})")
        }
    }

    private val _mapDefaultRadius = MutableStateFlow(settingsManager.mapDefaultRadius)
    val mapDefaultRadius = _mapDefaultRadius.asStateFlow()

    fun setMapDefaultRadius(radiusDefault: com.example.ui.common.MapRadiusDefault) {
        settingsManager.mapDefaultRadius = radiusDefault.key
        _mapDefaultRadius.value = radiusDefault.key
        if (BuildConfig.DEBUG) {
            AppLogger.log("Map", "Đặt bán kính quét mặc định bản đồ: ${radiusDefault.displayName}")
        }
    }

    fun toggleRememberLastFilter(enabled: Boolean) {
        settingsManager.rememberLastFilter = enabled
        _rememberLastFilter.value = enabled
        if (!enabled) {
            settingsManager.lastFilterJson = ""   // tắt → xóa filter đã lưu
        }
        if (BuildConfig.DEBUG) {
            AppLogger.log("Filter", if (enabled) "Bật nhớ bộ lọc lần cuối" else "Tắt nhớ bộ lọc lần cuối")
        }
    }

    val fabOnLeft = settingsManager.fabOnLeftFlow

    fun setFabOnLeft(enabled: Boolean) {
        settingsManager.fabOnLeft = enabled
        if (BuildConfig.DEBUG) {
            AppLogger.log("Settings", if (enabled) "Đặt nút nổi (FAB) bên Trái" else "Đặt nút nổi (FAB) bên Phải")
        }
    }

    fun updateDefaultFilter(propertyType: String, status: String) {
        settingsManager.defaultPropertyType = propertyType
        settingsManager.defaultStatus = status
        _defaultPropertyType.value = propertyType
        _defaultStatus.value = status
        if (BuildConfig.DEBUG) {
            AppLogger.log("Settings", "Đã cập nhật bộ lọc mặc định: Loại = ${if (propertyType.isEmpty()) "Tất cả" else propertyType}, Trạng thái = ${if (status.isEmpty()) "Tất cả" else status}")
        }
    }

    fun toggleAutoSync(enabled: Boolean) {
        settingsManager.autoSyncEnabled = enabled
        _autoSyncEnabled.value = enabled
        if (enabled) {
            syncScheduler.scheduleAll()
            if (BuildConfig.DEBUG) {
                AppLogger.log("AutoSync", "Đã bật tự động đồng bộ và lập lịch cho các mốc giờ.")
            }
        } else {
            syncScheduler.cancelAll()
            if (BuildConfig.DEBUG) {
                AppLogger.log("AutoSync", "Đã tắt tự động đồng bộ.")
            }
        }
    }

    fun addAutoSyncTime(time: String) {
        val currentList = _autoSyncTimes.value.toMutableList()
        if (currentList.contains(time)) return
        if (currentList.size >= 5) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("AutoSync", "Chỉ được cấu hình tối đa 5 mốc giờ tự động đồng bộ.")
            }
            return
        }
        currentList.add(time)
        currentList.sort()
        syncScheduler.saveTimesList(currentList)
        _autoSyncTimes.value = currentList
        if (settingsManager.autoSyncEnabled) {
            syncScheduler.scheduleOne(time)
        }
        if (BuildConfig.DEBUG) {
            AppLogger.log("AutoSync", "Đã thêm mốc giờ đồng bộ tự động: $time")
        }
    }

    fun deleteAutoSyncTime(time: String) {
        val currentList = _autoSyncTimes.value.toMutableList()
        if (currentList.remove(time)) {
            syncScheduler.saveTimesList(currentList)
            _autoSyncTimes.value = currentList
            syncScheduler.cancelOne(time)
            if (BuildConfig.DEBUG) {
                AppLogger.log("AutoSync", "Đã xoá mốc giờ đồng bộ tự động: $time")
            }
        }
    }

    fun refreshSyncStatus() {
        val prefs = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
        _lastSyncStatus.value = prefs.getString("last_sync_status", "Chưa từng đồng bộ") ?: "Chưa từng đồng bộ"
        _lastRestoreStatus.value = prefs.getString("last_restore_status", "Chưa từng khôi phục") ?: "Chưa từng khôi phục"
        _lastZipExportTime.value = prefs.getString("last_zip_export_time", "Chưa từng xuất") ?: "Chưa từng xuất"
        _lastZipImportTime.value = prefs.getString("last_zip_import_time", "Chưa từng nhập") ?: "Chưa từng nhập"
    }

    init {
        refreshSyncStatus()
        viewModelScope.launch {
            isGoogleDriveSyncing.collect { syncing ->
                if (!syncing) {
                    refreshSyncStatus()
                }
            }
        }
        // One-time Gemini API Key migration from legacy DataStore to SettingsManager
        viewModelScope.launch {
            try {
                apiConfigRepository.readLegacyGeminiKey()?.let { savedKey ->
                    if (settingsManager.geminiApiKey.isBlank()) {
                        settingsManager.geminiApiKey = savedKey
                        _geminiApiKey.value = savedKey
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Migrated Gemini API Key from DataStore to secure settings.")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error migrating Gemini key", e)
            }
        }
    }

    private val _isCheckingApiKey = MutableStateFlow(false)
    val isCheckingApiKey = _isCheckingApiKey.asStateFlow()

    fun checkApiKey(key: String, onResult: (Boolean) -> Unit) {
        _isCheckingApiKey.value = true
        viewModelScope.launch {
            val result = com.example.data.remote.gemini.GeminiApi.validateApiKey(key)
            _isCheckingApiKey.value = false
            onResult(result)
        }
    }

    fun triggerParallelSync() {
        if (isGoogleDriveSyncing.value) {
            viewModelScope.launch {
                _toastMessage.emit("Đang có tiến trình đồng bộ hoặc khôi phục khác đang chạy!")
            }
            return
        }
        val email = settingsManager.googleEmail
        if (email.isBlank() || !driveHelper.isAuthorized()) {
            viewModelScope.launch {
                _toastMessage.emit("Lỗi: Bạn chưa đăng nhập Google!")
            }
            return
        }

        // 1. Start Push Service (SyncForegroundService)
        try {
            val intent = Intent(context, SyncForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã khởi chạy SyncForegroundService để đẩy dữ liệu lên...")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start SyncForegroundService", e)
        }

        // 2. Start Pull Work Chain (WorkManager)
        try {
            val restoreSupabaseRequest = OneTimeWorkRequestBuilder<com.example.data.worker.CustomerRestoreFromSupabaseWorker>().build()
            val pullSupabaseRequest = OneTimeWorkRequestBuilder<com.example.data.worker.PropertyUnverifiedPullWorker>().build()
            val mediaNetworkType = if (settingsManager.wifiOnlyForMediaRestore) androidx.work.NetworkType.UNMETERED else androidx.work.NetworkType.CONNECTED
            val mediaConstraints = androidx.work.Constraints.Builder()
                .setRequiredNetworkType(mediaNetworkType)
                .build()
            val workRequest = OneTimeWorkRequestBuilder<com.example.data.worker.MediaRestoreWorker>()
                .addTag("MediaRestoreWorker")
                .setConstraints(mediaConstraints)
                .build()
            WorkManager.getInstance(context)
                .beginUniqueWork(
                    "MediaRestoreWork",
                    androidx.work.ExistingWorkPolicy.KEEP,
                    restoreSupabaseRequest
                )
                .then(pullSupabaseRequest)
                .then(workRequest)
                .enqueue()
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã lên lịch chuỗi Worker khôi phục/tải xuống dữ liệu...")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to enqueue pull workers", e)
        }

        viewModelScope.launch {
            _toastMessage.emit("Bắt đầu đồng bộ hai chiều (đẩy & kéo) song song...")
        }
    }

    private val _isRestoring = MutableStateFlow(false)
    val isRestoring = _isRestoring.asStateFlow()

    private val _zipProgressStatus = MutableStateFlow("")
    val zipProgressStatus = _zipProgressStatus.asStateFlow()

    private val _toastMessage = MutableSharedFlow<String>()
    val toastMessage = _toastMessage.asSharedFlow()

    val logs: StateFlow<List<String>> = AppLogger.logs

    fun saveGeminiApiKey(key: String) {
        settingsManager.geminiApiKey = key
        _geminiApiKey.value = key
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Gemini API Key updated.")
        }
    }

    fun saveGeminiModel(model: String) {
        settingsManager.geminiModel = model
        _geminiModel.value = model
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Gemini Model updated: $model")
        }
    }

    fun savePromptTemplate(prompt: String) {
        settingsManager.promptTemplate = prompt
        _promptTemplate.value = prompt
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Custom AI Prompt Template updated.")
        }
    }

    suspend fun requestDriveAuthorization(): DriveAuthorizationResult {
        return driveAuthorizationProvider.requestAuthorization()
    }

    fun completeDriveAuthorization(intent: Intent?): DriveAuthorizationResult {
        return driveAuthorizationProvider.getAuthorizationResultFromIntent(intent)
    }

    suspend fun onDriveAuthorized(accessToken: String): Boolean {
        val accountInfo = driveAccountInfoProvider.fetchAccountInfo(accessToken)
        if (accountInfo != null && accountInfo.email.isNotBlank()) {
            driveHelper.clearAuthorizationCache()

            settingsManager.googleEmail = accountInfo.email
            settingsManager.googleName = accountInfo.name
            _googleEmail.value = accountInfo.email
            _googleName.value = accountInfo.name

            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Liên kết Google Drive thành công.")
            }
            return true
        } else {
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Không thể lấy thông tin tài khoản Google.")
            }
            return false
        }
    }

    fun signOutGoogle(onComplete: () -> Unit) {
        driveHelper.clearAuthorizationCache()
        settingsManager.googleEmail = ""
        settingsManager.googleName = ""
        _googleEmail.value = ""
        _googleName.value = ""
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Đã đăng xuất tài khoản Google.")
        }
        onComplete()
    }

    fun clearLogs() {
        AppLogger.clear()
    }

    suspend fun scanForInvalidDoubles() {
        try {
            var foundAny = false
            val properties = propertyRepository.getAllProperties()
            for (p in properties) {
                if (p.latitude != null && (p.latitude.isNaN() || p.latitude.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Property id=${p.id} field=latitude value=${p.latitude}")
                    }
                    foundAny = true
                }
                if (p.longitude != null && (p.longitude.isNaN() || p.longitude.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Property id=${p.id} field=longitude value=${p.longitude}")
                    }
                    foundAny = true
                }
                if (p.areaSize != null && (p.areaSize.isNaN() || p.areaSize.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Property id=${p.id} field=areaSize value=${p.areaSize}")
                    }
                    foundAny = true
                }
                if (p.price.isNaN() || p.price.isInfinite()) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Property id=${p.id} field=price value=${p.price}")
                    }
                    foundAny = true
                }
            }

            val unverified = propertyRepository.getAllUnverified().map { it.toUnverified() }
            for (u in unverified) {
                val uArea = u.area?.toDouble()
                if (uArea != null && (uArea.isNaN() || uArea.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=UnverifiedProperty id=${u.id} field=area value=${u.area}")
                    }
                    foundAny = true
                }
                val uPrice = u.price
                if (uPrice != null && (uPrice.isNaN() || uPrice.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=UnverifiedProperty id=${u.id} field=price value=${u.price}")
                    }
                    foundAny = true
                }
                val uLat = u.latitude
                if (uLat != null && (uLat.isNaN() || uLat.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=UnverifiedProperty id=${u.id} field=latitude value=${u.latitude}")
                    }
                    foundAny = true
                }
                val uLng = u.longitude
                if (uLng != null && (uLng.isNaN() || uLng.isInfinite())) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=UnverifiedProperty id=${u.id} field=longitude value=${u.longitude}")
                    }
                    foundAny = true
                }
            }

            val customers = customerRepository.getAllCustomers()
            for (c in customers) {
                if (c.priceMin.isNaN() || c.priceMin.isInfinite()) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Customer id=${c.id} field=priceMin value=${c.priceMin}")
                    }
                    foundAny = true
                }
                if (c.priceMax.isNaN() || c.priceMax.isInfinite()) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log("NAN_SCAN", "[NAN_SCAN] table=Customer id=${c.id} field=priceMax value=${c.priceMax}")
                    }
                    foundAny = true
                }
            }

            if (!foundAny) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log("NAN_SCAN", "[NAN_SCAN] Không tìm thấy giá trị NaN/Infinity nào trong DB.")
                }
            }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                AppLogger.log("NAN_SCAN", "Lỗi quét NaN: ${e.message}")
            }
        }
    }

    suspend fun testSupabaseConnection(url: String, anonKey: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val oldConfig = apiConfig.value
                apiConfigRepository.saveConfig(url, anonKey)
                val result = supabaseTestHelper.runConnectionTest()
                if (!result) {
                    apiConfigRepository.saveConfig(oldConfig.supabaseUrl, oldConfig.supabaseAnonKey)
                }
                result
            } catch (e: Exception) {
                false
            }
        }
    }

    fun exportBackupZip(destUri: Uri) {
        _isBackingUp.value = true
        _zipProgressStatus.value = "Đang quét và chuẩn bị dữ liệu..."
        viewModelScope.launch(Dispatchers.IO) {
            try {
                // Run diagnostic scan first
                scanForInvalidDoubles()

                _zipProgressStatus.value = "Đang thu thập thông tin từ cơ sở dữ liệu..."
                // 1. Collect all DB values to JSON arrays
                val properties = propertyRepository.getVerifiedProperties()
                val unverified = propertyRepository.getAllUnverified().map { it.toUnverified() }
                val customers = customerRepository.getAllCustomers()

                // (Mapping exactly as we do in text backup)
                val propertiesArray = JSONArray()
                properties.forEach { p ->
                    propertiesArray.put(JSONObject().apply {
                        put("id", p.id)
                        put("area", p.area)
                        put("latitude", p.latitude.safe())
                        put("longitude", p.longitude.safe())
                        put("imagePath", p.imagePath)
                        put("driveMediaIds", p.driveMediaIds)
                        put("documentUrl", p.documentUrl)
                        put("areaSize", p.areaSize.safe())
                        put("price", p.price.safe())
                        put("description", p.description)
                        put("status", p.status)
                        put("surveyDate", p.surveyDate)
                        put("direction", p.direction)
                        put("ownerName", p.ownerName)
                        put("ownerPhone", p.ownerPhone)
                        put("propertyType", p.propertyType)
                        put("needToViewToday", p.needToViewToday)
                        put("isDraft", p.isDraft)
                        put("diary", p.diary)
                        put("updatedAt", p.updatedAt)
                    })
                }

                val unverifiedArray = JSONArray()
                unverified.forEach { u ->
                    unverifiedArray.put(JSONObject().apply {
                        put("id", u.id)
                        put("rawText", u.rawText)
                        put("title", u.title)
                        put("address", u.address)
                        put("area", u.area.safe())
                        put("price", u.price.safe())
                        put("direction", u.direction)
                        put("ownerName", u.ownerName)
                        put("ownerPhone", u.ownerPhone)
                        put("propertyType", u.propertyType.name)
                        put("latitude", u.latitude.safe())
                        put("longitude", u.longitude.safe())
                        put("mapLink", u.mapLink)
                        put("mediaPaths", JSONArray(u.mediaPaths))
                        put("extractedBy", u.extractedBy.name)
                        put("isTextSynced", u.isTextSynced)
                        put("isMediaSynced", u.isMediaSynced)
                        put("createdAt", u.createdAt)
                        put("updatedAt", u.updatedAt)
                    })
                }

                val customersArray = JSONArray()
                customers.forEach { c ->
                    customersArray.put(JSONObject().apply {
                        put("id", c.id)
                        put("name", c.name)
                        put("nameNormalized", c.nameNormalized)
                        put("phone", c.phone)
                        put("demandType", c.demandType)
                        put("propertyType", c.propertyType)
                        put("demandAreas", c.demandAreas)
                        put("demandDirections", c.demandDirections)
                        put("priceMin", c.priceMin.safe())
                        put("priceMax", c.priceMax.safe())
                        put("note", c.note)
                        put("noteNormalized", c.noteNormalized)
                        put("role", c.role)
                        put("status", c.status)
                        put("avatarPath", c.avatarPath)
                        put("avatarDriveUrl", c.avatarDriveUrl)
                        put("updatedAt", c.updatedAt)
                        put("isSynced", c.isSynced)
                        put("isDeleted", c.isDeleted)
                    })
                }

                // Collect customer property links
                val customerLinksArray = JSONArray()
                customers.forEach { c ->
                    val links = customerRepository.getLinksForCustomer(c.id)
                    links.forEach { link ->
                        customerLinksArray.put(JSONObject().apply {
                            put("customerId", link.customerId)
                            put("propertyId", link.propertyId)
                            put("role", link.role)
                            put("viewDate", link.viewDate)
                            put("viewNote", link.viewNote)
                        })
                    }
                }

                // Collect local media paths
                val localImagePaths = mutableListOf<String>()
                properties.forEach { p ->
                    p.imagePath?.split("|||")?.forEach { path ->
                        if (path.isNotBlank()) localImagePaths.add(path)
                    }
                }
                unverified.forEach { u ->
                    u.mediaPaths.forEach { path ->
                        if (path.isNotBlank()) localImagePaths.add(path)
                    }
                }
                customers.forEach { c ->
                    if (!c.avatarPath.isNullOrBlank()) {
                        localImagePaths.add(c.avatarPath)
                    }
                }

                // 2. Collect Action Positions Settings
                val settingsObj = org.json.JSONObject()
                val allPrefs = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE).all
                allPrefs.forEach { (key, value) ->
                    if (key.startsWith("action_position_") && value is String) {
                        settingsObj.put(key, value)
                    }
                }
                val settingsJsonStr = settingsObj.toString()

                _zipProgressStatus.value = "Đang bắt đầu đóng gói sao lưu ZIP..."
                // 3. Create local temp ZIP file
                val tempZipFile = File(context.cacheDir, "bds_collector_backup.zip")
                val success = ZipHelper.exportToZip(
                    context = context,
                    propertiesJson = propertiesArray.toString(),
                    unverifiedJson = unverifiedArray.toString(),
                    customersJson = customersArray.toString(),
                    customerLinksJson = customerLinksArray.toString(),
                    imagePaths = localImagePaths,
                    destZipFile = tempZipFile,
                    settingsJson = settingsJsonStr,
                    onProgress = { status ->
                        _zipProgressStatus.value = status
                    }
                )

                if (success && tempZipFile.exists()) {
                    _zipProgressStatus.value = "Đang ghi tệp sao lưu..."
                    // 3. Write local ZIP to user-selected Uri
                    context.contentResolver.openOutputStream(destUri)?.use { outputStream ->
                        tempZipFile.inputStream().use { inputStream ->
                            inputStream.copyTo(outputStream)
                        }
                    }
                    _zipProgressStatus.value = "Xuất sao lưu ZIP thành công!"
                    val timeStr = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
                    context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                        .edit().putString("last_zip_export_time", timeStr).apply()
                    refreshSyncStatus()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Successfully exported ZIP backup file to external storage at $timeStr.")
                    }
                    _toastMessage.emit("Xuất sao lưu ZIP thành công ✓")
                } else {
                    _zipProgressStatus.value = "Lỗi: Xuất sao lưu ZIP thất bại!"
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "ZIP export failed during archiving.")
                    }
                    _toastMessage.emit("Lỗi: Xuất sao lưu ZIP thất bại!")
                }
            } catch (e: Exception) {
                _zipProgressStatus.value = "Lỗi: ${e.localizedMessage}"
                Log.e(TAG, "Error during ZIP export", e)
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "ZIP export failed: ${e.localizedMessage}")
                }
                _toastMessage.emit("Lỗi xuất sao lưu: ${e.localizedMessage}")
            } finally {
                _isBackingUp.value = false
            }
        }
    }

    fun importBackupZip(sourceUri: Uri) {
        _isRestoring.value = true
        _zipProgressStatus.value = "Đang chuẩn bị nhập dữ liệu từ tệp ZIP..."
        viewModelScope.launch(Dispatchers.IO) {
            try {
                _zipProgressStatus.value = "Đang sao chép tệp sao lưu vào bộ nhớ tạm..."
                // 1. Copy user chosen file to cache
                val tempZipFile = File(context.cacheDir, "temp_import_backup.zip")
                context.contentResolver.openInputStream(sourceUri)?.use { input ->
                    tempZipFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                _zipProgressStatus.value = "Đang giải nén tập tin..."
                // 2. Extract contents
                val result = ZipHelper.importFromZip(context, tempZipFile) { status ->
                    _zipProgressStatus.value = status
                }
                if (result != null) {
                    // 3. Parse and restore DB records
                    // Restore Properties
                    if (!result.propertiesJson.isNullOrBlank()) {
                        val arr = JSONArray(result.propertiesJson)
                        val total = arr.length()
                        for (i in 0 until total) {
                            _zipProgressStatus.value = "Đang khôi phục BĐS (${i + 1}/$total)..."
                            val obj = arr.getJSONObject(i)
                            val rawImagePath = obj.optString("imagePath", null)
                            val remappedImagePath = if (!rawImagePath.isNullOrBlank()) {
                                val imagesDir = File(context.filesDir, "bds_images")
                                rawImagePath.split("|||")
                                    .filter { it.isNotBlank() }
                                    .map { path ->
                                        val fileName = File(path).name
                                        File(imagesDir, fileName).absolutePath
                                    }
                                    .joinToString("|||")
                            } else {
                                null
                            }
                            
                            val prop = com.example.domain.model.Property(
                                id = obj.optString("id", java.util.UUID.randomUUID().toString()),
                                area = obj.optString("area", ""),
                                latitude = obj.optSafeDouble("latitude", 0.0),
                                longitude = obj.optSafeDouble("longitude", 0.0),
                                imagePath = remappedImagePath,
                                driveMediaIds = obj.optString("driveMediaIds", null)?.takeIf { it.isNotBlank() && it != "null" },
                                driveFolderId = obj.optString("driveFolderId", null)?.takeIf { it.isNotBlank() && it != "null" },
                                documentUrl = obj.optString("documentUrl", ""),
                                areaSize = obj.optSafeDouble("areaSize", 0.0),
                                price = obj.optSafeDouble("price", 0.0),
                                description = obj.optString("description", ""),
                                status = obj.optString("status", PropertyStatus.FOR_SALE.value),
                                surveyDate = obj.optString("surveyDate", java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())),
                                direction = obj.optString("direction", ""),
                                ownerName = obj.optString("ownerName", ""),
                                ownerPhone = obj.optString("ownerPhone", ""),
                                propertyType = obj.optString("propertyType", "Nhà"),
                                needToViewToday = obj.optBoolean("needToViewToday", false),
                                isDraft = obj.optBoolean("isDraft", false),
                                isTextSynced = obj.optBoolean("isTextSynced", false),
                                diary = obj.optString("diary", ""),
                                updatedAt = obj.optLong("updatedAt", System.currentTimeMillis()),
                                isDeleted = obj.optBoolean("isDeleted", false),
                                priceAtFolderCreation = if (obj.isNull("priceAtFolderCreation")) null else obj.optDouble("priceAtFolderCreation", 0.0).takeIf { !it.isNaN() },
                                rawText = obj.optString("rawText", ""),
                                propertyDetailJsonFileId = obj.optString("propertyDetailJsonFileId", null)?.takeIf { it.isNotBlank() && it != "null" },
                                txtFileId = obj.optString("txtFileId", null)?.takeIf { it.isNotBlank() && it != "null" }
                            )
                            propertyRepository.insertProperty(prop, fromSync = true)
                        }
                    }

                    // Restore Unverified Properties
                    if (!result.unverifiedJson.isNullOrBlank()) {
                        val arr = JSONArray(result.unverifiedJson)
                        val total = arr.length()
                        for (i in 0 until total) {
                            _zipProgressStatus.value = "Đang khôi phục tin thô (${i + 1}/$total)..."
                            val obj = arr.getJSONObject(i)
                            val mediaPathsList = mutableListOf<String>()
                            val mediaPathsJson = obj.optJSONArray("mediaPaths")
                            if (mediaPathsJson != null) {
                                val imagesDir = File(context.filesDir, "bds_images")
                                for (j in 0 until mediaPathsJson.length()) {
                                    val oldPath = mediaPathsJson.optString(j)
                                    if (!oldPath.isNullOrBlank()) {
                                        val fileName = File(oldPath).name
                                        mediaPathsList.add(File(imagesDir, fileName).absolutePath)
                                    }
                                }
                            }
                            
                            val extractedByStr = obj.optString("extractedBy", "MANUAL")
                            val extractedBy = try { 
                                com.example.domain.model.ExtractionType.valueOf(extractedByStr.uppercase()) 
                            } catch (e: Exception) { 
                                com.example.domain.model.ExtractionType.MANUAL 
                            }
                            
                            val propertyTypeStr = obj.optString("propertyType", "HOUSE")
                            val propertyType = if (propertyTypeStr.uppercase().contains("LAND") || propertyTypeStr.contains("ĐẤT")) {
                                com.example.domain.model.UnverifiedPropertyType.LAND
                            } else {
                                com.example.domain.model.UnverifiedPropertyType.HOUSE
                            }

                            val unv = com.example.domain.model.UnverifiedProperty(
                                id = obj.optString("id", java.util.UUID.randomUUID().toString()),
                                rawText = obj.optString("rawText", "Tin thô"),
                                title = obj.optString("title", null),
                                address = obj.optString("address", null),
                                area = if (obj.isNull("area") || obj.optDouble("area").isNaN()) null else obj.optDouble("area"),
                                price = if (obj.isNull("price") || obj.optDouble("price").isNaN()) null else obj.optDouble("price"),
                                direction = obj.optString("direction", null),
                                ownerName = obj.optString("ownerName", null),
                                ownerPhone = obj.optString("ownerPhone", null),
                                propertyType = propertyType,
                                latitude = if (obj.isNull("latitude") || obj.optDouble("latitude").isNaN()) null else obj.optDouble("latitude"),
                                longitude = if (obj.isNull("longitude") || obj.optDouble("longitude").isNaN()) null else obj.optDouble("longitude"),
                                mapLink = obj.optString("mapLink", null),
                                mediaPaths = mediaPathsList,
                                driveMediaIds = run {
                                    val list = mutableListOf<String>()
                                    val arr = obj.optJSONArray("driveMediaIds")
                                    if (arr != null) {
                                        for (idx in 0 until arr.length()) {
                                            list.add(arr.optString(idx, ""))
                                        }
                                    }
                                    list
                                },
                                extractedBy = extractedBy,
                                isTextSynced = obj.optBoolean("isTextSynced", false),
                                isMediaSynced = obj.optBoolean("isMediaSynced", false),
                                status = obj.optString("status", PropertyStatus.PENDING_SURVEY.value),
                                isDraft = obj.optBoolean("isDraft", false),
                                description = obj.optString("description", ""),
                                surveyDate = obj.optString("surveyDate", ""),
                                createdAt = obj.optLong("createdAt", System.currentTimeMillis()),
                                updatedAt = obj.optLong("updatedAt", System.currentTimeMillis()),
                                isDeleted = obj.optBoolean("isDeleted", false)
                            )
                            propertyRepository.insertUnverified(unv.toProperty())
                        }
                    }

                    // Restore Customers
                    if (!result.customersJson.isNullOrBlank()) {
                        val arr = JSONArray(result.customersJson)
                        val total = arr.length()
                        for (i in 0 until total) {
                            _zipProgressStatus.value = "Đang khôi phục Khách hàng (${i + 1}/$total)..."
                            val obj = arr.getJSONObject(i)
                            val rawAvatar = obj.optString("avatarPath", null)
                            val remappedAvatar = if (!rawAvatar.isNullOrBlank()) {
                                val imagesDir = File(context.filesDir, "bds_images")
                                val fileName = File(rawAvatar).name
                                File(imagesDir, fileName).absolutePath
                            } else {
                                null
                            }
                            val cust = com.example.domain.model.Customer(
                                id = obj.optString("id", java.util.UUID.randomUUID().toString()),
                                name = obj.optString("name", "Khách"),
                                phone = obj.optString("phone", ""),
                                demandType = obj.optString("demandType", "Cần mua"),
                                propertyType = obj.optString("propertyType", "Đất"),
                                demandAreas = obj.optString("demandAreas", ""),
                                demandDirections = obj.optString("demandDirections", ""),
                                priceMin = obj.optSafeDouble("priceMin", 0.0),
                                priceMax = obj.optSafeDouble("priceMax", 0.0),
                                note = obj.optString("note", ""),
                                role = obj.optString("role", "BUYER"),
                                status = obj.optString("status", "ACTIVE"),
                                avatarPath = remappedAvatar,
                                avatarDriveUrl = obj.optString("avatarDriveUrl", null)?.takeIf { it.isNotBlank() && it != "null" },
                                updatedAt = obj.optLong("updatedAt", System.currentTimeMillis()),
                                isSynced = obj.optBoolean("isSynced", false),
                                isDeleted = obj.optBoolean("isDeleted", false)
                            )
                            customerRepository.insertCustomer(cust)
                        }
                    }

                    // Restore Customer Property Links
                    if (!result.customerLinksJson.isNullOrBlank()) {
                        val arr = JSONArray(result.customerLinksJson)
                        val total = arr.length()
                        for (i in 0 until total) {
                            _zipProgressStatus.value = "Đang kết nối Khách hàng & BĐS (${i + 1}/$total)..."
                            val obj = arr.getJSONObject(i)
                            val customerId = obj.optString("customerId")
                            val propertyId = obj.optString("propertyId")
                            if (!customerId.isNullOrBlank() && !propertyId.isNullOrBlank()) {
                                customerRepository.insertCustomerPropertyLink(
                                    customerId = customerId,
                                    propertyId = propertyId,
                                    role = obj.optString("role", "OWNER"),
                                    viewDate = if (obj.isNull("viewDate")) null else obj.optString("viewDate", null),
                                    viewNote = if (obj.isNull("viewNote")) null else obj.optString("viewNote", null)
                                )
                            }
                        }
                    }

                    // Restore Settings (Action Positions)
                    if (!result.settingsJson.isNullOrBlank()) {
                        try {
                            _zipProgressStatus.value = "Đang cấu hình cài đặt hệ thống..."
                            val settingsObj = org.json.JSONObject(result.settingsJson)
                            val editor = context.getSharedPreferences("bds_collector_prefs", Context.MODE_PRIVATE).edit()
                            val keys = settingsObj.keys()
                            while (keys.hasNext()) {
                                val key = keys.next()
                                if (key.startsWith("action_position_")) {
                                    val value = settingsObj.getString(key)
                                    editor.putString(key, value)
                                }
                            }
                            editor.apply()
                            if (BuildConfig.DEBUG) {
                                AppLogger.log(TAG, "Restored action positions preferences from ZIP backup.")
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Lỗi phục hồi settings.json từ ZIP", e)
                        }
                    }

                    _zipProgressStatus.value = "Nhập sao lưu ZIP thành công!"
                    val timeStr = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
                    context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                        .edit().putString("last_zip_import_time", timeStr).apply()
                    refreshSyncStatus()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Restored all database records from ZIP backup successfully at $timeStr.")
                    }
                    _toastMessage.emit("Nhập sao lưu ZIP thành công ✓")
                } else {
                    _zipProgressStatus.value = "Lỗi: Giải nén ZIP thất bại hoặc file không hợp lệ!"
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "ZIP Restore failed - Unarchiving failed.")
                    }
                    _toastMessage.emit("Lỗi: Giải nén ZIP thất bại hoặc file không hợp lệ!")
                }
            } catch (e: Exception) {
                _zipProgressStatus.value = "Lỗi nhập sao lưu: ${e.localizedMessage}"
                Log.e(TAG, "Error during ZIP import", e)
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "ZIP Import failed: ${e.localizedMessage}")
                }
                _toastMessage.emit("Lỗi nhập sao lưu: ${e.localizedMessage}")
            } finally {
                _isRestoring.value = false
            }
        }
    }

    fun saveApiConfig(supabaseUrl: String, supabaseAnonKey: String, geminiKey: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                apiConfigRepository.saveConfig(supabaseUrl, supabaseAnonKey)
                settingsManager.geminiApiKey = geminiKey
                _geminiApiKey.value = geminiKey

                try {
                    realtimeSyncManager.stop()
                    realtimeSyncManager.start()
                    _toastMessage.emit("Đã áp dụng cấu hình và khởi động lại đồng bộ realtime.")
                } catch (e: Exception) {
                    Log.e(TAG, "Lỗi khi restart sync sau khi lưu API config", e)
                }

                onResult(true)
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi khi lưu API config", e)
                onResult(false)
            }
        }
    }

    fun getDefaultRegexJson(): String {
        return """{
  "REGEX_PHONE": "\\b0[35789](?:[.\\s-]*\\d){8}\\b",
  "REGEX_AREA": "(\\d+(?:[.,]\\d+)?)\\s*(m2|m²)",
  "REGEX_PRICE": "(\\d+(?:[.,]\\d+)?)\\s*(tỷ|ty|triệu|tr)",
  "MAP_LINK_PATTERN": "(https?://\\S*maps\\S*|https?://goo\\.gl/\\S*)"
}"""
    }

    fun getActiveRegexJson(): String {
        val custom = settingsManager.customExtractionRegex
        return if (custom.isNotBlank()) custom else getDefaultRegexJson()
    }

    fun validateRegexJson(jsonStr: String): Result<Unit> {
        return try {
            val json = org.json.JSONObject(jsonStr)
            val keys = listOf("REGEX_PHONE", "REGEX_AREA", "REGEX_PRICE", "MAP_LINK_PATTERN")
            for (key in keys) {
                if (json.has(key)) {
                    val patternStr = json.getString(key)
                    java.util.regex.Pattern.compile(patternStr)
                }
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun testRunRegex(text: String, jsonStr: String): com.example.domain.model.UnverifiedProperty {
        val knownAreas = propertyRepository.getAllDistinctAreas()
        return withContext(Dispatchers.Default) {
            com.example.domain.usecase.ai.PropertyTextExtractor.parseWithRegex(
                rawText = text,
                knownAreas = knownAreas,
                customRegexJson = jsonStr
            )
        }
    }

    fun saveCustomRegex(jsonStr: String) {
        settingsManager.customExtractionRegex = jsonStr
        if (BuildConfig.DEBUG) {
            AppLogger.log("Settings", "Đã cập nhật bộ regex bóc tách tùy chỉnh.")
        }
    }

    fun restoreDefaultRegex() {
        settingsManager.customExtractionRegex = ""
        if (BuildConfig.DEBUG) {
            AppLogger.log("Settings", "Đã khôi phục bộ regex bóc tách về mặc định.")
        }
    }

    private val _isScanningOrphanDriveFolders = MutableStateFlow(false)
    val isScanningOrphanDriveFolders: StateFlow<Boolean> = _isScanningOrphanDriveFolders.asStateFlow()

    fun scanAndMarkOrphanDriveFolders(onResult: (String) -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            // Bổ sung 1: Kiểm tra an toàn trước khi chạy — nếu còn bản ghi chưa đồng bộ thì ngắt ngay
            val unsynced = propertyRepository.getUnsyncedTextProperties()
            if (unsynced.isNotEmpty()) {
                withContext(Dispatchers.Main) {
                    onResult("⚠️ Còn ${unsynced.size} bản ghi chưa đồng bộ lên máy chủ. Vui lòng nhấn 'Đồng bộ ngay' trước khi dọn dẹp folder!")
                }
                return@launch
            }

            _isScanningOrphanDriveFolders.value = true
            try {
                val result = findOrphanDriveFoldersUseCase()
                val msg = if (result.error != null) {
                    "Lỗi khi dọn thư mục rác: ${result.error}"
                } else {
                    "Đã đánh dấu ${result.renamed} folder rác (ZZZ_MOCOI_), giữ nguyên ${result.skipped} folder."
                }
                withContext(Dispatchers.Main) {
                    onResult(msg)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onResult("Lỗi khi quét folder rác: ${e.message}")
                }
            } finally {
                _isScanningOrphanDriveFolders.value = false
            }
        }
    }
}
