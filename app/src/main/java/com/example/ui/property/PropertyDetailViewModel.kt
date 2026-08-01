package com.example.ui.property

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.Customer
import com.example.domain.model.CustomerStatus
import com.example.domain.model.customerStatus
import com.example.domain.model.CustomerMatchResult
import com.example.domain.model.isEligibleForMatching
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.propertyStatus
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.property.TransferPropertyOwnershipUseCase
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
    private val snackbarManager: com.example.ui.common.SnackbarManager,
    private val transferPropertyOwnershipUseCase: TransferPropertyOwnershipUseCase,
    private val exportPhotosForPostingUseCase: com.example.domain.usecase.media.ExportPhotosForPostingUseCase
) : ViewModel() {

    private val TAG = "PropertyDetailViewModel"
    private val _propertyId = MutableStateFlow<String?>(null)

    private val _actionPositions = MutableStateFlow<Map<String, String>>(emptyMap())
    val actionPositions: StateFlow<Map<String, String>> = _actionPositions.asStateFlow()

    fun loadActionPositions(mode: com.example.ui.common.ActionMode? = null) {
        val effectiveMode = mode ?: propertyState.value?.let {
            if (it.isVerified) com.example.ui.common.ActionMode.VERIFIED else com.example.ui.common.ActionMode.UNVERIFIED
        } ?: com.example.ui.common.ActionMode.VERIFIED
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val positions = com.example.ui.common.PropertyActionKey.entries.associate { actionKey ->
                val defaultPos = if (effectiveMode == com.example.ui.common.ActionMode.UNVERIFIED) actionKey.defaultPositionUnverified else actionKey.defaultPosition
                actionKey.name to settingsManager.getActionPosition(actionKey.name, defaultPos, effectiveMode)
            }
            _actionPositions.value = positions
        }
    }

    suspend fun getValidToken(): String {
        return driveHelper.getValidToken(null) ?: ""
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
                val candidateCustomers = allCustomers.filter {
                    it.isEligibleForMatching() && (property.linkedCustomerId == null || it.id != property.linkedCustomerId)
                }
                val results = matchEngineUseCase.findMatchingCustomers(property, candidateCustomers)
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
    
    private var currentActionMode: com.example.ui.common.ActionMode? = null

    val propertyState: StateFlow<Property?> = _propertyId
        .filterNotNull()
        .flatMapLatest { id ->
            propertyRepository.getPropertyByIdFlow(id).onEach { property ->
                if (property != null) {
                    AppLogger.log(TAG, "Đang hiển thị chi tiết tài sản: ${property.area}")
                    val mode = if (property.isVerified) com.example.ui.common.ActionMode.VERIFIED else com.example.ui.common.ActionMode.UNVERIFIED
                    if (mode != currentActionMode) {
                        currentActionMode = mode
                        loadActionPositions(mode)
                    }
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val ownerCustomerState: StateFlow<Customer?> = propertyState
        .map { it?.linkedCustomerId }
        .distinctUntilChanged()
        .flatMapLatest { customerId ->
            if (customerId != null) {
                customerRepository.getCustomerByIdFlow(customerId)
            } else {
                flowOf(null)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val activeOwners: StateFlow<List<Customer>> = customerRepository.getAllActiveCustomersFlow()
        .map { list -> list.filter { it.role == "OWNER" } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

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
        currentActionMode = null
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

    fun transferOwner(newOwnerId: String) {
        val propertyId = _propertyId.value ?: return
        viewModelScope.launch {
            try {
                transferPropertyOwnershipUseCase(propertyId, newOwnerId)
                // Force re-fetch of property state
                _propertyId.value = null
                _propertyId.value = propertyId
                AppLogger.log(TAG, "Đã chuyển quyền sở hữu tài sản $propertyId sang khách hàng $newOwnerId")
            } catch (e: Exception) {
                AppLogger.log(TAG, "Lỗi khi chuyển quyền sở hữu: ${e.localizedMessage}")
            }
        }
    }

    private val _isExporting = MutableStateFlow(false)
    val isExporting: StateFlow<Boolean> = _isExporting.asStateFlow()

    fun exportPhotos(
        property: Property,
        mode: com.example.domain.usecase.media.ExportMode,
        onComplete: (com.example.domain.usecase.media.ExportResult) -> Unit
    ) {
        if (_isExporting.value) return
        viewModelScope.launch {
            _isExporting.value = true
            try {
                val result = exportPhotosForPostingUseCase.execute(property, mode)
                onComplete(result)
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi khi xuất ảnh", e)
                snackbarManager.showSnackbar("Lỗi khi xuất ảnh: ${e.localizedMessage}")
            } finally {
                _isExporting.value = false
            }
        }
    }

    fun updateDescription(property: Property, newDescription: String) {
        viewModelScope.launch {
            propertyRepository.updateProperty(
                property.copy(
                    description = newDescription,
                    updatedAt = System.currentTimeMillis()
                ),
                fromSync = false
            )
            AppLogger.log(TAG, "Đã cập nhật nội dung tin đăng cho tài sản '${property.area}'.")
        }
    }

    private val _viewingRefreshTrigger = MutableStateFlow(0)

    val viewingItemsState: StateFlow<List<PropertyViewingItem>> = combine(
        _propertyId.filterNotNull(),
        _viewingRefreshTrigger
    ) { id, _ -> id }
        .flatMapLatest { id ->
            flow {
                val links = customerRepository.getLinksForProperty(id)
                    .filter { it.role == "VIEWER" && !it.isDeleted }
                val allCustomers = customerRepository.getAllCustomers().associateBy { it.id }
                val items = links.mapNotNull { link ->
                    val customer = allCustomers[link.customerId]
                    if (customer == null || customer.isDeleted) return@mapNotNull null
                    val displayName = if (customer.customerStatus == CustomerStatus.CLOSED) {
                        "${customer.name} (đã đóng)"
                    } else {
                        customer.name
                    }
                    PropertyViewingItem(
                        link = link,
                        customerName = displayName
                    )
                }
                emit(items)
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun deleteViewingLink(customerId: String, propertyId: String) {
        viewModelScope.launch {
            try {
                customerRepository.softDeleteCustomerPropertyLink(customerId, propertyId)
                _viewingRefreshTrigger.value += 1
                AppLogger.log(TAG, "Đã xóa lượt xem nhà của khách $customerId đối với BĐS $propertyId")
            } catch (e: Exception) {
                AppLogger.log(TAG, "Lỗi khi xóa lượt xem nhà: ${e.localizedMessage}")
            }
        }
    }

    val allLinkedCustomerIdsState: StateFlow<Set<String>> = combine(
        _propertyId.filterNotNull(),
        _viewingRefreshTrigger
    ) { id, _ -> id }
        .flatMapLatest { id ->
            flow {
                val links = customerRepository.getLinksForProperty(id).filter { !it.isDeleted }
                emit(links.map { it.customerId }.toSet())
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptySet())

    fun addViewingLink(
        customerId: String,
        viewDate: String?,
        viewNote: String?,
        onResult: (Boolean, String?) -> Unit
    ) {
        val propId = _propertyId.value ?: run {
            onResult(false, "Không xác định được bất động sản")
            return
        }
        viewModelScope.launch {
            try {
                val existing = customerRepository.getLinkByIds(customerId, propId)
                if (existing != null && !existing.isDeleted) {
                    onResult(false, "Khách này đã có liên kết với BĐS này")
                    return@launch
                }
                val dateStr = if (!viewDate.isNullOrBlank()) {
                    viewDate
                } else {
                    java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date())
                }
                customerRepository.insertCustomerPropertyLink(
                    customerId = customerId,
                    propertyId = propId,
                    role = "VIEWER",
                    viewDate = dateStr,
                    viewNote = viewNote?.ifBlank { null },
                    fromSync = false
                )
                _viewingRefreshTrigger.value += 1
                onResult(true, null)
            } catch (e: Exception) {
                AppLogger.log(TAG, "Error adding viewing link: ${e.localizedMessage}")
                onResult(false, "Lỗi khi lưu lịch sử xem nhà: ${e.localizedMessage}")
            }
        }
    }
}

data class PropertyViewingItem(
    val link: com.example.data.local.entity.CustomerPropertyLink,
    val customerName: String
)

