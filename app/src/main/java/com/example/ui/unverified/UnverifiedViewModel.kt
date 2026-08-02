package com.example.ui.unverified
import com.example.BuildConfig

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.UnverifiedProperty
import com.example.domain.model.ExtractionType
import com.example.domain.model.Property
import com.example.domain.model.Customer
import com.example.domain.model.toUnverified
import com.example.domain.model.toProperty
import com.example.domain.model.PropertyStatus
import com.example.domain.repository.PropertyRepository
import com.example.domain.repository.CustomerRepository
import com.example.domain.usecase.ai.ExtractPropertyUseCase
import com.example.ui.common.AppLogger
import com.example.ui.common.SettingsManager
import com.example.ui.common.StringUtils
import com.example.ui.property.FilterState
import com.example.ui.property.PropertyFilter
import com.example.ui.property.SortType
import com.example.data.remote.gemini.GeminiApi
import com.example.data.remote.gemini.GeminiHelper
import android.widget.Toast
import com.google.android.gms.location.LocationServices
import com.example.util.GeoUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import com.example.SyncForegroundService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import org.json.JSONObject
import com.example.domain.model.getFolderName
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import javax.inject.Inject

data class PropertyCluster(
    val center: Property,
    val properties: List<Property>
)

enum class FieldState { EMPTY, AI_FILLED, USER_CONFIRMED }

sealed class SyncUiState {
    object Idle : SyncUiState()
    object Loading : SyncUiState()
    data class Success(val message: String) : SyncUiState()
    data class Error(val message: String) : SyncUiState()
}

sealed class MediaDownloadUiState {
    object Idle : MediaDownloadUiState()
    object Loading : MediaDownloadUiState()
    data class Success(val count: Int) : MediaDownloadUiState()
    data class Error(val message: String) : MediaDownloadUiState()
}

