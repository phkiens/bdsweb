package com.example.ui.property

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.CustomerMatchResult
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.match.MatchEngineUseCase
import com.example.ui.common.AppLogger
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.example.SyncForegroundService

sealed class CustomerMatchUiState {
    object Idle : CustomerMatchUiState()
    object Loading : CustomerMatchUiState()
    data class Success(val results: List<CustomerMatchResult>) : CustomerMatchUiState()
    data class Empty(val message: String) : CustomerMatchUiState()
}

sealed class SyncUiState {
    object Idle : SyncUiState()
    object Loading : SyncUiState()
    object Success : SyncUiState()
    data class PartialSuccess(val errorMessage: String) : SyncUiState()
    data class Error(val errorMessage: String) : SyncUiState()
}

@HiltViewModel
class PropertyDetailViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val matchEngineUseCase: MatchEngineUseCase,
    @ApplicationContext private val context: Context,
    private val driveHelper: com.example.data.remote.drive.DriveHelper,
    private val prepareImageUseCase: com.example.domain.usecase.media.PrepareImageUseCase,
    val settingsManager: com.example.ui.common.SettingsManager,
    val networkStateObserver: com.example.ui.common.NetworkStateObserver,
    private val snackbarManager: com.example.ui.common.SnackbarManager
) : ViewModel() {

    private val TAG = "PropertyDetailViewModel"
    private val _propertyId = MutableStateFlow<String?>(null)

    private val _actionPositions = MutableStateFlow<Map<String, String>>(emptyMap())
    val actionPositions: StateFlow<Map<String, String>> = _actionPositions.asStateFlow()

    fun loadActionPositions() {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val positions = mapOf(
                "TOGGLE_POTENTIAL" to settingsManager.getActionPosition("TOGGLE_POTENTIAL", "OUTER"),
                "BACKUP" to settingsManager.getActionPosition("BACKUP", "OUTER"),
                "ADD_CUSTOMER" to settingsManager.getActionPosition("ADD_CUSTOMER", "OUTER"),
                "CALL" to settingsManager.getActionPosition("CALL", "INNER"),
                "ZALO" to settingsManager.getActionPosition("ZALO", "INNER"),
                "DIRECTIONS" to settingsManager.getActionPosition("DIRECTIONS", "OUTER"),
                "SHARE" to settingsManager.getActionPosition("SHARE", "INNER"),
                "EDIT" to settingsManager.getActionPosition("EDIT", "OUTER"),
                "DELETE" to settingsManager.getActionPosition("DELETE", "INNER"),
                "SCAN_CUSTOMERS" to settingsManager.getActionPosition("SCAN_CUSTOMERS", "INNER"),
                "NEARBY" to settingsManager.getActionPosition("NEARBY", "INNER"),
                "DOWNLOAD_MEDIA" to settingsManager.getActionPosition("DOWNLOAD_MEDIA", "INNER")
            )
            _actionPositions.value = positions
        }
    }

    fun syncSingleProperty(propertyId: String) {
        if (!networkStateObserver.isOnline.value) {
            snackbarManager.showSnackbar("Không có kết nối mạng, vui lòng thử lại")
            return
        }
        if (!driveHelper.isAuthorized()) {
            snackbarManager.showSnackbar("Vui lòng kết nối Google Drive trong phần Cài đặt trước.")
            return
        }
        try {
            Log.d("SYNC_UPLOAD_DEBUG", "Nguồn trigger: PropertyDetailViewModel, propertyId liên quan: $propertyId")
            val intent = Intent(context, SyncForegroundService::class.java).apply {
                putExtra("PROPERTY_ID", propertyId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start SyncForegroundService for auto-sync", e)
        }
    }

    fun downloadPropertyImages(propertyId: String) {
        if (!networkStateObserver.isOnline.value) {
            snackbarManager.showSnackbar("Không có kết nối mạng, vui lòng thử lại")
            return
        }
        try {
            val intent = Intent(context, SyncForegroundService::class.java).apply {
                putExtra("DOWNLOAD_PROPERTY_ID", propertyId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start SyncForegroundService for downloading images", e)
        }
    }

    private val _matchResults = MutableStateFlow<CustomerMatchUiState>(CustomerMatchUiState.Idle)
    val matchResults: StateFlow<CustomerMatchUiState> = _matchResults.asStateFlow()

    fun onScanMatchingCustomers(property: Property) {
        viewModelScope.launch {
            _matchResults.value = CustomerMatchUiState.Loading
            try {
                val allCustomers = customerRepository.getAllCustomers()
                val results = matchEngineUseCase.findMatchingCustomers(property, allCustomers)
                _matchResults.value = if (results.isEmpty()) {
                    CustomerMatchUiState.Empty("Không tìm thấy khách hàng phù hợp")
                } else {
                    CustomerMatchUiState.Success(results)
                }
            } catch (e: Exception) {
                AppLogger.log(TAG, "Error scanning matching customers: ${e.localizedMessage}")
                _matchResults.value = CustomerMatchUiState.Empty("Có lỗi xảy ra khi quét tìm khách hàng")
            }
        }
    }

    fun resetMatchState() {
        _matchResults.value = CustomerMatchUiState.Idle
    }
    
    val propertyState: StateFlow<Property?> = _propertyId
        .filterNotNull()
        .flatMapLatest { id ->
            propertyRepository.getPropertyByIdFlow(id).onEach { property ->
                if (property != null) {
                    AppLogger.log(TAG, "Đang hiển thị chi tiết tài sản: ${property.area}")
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val syncUiState: StateFlow<SyncUiState> = propertyState
        .map { property ->
            if (property == null) {
                SyncUiState.Idle
            } else if (property.isTextSynced && property.txtFileId.isNullOrBlank()) {
                SyncUiState.PartialSuccess("thiếu tệp văn bản chi tiết (.txt)")
            } else if (property.isTextSynced) {
                SyncUiState.Success
            } else {
                SyncUiState.Idle
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), SyncUiState.Idle)

    fun setPropertyId(id: String) {
        _propertyId.value = id
        loadActionPositions()
    }

    fun toggleNeedToViewToday(property: Property) {
        viewModelScope.launch {
            val newState = !property.needToViewToday
            propertyRepository.updateProperty(property.copy(needToViewToday = newState, updatedAt = System.currentTimeMillis()))
            val logMsg = if (newState) {
                "Đã đánh dấu tài sản '${property.area}' cần dẫn khách xem hôm nay."
            } else {
                "Đã bỏ đánh dấu dẫn khách hôm nay đối với tài sản '${property.area}'."
            }
            AppLogger.log(TAG, logMsg)
        }
    }

    fun toggleStatus(property: Property) {
        val newStatus = when (property.propertyStatus) {
            PropertyStatus.FOR_SALE -> PropertyStatus.SOLD.value
            PropertyStatus.SOLD -> PropertyStatus.FOR_SALE.value
            else -> property.status
        }
        viewModelScope.launch {
            propertyRepository.updateProperty(property.copy(status = newStatus, updatedAt = System.currentTimeMillis()))
            AppLogger.log(TAG, "Đã đổi trạng thái tài sản '${property.area}' sang: '$newStatus'")
        }
    }

    fun setAsAvatar(property: Property, imageIndex: Int) {
        val paths = property.imagePath?.split("|||")?.filter { it.isNotBlank() }?.toMutableList() ?: return
        if (imageIndex in paths.indices && imageIndex != 0) {
            val selectedPath = paths[imageIndex]
            paths.removeAt(imageIndex)
            paths.add(0, selectedPath)
            val newImagePath = paths.joinToString("|||")
            viewModelScope.launch {
                propertyRepository.updateProperty(property.copy(imagePath = newImagePath, updatedAt = System.currentTimeMillis()))
                AppLogger.log(TAG, "Đã đặt một hình ảnh làm ảnh đại diện cho tài sản '${property.area}'.")
            }
        }
    }

    fun deleteImage(property: Property, imageIndex: Int) {
        val paths = property.imagePath?.split("|||")?.filter { it.isNotBlank() }?.toMutableList() ?: return
        if (imageIndex in paths.indices) {
            val removedPath = paths[imageIndex]
            paths.removeAt(imageIndex)
            val newImagePath = if (paths.isEmpty()) null else paths.joinToString("|||")
            viewModelScope.launch {
                propertyRepository.updateProperty(property.copy(imagePath = newImagePath, updatedAt = System.currentTimeMillis()))
                AppLogger.log(TAG, "Đã xóa 1 hình ảnh khỏi tài sản '${property.area}'.")
            }
        }
    }

    fun addDiaryEntry(property: Property, content: String) {
        val trimmed = content.trim()
        if (trimmed.isBlank()) return
        val currentDate = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date())
        val newEntry = "$currentDate - $trimmed"
        val updatedDiary = if (property.diary.isBlank()) newEntry else "$newEntry\n${property.diary}"
        viewModelScope.launch {
            propertyRepository.updateProperty(property.copy(diary = updatedDiary, updatedAt = System.currentTimeMillis()))
            AppLogger.log(TAG, "Đã thêm nhật ký mới cho tài sản '${property.area}'.")
        }
    }

    fun deleteProperty(propertyId: String, onDeleted: () -> Unit) {
        viewModelScope.launch {
            val property = propertyRepository.getPropertyById(propertyId)
            propertyRepository.softDeleteProperty(propertyId, System.currentTimeMillis())
            AppLogger.log(TAG, "Đã xóa tạm tài sản '${property?.area ?: propertyId}'.")
            onDeleted()
        }
    }

    fun addImages(context: android.content.Context, property: Property, uris: List<android.net.Uri>) {
        viewModelScope.launch {
            val imagesDir = java.io.File(context.filesDir, "bds_images").apply { mkdirs() }
            val newPaths = mutableListOf<String>()
            
            // Add existing images first
            val existingPaths = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
            newPaths.addAll(existingPaths)

            for (uri in uris) {
                try {
                    val outputName = "IMG_" + java.util.UUID.randomUUID().toString().take(12) + ".jpg"
                    val outputFile = java.io.File(imagesDir, outputName)
                    val result = prepareImageUseCase.execute(uri, outputFile, 2048, 80)
                    if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Success) {
                        newPaths.add(result.filePath)
                    } else if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Failure) {
                        android.util.Log.e("PropertyDetailViewModel", "Lỗi nén ảnh: ${result.reason}")
                    }
                } catch (e: Exception) {
                    android.util.Log.e("PropertyDetailViewModel", "Lỗi nén ảnh", e)
                }
            }
            
            val newImagePath = if (newPaths.isEmpty()) null else newPaths.joinToString("|||")
            propertyRepository.updateProperty(property.copy(imagePath = newImagePath, updatedAt = System.currentTimeMillis()))
            AppLogger.log("PropertyDetailViewModel", "Đã thêm ${uris.size} hình ảnh vào tài sản '${property.area}'")
        }
    }
}