@HiltViewModel
class UnverifiedViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val extractPropertyUseCase: ExtractPropertyUseCase,
    private val settingsManager: SettingsManager,
    private val geminiHelper: GeminiHelper,
    private val customerRepository: CustomerRepository,
    private val syncSinglePropertyUseCase: com.example.domain.usecase.sync.SyncSinglePropertyUseCase,
    private val driveHelper: com.example.data.remote.drive.DriveHelper,
    private val prepareImageUseCase: com.example.domain.usecase.media.PrepareImageUseCase,
    @ApplicationContext private val context: Context,
    private val restoreMissingMediaUseCase: com.example.domain.usecase.media.RestoreMissingMediaUseCase,
    val networkStateObserver: com.example.ui.common.NetworkStateObserver,
    private val snackbarManager: com.example.ui.common.SnackbarManager
) : ViewModel() {

    private val TAG = "UnverifiedViewModel"
    private var unverifiedSyncJob: kotlinx.coroutines.Job? = null

    private val _syncState = MutableStateFlow<SyncUiState>(SyncUiState.Idle)
    val syncState: StateFlow<SyncUiState> = _syncState.asStateFlow()

    private val _mediaDownloadState = MutableStateFlow<MediaDownloadUiState>(MediaDownloadUiState.Idle)
    val mediaDownloadState: StateFlow<MediaDownloadUiState> = _mediaDownloadState.asStateFlow()

    fun syncSingleUnverified(id: String) {
        if (!networkStateObserver.isOnline.value) {
            _syncState.value = SyncUiState.Error("Không có kết nối mạng, vui lòng thử lại")
            return
        }
        if (!driveHelper.isAuthorized()) {
            _syncState.value = SyncUiState.Error("Vui lòng kết nối Google Drive trong phần Cài đặt trước.")
            return
        }
        viewModelScope.launch {
            _syncState.value = SyncUiState.Loading
            try {
                val result = syncSinglePropertyUseCase(id)
                if (result.mediaSuccess && result.textFileSuccess) {
                    _syncState.value = SyncUiState.Success("Đã sao lưu ✓")
                } else {
                    _syncState.value = SyncUiState.Error("Sao lưu thất bại: ${result.errorMessage ?: "Lỗi không xác định"}")
                }
            } catch (e: Exception) {
                _syncState.value = SyncUiState.Error("Sao lưu thất bại: ${e.localizedMessage}")
            }
        }
    }

    fun resetSyncState() {
        _syncState.value = SyncUiState.Idle
    }

    fun downloadUnverifiedImages(unverifiedId: String) {
        if (!networkStateObserver.isOnline.value) {
            _mediaDownloadState.value = MediaDownloadUiState.Error("Không có kết nối mạng, vui lòng thử lại")
            return
        }
        viewModelScope.launch {
            _mediaDownloadState.value = MediaDownloadUiState.Loading
            try {
                val count = restoreMissingMediaUseCase.downloadSingleUnverifiedImages(unverifiedId)
                _mediaDownloadState.value = MediaDownloadUiState.Success(count)
            } catch (e: Exception) {
                _mediaDownloadState.value = MediaDownloadUiState.Error(e.localizedMessage ?: "Lỗi không xác định")
            }
        }
    }

    fun resetMediaDownloadState() {
        _mediaDownloadState.value = MediaDownloadUiState.Idle
    }

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    private val _filterState = MutableStateFlow(FilterState())
    val filterState = _filterState.asStateFlow()

    private val _recentAreas = MutableStateFlow<List<String>>(emptyList())
    val recentAreas = _recentAreas.asStateFlow()

    val areaSuggestions: StateFlow<List<String>> = propertyRepository.getAllDistinctAreasFlow()
        .catch { e -> Log.e(TAG, "Failed to load area suggestions", e) }
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

    init {
        _recentAreas.value = settingsManager.getRecentAreas()
    }

    val geminiApiKey: String get() = settingsManager.geminiApiKey

    private val _pastedText = MutableStateFlow("")
    val pastedText = _pastedText.asStateFlow()

    private val _isExtracting = MutableStateFlow(false)
    val isExtracting = _isExtracting.asStateFlow()

    private val _extractionError = MutableStateFlow<String?>(null)
    val extractionError = _extractionError.asStateFlow()

    private val _fieldStates = MutableStateFlow<Map<String, FieldState>>(emptyMap())
    val fieldStates: StateFlow<Map<String, FieldState>> = _fieldStates.asStateFlow()

    suspend fun getCustomerByPhone(phone: String): Customer? {
        return customerRepository.getCustomerByPhone(phone)
    }

    fun initializeFieldStates(property: UnverifiedProperty) {
        val isAiRegex = (property.extractedBy == ExtractionType.AI || property.extractedBy == ExtractionType.REGEX)
        val states = mutableMapOf<String, FieldState>()
        
        val fields = listOf(
            "address" to (property.address ?: ""),
            "area" to (property.area?.toString() ?: ""),
            "price" to (property.price?.toString() ?: ""),
            "direction" to (property.direction ?: ""),
            "ownerName" to (property.ownerName ?: ""),
            "ownerPhone" to (property.ownerPhone ?: ""),
            "description" to property.description
        )
        
        for ((name, value) in fields) {
            if (value.isBlank()) {
                states[name] = FieldState.EMPTY
            } else if (isAiRegex) {
                states[name] = FieldState.AI_FILLED
            } else {
                states[name] = FieldState.USER_CONFIRMED
            }
        }
        _fieldStates.value = states
    }

    fun updateFieldState(fieldName: String, state: FieldState) {
        val current = _fieldStates.value.toMutableMap()
        current[fieldName] = state
        _fieldStates.value = current
    }

    // Flows declared above init block

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun updateFilter(filter: FilterState) {
        _filterState.value = filter
    }

    fun selectArea(area: String) {
        val trimmed = area.trim()
        if (trimmed.isBlank()) return
        settingsManager.addRecentArea(trimmed)
        _recentAreas.value = settingsManager.getRecentAreas()
        
        val currentAreas = _filterState.value.areas
        if (trimmed !in currentAreas) {
            updateFilter(_filterState.value.copy(areas = currentAreas + trimmed))
        }
    }

    fun resetFilter() {
        _filterState.value = FilterState()
    }

    private val rawUnverifiedProperties: StateFlow<List<Property>> = propertyRepository.getAllUnverifiedFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val unverifiedProperties: StateFlow<List<Property>> = combine(
        rawUnverifiedProperties,
        searchQuery,
        filterState
    ) { list, query, filter ->
        // SP chờ: status là cờ kỹ thuật (mặc định "Chờ khảo sát"), không phải thuộc tính
        // lọc theo. Xoá vế status để PropertyFilter bỏ qua bước 2 — nếu không, chip
        // "Đang bán"/"Đã bán" sẽ giấu mất 30/39 SP chờ mà KHÔNG có chip nào lấy lại.
        val filtered = list.filter { PropertyFilter.matches(it, filter.copy(statuses = emptySet()), query, todayOnly = false) }
        when (filter.sortBy) {
            SortType.NEWEST -> filtered.sortedByDescending { it.createdAt }
            SortType.PRICE_ASC -> filtered.sortedBy { it.price }
            SortType.PRICE_DESC -> filtered.sortedByDescending { it.price }
            SortType.SIZE -> filtered.sortedByDescending { it.areaSize ?: 0.0 }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val filteredCount: StateFlow<Int> = unverifiedProperties
        .map { it.size }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val distinctAreas: StateFlow<List<String>> = rawUnverifiedProperties
        .map { list -> list.map { StringUtils.toTitleCase(it.area) }.filter { it.isNotBlank() }.distinct().sorted() }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())


    fun setPastedText(text: String) {
        _pastedText.value = text
    }

    /**
     * Part 2: Extract information from raw text and save to Room.
     */
    fun extractAndSaveRawText(onResult: (ExtractionType) -> Unit = {}) {
        val text = _pastedText.value
        if (text.isBlank()) return

        _isExtracting.value = true
        _extractionError.value = null

        viewModelScope.launch {
            try {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Parsing raw text with Gemini/Regex...")
                }
                var unverifiedProperty = extractPropertyUseCase(
                    rawText = text,
                    apiKey = settingsManager.geminiApiKey,
                    model = settingsManager.geminiModel
                )
                // Ensure default values are filled
                unverifiedProperty = unverifiedProperty.copy(
                    status = PropertyStatus.PENDING_SURVEY.value,
                    surveyDate = "",
                    isDraft = false
                )
                
                propertyRepository.insertUnverified(unverifiedProperty.toProperty())
                _pastedText.value = ""
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Successfully extracted & saved unverified property: ${unverifiedProperty.title ?: "Thô"}")
                }
                initializeFieldStates(unverifiedProperty)
                onResult(unverifiedProperty.extractedBy)
            } catch (e: Exception) {
                _extractionError.value = "Bóc tách thất bại: ${e.localizedMessage}"
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error parsing text: ${e.localizedMessage}")
                }
                onResult(ExtractionType.MANUAL)
            } finally {
                _isExtracting.value = false
            }
        }
    }

    fun parseRawTextAndFill(rawText: String, onCompleted: (UnverifiedProperty) -> Unit) {
        _isExtracting.value = true
        _extractionError.value = null
        viewModelScope.launch {
            try {
                val unverifiedProperty = extractPropertyUseCase(
                    rawText = rawText,
                    apiKey = settingsManager.geminiApiKey,
                    model = settingsManager.geminiModel
                )
                initializeFieldStates(unverifiedProperty)
                onCompleted(unverifiedProperty)
            } catch (e: Exception) {
                _extractionError.value = "Bóc tách thất bại: ${e.localizedMessage}"
                onCompleted(UnverifiedProperty(rawText = rawText, title = "", extractedBy = ExtractionType.MANUAL))
            } finally {
                _isExtracting.value = false
            }
        }
    }

    fun parseWithAI(context: Context, rawText: String, onCompleted: (UnverifiedProperty?) -> Unit) {
        val apiKey = settingsManager.geminiApiKey
        if (apiKey.isBlank() || apiKey == "MY_GEMINI_API_KEY") {
            snackbarManager.showSnackbar("API Key trống hoặc không hợp lệ. Vui lòng cấu hình trong Cài đặt.")
            onCompleted(null)
            return
        }

        _isExtracting.value = true
        _extractionError.value = null
        viewModelScope.launch {
            try {
                val unverifiedProperty = geminiHelper.parseWithAI(
                    rawText = rawText,
                    apiKey = apiKey,
                    model = settingsManager.geminiModel
                )
                initializeFieldStates(unverifiedProperty)
                onCompleted(unverifiedProperty)
            } catch (e: Exception) {
                _extractionError.value = "Bóc tách AI thất bại: ${e.localizedMessage}"
                withContext(Dispatchers.Main) {
                    snackbarManager.showSnackbar("Bóc tách AI thất bại: ${e.localizedMessage}")
                }
                onCompleted(null)
            } finally {
                _isExtracting.value = false
            }
        }
    }

    fun parseWithRegex(rawText: String, onCompleted: (UnverifiedProperty) -> Unit) {
        viewModelScope.launch {
            val knownAreas = propertyRepository.getAllDistinctAreas()
            val unverifiedProperty = geminiHelper.parseWithRegex(rawText, knownAreas)
            initializeFieldStates(unverifiedProperty)
            onCompleted(unverifiedProperty)
        }
    }

    /**
     * Part 3: Resolve short maps link and parse coordinates.
     */
    fun resolveMapLinkCoordinates(unverifiedId: String, mapLink: String, onCompleted: (Double?, Double?) -> Unit) {
        viewModelScope.launch {
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Resolving map link: $mapLink")
            }
            val coords = GeminiApi.resolveAndExtractLocation(mapLink)
            if (coords != null) {
                val current = propertyRepository.getUnverifiedById(unverifiedId)?.toUnverified()
                if (current != null) {
                    val updated = current.copy(
                        latitude = coords.first,
                        longitude = coords.second,
                        updatedAt = System.currentTimeMillis()
                    )
                    propertyRepository.updateUnverified(updated.toProperty())
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Successfully resolved coords to: ${coords.first}, ${coords.second}")
                    }
                }
                onCompleted(coords.first, coords.second)
            } else {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Failed to resolve coordinates from map link.")
                }
                onCompleted(null, null)
            }
        }
    }

    fun insertIfNotExists(item: UnverifiedProperty) {
        viewModelScope.launch {
            val exists = propertyRepository.getUnverifiedById(item.id) != null
            if (!exists) {
                propertyRepository.insertUnverified(item.toProperty())
            }
        }
    }

    /**
     * Part 4: Media Handling - Compress images and copy to /files/unverified/{id}/.
     */
    fun compressAndAddImages(unverifiedId: String, uris: List<Uri>, context: Context, item: UnverifiedProperty, onCompleted: () -> Unit = {}) {
        viewModelScope.launch(Dispatchers.IO) {
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "compressAndAddImages called. id=$unverifiedId, uris=${uris.size}")
            }

            var currentItem = propertyRepository.getUnverifiedById(unverifiedId)?.toUnverified()
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "getUnverifiedById result: ${if (currentItem == null) "NULL - chưa có trong DB" else "OK, mediaPaths=${currentItem.mediaPaths.size}"}")
            }

            if (currentItem == null) {
                propertyRepository.insertUnverified(item.toProperty())
                currentItem = item.copy(mediaPaths = emptyList(), driveMediaIds = emptyList())
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Inserted non-existent unverified item into database.")
                }
            }
            val updatedPaths = currentItem.mediaPaths.toMutableList()
            val targetDir = File(context.filesDir, "bds_images").apply { mkdirs() }

            for (uri in uris) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Processing uri: $uri")
                }
                if (updatedPaths.size >= 10) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Reached maximum 10 images limit.")
                    }
                    break
                }
                try {
                    val outputFile = File(targetDir, "IMG_${UUID.randomUUID().toString().take(8)}.jpg")
                    val result = prepareImageUseCase.execute(uri, outputFile, 2048, 80)
                    if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Success) {
                        updatedPaths.add(result.filePath)
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Saved image to: ${result.filePath}")
                        }
                    } else if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Failure) {
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "FAILED to process uri $uri: ${result.reason}")
                        }
                    }
                } catch (e: Exception) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "FAILED to process uri $uri: ${e.localizedMessage}")
                    }
                }
            }
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Done. Total paths: ${updatedPaths.size}")
            }

            val updatedDriveMediaIds = currentItem.driveMediaIds.toMutableList()
            while (updatedDriveMediaIds.size < updatedPaths.size) {
                updatedDriveMediaIds.add("")
            }

            val updatedItem = currentItem.copy(
                mediaPaths = updatedPaths,
                driveMediaIds = updatedDriveMediaIds,
                isMediaSynced = false,
                updatedAt = System.currentTimeMillis()
            )
            propertyRepository.updateUnverified(updatedItem.toProperty())
            withContext(Dispatchers.Main) {
                scheduleUnverifiedSync(updatedItem.id)
                onCompleted()
            }
        }
    }

    fun removeImage(unverifiedId: String, path: String) {
        viewModelScope.launch(Dispatchers.IO) {
            val currentItem = propertyRepository.getUnverifiedById(unverifiedId)?.toUnverified() ?: return@launch
            val updatedPaths = currentItem.mediaPaths.toMutableList()
            val index = updatedPaths.indexOf(path)
            if (index != -1) {
                updatedPaths.removeAt(index)
                val updatedDriveMediaIds = currentItem.driveMediaIds.toMutableList()
                if (index < updatedDriveMediaIds.size) {
                    updatedDriveMediaIds.removeAt(index)
                }
                try {
                    val file = File(path)
                    if (file.exists()) {
                        file.delete()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to delete local file", e)
                }
                val updatedItem = currentItem.copy(
                    mediaPaths = updatedPaths,
                    driveMediaIds = updatedDriveMediaIds,
                    isMediaSynced = false,
                    updatedAt = System.currentTimeMillis()
                )
                propertyRepository.updateUnverified(updatedItem.toProperty())
                withContext(Dispatchers.Main) {
                    scheduleUnverifiedSync(updatedItem.id)
                }
            }
        }
    }

    /**
     * Part 5: Save/Draft unverified property.
     */
    private fun scheduleUnverifiedSync(unverifiedId: String) {
        unverifiedSyncJob?.cancel()
        unverifiedSyncJob = viewModelScope.launch {
            kotlinx.coroutines.delay(2000L) // Chờ 2s của khoảng lặng trước khi đồng bộ
            triggerUnverifiedSync(unverifiedId)
        }
    }

    private fun triggerUnverifiedSync(unverifiedId: String) {
        try {
            val intent = android.content.Intent(context, SyncForegroundService::class.java).apply {
                putExtra("UNVERIFIED_ID", unverifiedId)
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Lỗi khởi chạy SyncForegroundService cho unverifiedId $unverifiedId", e)
        }
    }

    /**
     * Part 6: Delete unverified property record + files.
     */
    fun deleteUnverifiedAndFiles(id: String, context: Context) {
        viewModelScope.launch(Dispatchers.IO) {
            val current = propertyRepository.getUnverifiedById(id)?.toUnverified()
            propertyRepository.softDeleteUnverified(id, System.currentTimeMillis())
            if (current != null) {
                for (path in current.mediaPaths) {
                    try {
                        val file = File(path)
                        if (file.exists()) {
                            file.delete()
                            if (BuildConfig.DEBUG) {
                                AppLogger.log(TAG, "Deleted local file: $path")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to delete local file: $path", e)
                    }
                }
            }
        }
    }

    fun deleteUnverified(id: String) {
        // Kept for backward compatibility
        viewModelScope.launch {
            propertyRepository.softDeleteUnverified(id, System.currentTimeMillis())
        }
    }

    /**
     * Part 6: Haversine distance calculator.
     */
    fun calculateDistanceInKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0 // Earth radius in km
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
        val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return r * c
    }

    /**
     * Part 6: GeoClustering grouping algorithm (radius 2km).
     */
    fun getGeoClusteredProperties(properties: List<Property>): List<PropertyCluster> {
        val withCoords = properties.filter { it.latitude != null && it.longitude != null }
        val clusters = mutableListOf<PropertyCluster>()
        val visited = mutableSetOf<String>()

        for (prop in withCoords) {
            if (prop.id in visited) continue
            val currentCluster = mutableListOf<Property>()
            currentCluster.add(prop)
            visited.add(prop.id)

            for (other in withCoords) {
                if (other.id in visited) continue
                val dist = calculateDistanceInKm(prop.latitude!!, prop.longitude!!, other.latitude!!, other.longitude!!)
                if (dist <= 2.0) {
                    currentCluster.add(other)
                    visited.add(other.id)
                }
            }
            clusters.add(PropertyCluster(center = prop, properties = currentCluster))
        }
        return clusters
    }

    suspend fun getValidToken(): String {
        return driveHelper.getValidToken(null) ?: ""
    }

    val fabOnLeft = settingsManager.fabOnLeftFlow
}
