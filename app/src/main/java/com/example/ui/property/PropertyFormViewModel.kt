package com.example.ui.property
import com.example.BuildConfig

import android.content.Context
import android.content.Intent
import android.location.Location
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.SavedStateHandle
import com.example.SyncForegroundService
import com.example.domain.model.Property
import com.example.domain.model.PropertyStatus
import com.example.domain.model.normalizeVietnamese
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.ui.common.AppLogger
import com.google.android.gms.location.LocationServices
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.SharingStarted
import com.example.domain.model.ExtractionType
import com.example.ui.common.SettingsManager
import com.example.domain.usecase.ai.ExtractPropertyUseCase
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import javax.inject.Inject

enum class ExtractionState {
    Idle, Loading, Success, Error
}

data class ExtractedProperty(
    val area: String? = null,
    val price: Double? = null,
    val areaSize: Double? = null,
    val direction: String? = null,
    val ownerName: String? = null,
    val ownerPhone: String? = null,
    val description: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null
)

@HiltViewModel
class PropertyFormViewModel @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val settingsManager: SettingsManager,
    private val extractPropertyUseCase: ExtractPropertyUseCase,
    @ApplicationContext private val context: Context,
    private val prepareImageUseCase: com.example.domain.usecase.media.PrepareImageUseCase,
    private val driveHelper: com.example.data.remote.drive.DriveHelper,
    private val savedStateHandle: SavedStateHandle
) : ViewModel() {

    private val TAG = "PropertyFormViewModel"

    private val _uiState = MutableStateFlow<FormState>(FormState.Idle)
    val uiState = _uiState.asStateFlow()

    private val _navigateBack = kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.BUFFERED)
    val navigateBack = _navigateBack.receiveAsFlow()

    private val _areaSuggestions = MutableStateFlow<List<String>>(emptyList())
    val areaSuggestions: StateFlow<List<String>> = _areaSuggestions.asStateFlow()

    // Form values backed by SavedStateHandle for process death survival
    val area: StateFlow<String> = savedStateHandle.getStateFlow("area", "")
    val latitude: StateFlow<String> = savedStateHandle.getStateFlow("latitude", "")
    val longitude: StateFlow<String> = savedStateHandle.getStateFlow("longitude", "")
    val areaSize: StateFlow<String> = savedStateHandle.getStateFlow("areaSize", "")
    val price: StateFlow<String> = savedStateHandle.getStateFlow("price", "")
    val description: StateFlow<String> = savedStateHandle.getStateFlow("description", "")
    val status: StateFlow<String> = savedStateHandle.getStateFlow("status", PropertyStatus.FOR_SALE.value)
    val direction: StateFlow<String> = savedStateHandle.getStateFlow("direction", "")
    val ownerName: StateFlow<String> = savedStateHandle.getStateFlow("ownerName", "")
    val ownerPhone: StateFlow<String> = savedStateHandle.getStateFlow("ownerPhone", "")
    val linkedCustomerId: StateFlow<String?> = savedStateHandle.getStateFlow("linkedCustomerId", null)
    val propertyType: StateFlow<String> = savedStateHandle.getStateFlow("propertyType", "Nhà")
    val needToViewToday: StateFlow<Boolean> = savedStateHandle.getStateFlow("needToViewToday", false)
    val documentUrl: StateFlow<String> = savedStateHandle.getStateFlow("documentUrl", "")
    val images: StateFlow<List<String>> = savedStateHandle.getStateFlow("images", emptyList())

    val rawText: StateFlow<String> = savedStateHandle.getStateFlow("rawText", "")
    fun updateRawText(v: String) = updateField("rawText", v)

    private val _extractedByNameFlow = savedStateHandle.getStateFlow<String?>("extractedByName", null)
    val extractedBy: StateFlow<ExtractionType?> = _extractedByNameFlow
        .map { name ->
            name?.let {
                try {
                    ExtractionType.valueOf(it)
                } catch (e: Exception) {
                    null
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    fun updateExtractedBy(type: ExtractionType?) {
        updateField("extractedByName", type?.name)
    }

    private val _suggestedOwnerName = MutableStateFlow<String?>(null)
    val suggestedOwnerName: StateFlow<String?> = _suggestedOwnerName.asStateFlow()

    private val _suggestedOwnersByName = MutableStateFlow<List<com.example.domain.model.Customer>>(emptyList())
    val suggestedOwnersByName: StateFlow<List<com.example.domain.model.Customer>> = _suggestedOwnersByName.asStateFlow()

    private val _linkedCustomerName = MutableStateFlow<String?>(null)
    val linkedCustomerName: StateFlow<String?> = _linkedCustomerName.asStateFlow()

    private var editingPropertyId: String?
        get() = savedStateHandle["editingPropertyId"]
        set(value) { savedStateHandle["editingPropertyId"] = value }

    private var originalProperty: Property? = null
    private var pendingVerify = false
    
    private val _originalSurveyDate = savedStateHandle.getStateFlow<String?>("originalSurveyDate", null)

    val isVerified: StateFlow<Boolean> = savedStateHandle.getStateFlow("isVerified", true)

    fun setVerified(value: Boolean) {
        savedStateHandle["isVerified"] = value
    }

    // Rich Bottom Sheet States
    private val _pasteInfoSheetVisible = MutableStateFlow(false)
    val pasteInfoSheetVisible: StateFlow<Boolean> = _pasteInfoSheetVisible.asStateFlow()

    private val _pasteInfoText = MutableStateFlow("")
    val pasteInfoText: StateFlow<String> = _pasteInfoText.asStateFlow()

    private val _extractedResult = MutableStateFlow<ExtractedProperty?>(null)
    val extractedResult: StateFlow<ExtractedProperty?> = _extractedResult.asStateFlow()

    private val _extractionState = MutableStateFlow<ExtractionState>(ExtractionState.Idle)
    val extractionState: StateFlow<ExtractionState> = _extractionState.asStateFlow()

    private val _rawTextSheetVisible = MutableStateFlow(false)
    val rawTextSheetVisible: StateFlow<Boolean> = _rawTextSheetVisible.asStateFlow()

    fun setRawTextSheetVisible(visible: Boolean) {
        _rawTextSheetVisible.value = visible
    }

    fun redetectFromRawText() {
        _pasteInfoText.value = rawText.value
        _rawTextSheetVisible.value = false
        _pasteInfoSheetVisible.value = true
    }

    init {
        refreshAreaSuggestions()
        val customerId = savedStateHandle.get<String>("linkedCustomerId")
        if (!customerId.isNullOrBlank()) {
            viewModelScope.launch {
                try {
                    val customer = customerRepository.getCustomerById(customerId)
                    if (customer != null) {
                        _linkedCustomerName.value = customer.name
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to restore linked customer name", e)
                }
            }
        }

        // Khôi phục gợi ý chủ nhà nếu có SĐT (phục vụ process death)
        val phone = savedStateHandle.get<String>("ownerPhone")
        if (!phone.isNullOrBlank()) {
            lookupSuggestedOwner(phone)
        }
    }

    fun refreshAreaSuggestions() {
        viewModelScope.launch {
            try {
                val areas = propertyRepository.getAllDistinctAreas()
                _areaSuggestions.value = areas.distinct().sorted()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load area suggestions", e)
            }
        }
    }

    private fun <T> updateField(key: String, value: T) {
        savedStateHandle[key] = value
    }

    // Form field update methods
    fun updateArea(value: String) {
        updateField("area", value)
    }

    fun updateLatitude(value: String) {
        updateField("latitude", value)
    }

    fun updateLongitude(value: String) {
        updateField("longitude", value)
    }

    fun updateAreaSize(value: String) {
        updateField("areaSize", value)
    }

    fun updatePrice(value: String) {
        updateField("price", value)
    }

    fun updateDescription(value: String) {
        updateField("description", value)
    }

    fun updateStatus(value: String) {
        updateField("status", value)
    }

    fun getSelectedDirections(): List<String> {
        return direction.value.split("|||").filter { it.isNotBlank() }
    }

    fun isDirectionSelected(dir: String): Boolean {
        return getSelectedDirections().contains(dir)
    }

    fun setDirections(dirs: List<String>) {
        updateField("direction", dirs.joinToString("|||"))
    }

    fun updateDirection(value: String) {
        val currentDirs = getSelectedDirections().toMutableList()
        if (currentDirs.contains(value)) {
            currentDirs.remove(value)
        } else {
            currentDirs.add(value)
        }
        updateField("direction", currentDirs.joinToString("|||"))
    }

    fun updateOwnerName(value: String) {
        updateField("ownerName", value)
        lookupSuggestedOwnersByName(value)
    }

    private fun lookupSuggestedOwnersByName(name: String) {
        val trimmed = name.trim()
        if (trimmed.length >= 2) {
            viewModelScope.launch {
                try {
                    val normalized = trimmed.normalizeVietnamese()
                    val results = customerRepository.searchOwnersByName(normalized)
                    _suggestedOwnersByName.value = results
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to search owners by name: $trimmed", e)
                }
            }
        } else {
            _suggestedOwnersByName.value = emptyList()
        }
    }

    fun updateOwnerPhone(value: String) {
        updateField("ownerPhone", value)
        lookupSuggestedOwner(value)
    }

    private fun lookupSuggestedOwner(phone: String) {
        val trimmed = phone.trim()
        if (trimmed.length >= 8) {
            viewModelScope.launch {
                try {
                    val customer = customerRepository.getCustomerByPhone(trimmed)
                    if (customer != null) {
                        _suggestedOwnerName.value = customer.name
                        // Chỉ tự điền tên nếu đang trống
                        if (ownerName.value.isBlank()) {
                            savedStateHandle["ownerName"] = customer.name
                        }
                    } else {
                        _suggestedOwnerName.value = null
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to fetch customer by phone: $trimmed", e)
                }
            }
        } else {
            _suggestedOwnerName.value = null
        }
    }

    fun loadLinkedCustomer(customerId: String) {
        savedStateHandle["linkedCustomerId"] = customerId
        viewModelScope.launch {
            try {
                val customer = customerRepository.getCustomerById(customerId)
                if (customer != null) {
                    savedStateHandle["ownerName"] = customer.name
                    savedStateHandle["ownerPhone"] = customer.phone
                    _linkedCustomerName.value = customer.name
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã liên kết biểu mẫu với chủ nhà: ${customer.name}")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Lỗi tải thông tin chủ nhà liên kết: $customerId", e)
            }
        }
    }

    fun unlinkOwner() {
        savedStateHandle["linkedCustomerId"] = null
        _linkedCustomerName.value = null
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Đã hủy liên kết chủ nhà trực tiếp. Bạn có thể tự điền/sửa thông tin.")
        }
    }

    fun updatePropertyType(value: String) {
        updateField("propertyType", value)
    }

    fun updateNeedToViewToday(value: Boolean) {
        updateField("needToViewToday", value)
    }

    fun updateDocumentUrl(value: String) {
        updateField("documentUrl", value)
    }

    fun clearLocation() {
        updateField("latitude", "")
        updateField("longitude", "")
    }

    // Bottom sheet state management
    fun setPasteInfoSheetVisible(visible: Boolean) {
        _pasteInfoSheetVisible.value = visible
        if (visible) {
            clearExtraction()
        }
    }

    fun updatePasteInfoText(text: String) {
        _pasteInfoText.value = text
    }

    fun clearExtraction() {
        _extractedResult.value = null
        _extractionState.value = ExtractionState.Idle
    }

    // Perform AI or Regex extraction
    fun performExtraction(text: String) {
        _extractionState.value = ExtractionState.Loading
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Đang khởi chạy công cụ AI bóc tách thông tin BĐS tự động từ văn bản dán...")
        }
        viewModelScope.launch {
            try {
                val apiKey = settingsManager.geminiApiKey
                val model = settingsManager.geminiModel
                val prompt = settingsManager.promptTemplate
                
                // 1. Try Gemini extraction (which falls back to regex in the use case)
                val extracted = extractPropertyUseCase(text, apiKey, model)
                
                // 2. Try parsing coordinates from the clipboard text
                val coords = CoordinateExtractor.extract(text)
                val finalLat = coords?.latitude ?: extracted.latitude
                val finalLng = coords?.longitude ?: extracted.longitude

                // Update raw text and extraction method
                updateRawText(text)
                updateExtractedBy(ExtractionType.AI)
 
                // 3. Map to ExtractedProperty
                val result = ExtractedProperty(
                    area = extracted.address?.ifBlank { null } ?: extracted.title?.ifBlank { null },
                    price = extracted.price?.toDouble(),
                    areaSize = extracted.area,
                    direction = extracted.direction?.ifBlank { null },
                    ownerName = extracted.ownerName?.ifBlank { null },
                    ownerPhone = extracted.ownerPhone?.ifBlank { null },
                    description = extracted.description.ifBlank { null },
                    latitude = finalLat,
                    longitude = finalLng
                )
                
                _extractedResult.value = result
                _extractionState.value = ExtractionState.Success
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Bóc tách thông tin BĐS thành công: ${result.area ?: "Chưa rõ khu vực"}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Extraction failed", e)
                _extractionState.value = ExtractionState.Error
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Gặp lỗi khi phân tích nội dung BĐS: ${e.localizedMessage}")
                }
            }
        }
    }

    // Perform offline Regex extraction
    fun performRegexExtraction(text: String) {
        _extractionState.value = ExtractionState.Loading
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Đang khởi chạy bộ lọc Regex offline bóc tách thông tin BĐS...")
        }
        viewModelScope.launch {
            try {
                val knownAreas = propertyRepository.getAllDistinctAreas()
                val extracted = com.example.domain.usecase.ai.PropertyTextExtractor.parseWithRegex(
                    text,
                    knownAreas,
                    customRegexJson = settingsManager.customExtractionRegex
                )
                
                // Try parsing coordinates from the clipboard text
                val coords = CoordinateExtractor.extract(text)
                val finalLat = coords?.latitude ?: extracted.latitude
                val finalLng = coords?.longitude ?: extracted.longitude

                // Update raw text and extraction method
                updateRawText(text)
                updateExtractedBy(ExtractionType.REGEX)
 
                // 3. Map to ExtractedProperty
                val result = ExtractedProperty(
                    area = extracted.address?.ifBlank { null } ?: extracted.title?.ifBlank { null },
                    price = extracted.price?.toDouble(),
                    areaSize = extracted.area,
                    direction = extracted.direction?.ifBlank { null },
                    ownerName = extracted.ownerName?.ifBlank { null },
                    ownerPhone = extracted.ownerPhone?.ifBlank { null },
                    description = extracted.description.ifBlank { null },
                    latitude = finalLat,
                    longitude = finalLng
                )
                
                _extractedResult.value = result
                _extractionState.value = ExtractionState.Success
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Bóc tách bằng Regex thành công: ${result.area ?: "Chưa rõ khu vực"}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Regex extraction failed", e)
                _extractionState.value = ExtractionState.Error
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Gặp lỗi khi phân tích nội dung BĐS bằng Regex: ${e.localizedMessage}")
                }
            }
        }
    }

    // Apply extracted info to the main form
    fun applyExtractedResult() {
        val result = _extractedResult.value ?: return
        result.area?.let { updateArea(it) }
        result.price?.let { updatePrice(it.toString()) }
        result.areaSize?.let { updateAreaSize(it.toString()) }
        result.direction?.let { dirStr ->
            val dirs = dirStr.split("|||").filter { it.isNotBlank() }
            setDirections(dirs)
        }
        result.ownerName?.let { updateOwnerName(it) }
        result.ownerPhone?.let { updateOwnerPhone(it) }
        result.description?.let { updateDescription(it) }
        result.latitude?.let { updateLatitude(it.toString()) }
        result.longitude?.let { updateLongitude(it.toString()) }
        
        _pasteInfoSheetVisible.value = false
        clearExtraction()
        if (BuildConfig.DEBUG) {
            AppLogger.log(TAG, "Đã điền các thông tin bóc tách được từ AI vào biểu mẫu.")
        }
    }

    fun resetForm(defaultIsVerified: Boolean = true) {
        cleanupTemporaryImages()

        savedStateHandle["area"] = ""
        savedStateHandle["latitude"] = ""
        savedStateHandle["longitude"] = ""
        savedStateHandle["areaSize"] = ""
        savedStateHandle["price"] = ""
        savedStateHandle["description"] = ""
        savedStateHandle["status"] = PropertyStatus.FOR_SALE.value
        savedStateHandle["direction"] = ""
        savedStateHandle["ownerName"] = ""
        savedStateHandle["ownerPhone"] = ""
        _suggestedOwnerName.value = null
        _suggestedOwnersByName.value = emptyList()
        savedStateHandle["propertyType"] = "Nhà"
        savedStateHandle["needToViewToday"] = false
        savedStateHandle["documentUrl"] = ""
        savedStateHandle["images"] = emptyList<String>()
        editingPropertyId = null
        savedStateHandle["originalSurveyDate"] = null
        _uiState.value = FormState.Idle
        _pasteInfoText.value = ""
        _pasteInfoSheetVisible.value = false
        savedStateHandle["linkedCustomerId"] = null
        _linkedCustomerName.value = null
        savedStateHandle["isVerified"] = defaultIsVerified
        savedStateHandle["rawText"] = ""
        savedStateHandle["extractedByName"] = null
        clearExtraction()
        refreshAreaSuggestions()
    }

    fun resetState() {
        _uiState.value = FormState.Idle
        pendingVerify = false
    }

    private fun cleanupTemporaryImages() {
        viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            try {
                // Chỉ dọn dẹp các ảnh đã thêm trong phiên này mà chưa được lưu chính thức
                val addedThisSession = savedStateHandle.get<List<String>>("addedThisSession") ?: emptyList()
                addedThisSession.forEach { path ->
                    val file = File(path)
                    if (file.exists() && file.parentFile?.name == "bds_images") {
                        val deleted = file.delete()
                        if (deleted) Log.d(TAG, "Deleted abandoned temp image: $path")
                    }
                }
                savedStateHandle["addedThisSession"] = emptyList<String>()
            } catch (e: Exception) {
                Log.e(TAG, "Error cleaning up temporary images", e)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        // Nếu ViewModel bị hủy mà chưa lưu (không phải do process death), dọn dẹp ảnh tạm
        val addedThisSession = savedStateHandle.get<List<String>>("addedThisSession") ?: emptyList()
        if (addedThisSession.isNotEmpty()) {
            cleanupTemporaryImages()
        }
    }

    sealed interface FormState {
        object Idle : FormState
        object Loading : FormState
        object Success : FormState
        data class Error(val message: String) : FormState
        data class DuplicateWarning(val duplicates: List<Property>) : FormState
    }

    fun loadProperty(id: String) {
        editingPropertyId = id
        _uiState.value = FormState.Loading
        viewModelScope.launch {
            try {
                refreshAreaSuggestions()
                val property = propertyRepository.getPropertyById(id)
                if (property != null) {
                    originalProperty = property
                    
                    savedStateHandle["area"] = property.area
                    savedStateHandle["latitude"] = property.latitude.toString()
                    savedStateHandle["longitude"] = property.longitude.toString()
                    savedStateHandle["areaSize"] = property.areaSize.toString()
                    savedStateHandle["price"] = property.price.toString()
                    savedStateHandle["description"] = property.description
                    savedStateHandle["status"] = property.status
                    savedStateHandle["direction"] = property.direction
                    savedStateHandle["ownerName"] = property.ownerName
                    savedStateHandle["ownerPhone"] = property.ownerPhone
                    savedStateHandle["propertyType"] = property.propertyType
                    savedStateHandle["needToViewToday"] = property.needToViewToday
                    savedStateHandle["documentUrl"] = property.documentUrl
                    savedStateHandle["images"] = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                    savedStateHandle["linkedCustomerId"] = property.linkedCustomerId
                    savedStateHandle["isVerified"] = property.isVerified
                    savedStateHandle["rawText"] = property.rawText
                    savedStateHandle["extractedByName"] = property.extractedBy?.name
                    
                    savedStateHandle["originalSurveyDate"] = property.surveyDate
                    _uiState.value = FormState.Idle
                } else {
                    _uiState.value = FormState.Error("Không tìm thấy thuộc tính cần sửa.")
                }
            } catch (e: Exception) {
                _uiState.value = FormState.Error("Lỗi tải thông tin: ${e.localizedMessage}")
            }
        }
    }

    fun addImage(uri: Uri) {
        viewModelScope.launch {
            try {
                val compressedPath = compressAndSaveUri(uri)
                if (compressedPath != null) {
                    val newList = images.value.toMutableList()
                    newList.add(compressedPath)
                    savedStateHandle["images"] = newList
                    
                    // Theo dõi ảnh mới thêm trong phiên này để dọn dẹp nếu không lưu
                    val addedThisSession = savedStateHandle.get<List<String>>("addedThisSession")?.toMutableList() ?: mutableListOf()
                    addedThisSession.add(compressedPath)
                    savedStateHandle["addedThisSession"] = addedThisSession
                    
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Added compressed image: $compressedPath")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error adding image", e)
            }
        }
    }

    fun removeImage(index: Int) {
        val newList = images.value.toMutableList()
        if (index in newList.indices) {
            val removedPath = newList.removeAt(index)
            savedStateHandle["images"] = newList
            
            // Nếu ảnh bị gỡ là ảnh mới thêm trong phiên này, xóa file luôn và bỏ khỏi danh sách theo dõi
            val addedThisSession = savedStateHandle.get<List<String>>("addedThisSession")?.toMutableList() ?: mutableListOf()
            if (addedThisSession.contains(removedPath)) {
                addedThisSession.remove(removedPath)
                savedStateHandle["addedThisSession"] = addedThisSession
                File(removedPath).delete()
            }
            
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã gỡ bỏ 1 ảnh khỏi danh sách tải lên.")
            }
        }
    }

    fun setAvatarImage(index: Int) {
        val newList = images.value.toMutableList()
        if (index in newList.indices && index != 0) {
            val item = newList.removeAt(index)
            newList.add(0, item)
            savedStateHandle["images"] = newList
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã chuyển ảnh index $index thành ảnh đại diện (đầu danh sách).")
            }
        }
    }

    fun fetchCurrentGPS() {
        try {
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
            fusedLocationClient.lastLocation.addOnSuccessListener { loc: Location? ->
                if (loc != null) {
                    savedStateHandle["latitude"] = loc.latitude.toString()
                    savedStateHandle["longitude"] = loc.longitude.toString()
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "GPS updated: Lat=${loc.latitude}, Lng=${loc.longitude}")
                    }
                } else {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Could not fetch GPS: Location is null.")
                    }
                }
            }.addOnFailureListener {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Failed to fetch GPS: ${it.localizedMessage}")
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission missing for GPS fetch", e)
        }
    }

    fun saveProperty(ignoreDuplicates: Boolean = false) {
        if (area.value.isBlank()) {
            _uiState.value = FormState.Error("Vui lòng nhập khu vực BĐS.")
            return
        }

        val isNew = editingPropertyId == null
        if (!isNew && originalProperty == null) {
            _uiState.value = FormState.Error("Dữ liệu chưa tải xong, vui lòng đợi.")
            return
        }

        _uiState.value = FormState.Loading
        viewModelScope.launch {
            try {
                val shouldVerify = pendingVerify || isVerified.value
                val resolvedStatus = if (shouldVerify && status.value == PropertyStatus.PENDING_SURVEY.value) {
                    PropertyStatus.FOR_SALE.value
                } else {
                    status.value
                }
                val latVal = latitude.value.toDoubleOrNull()
                val lngVal = longitude.value.toDoubleOrNull()
                val sizeVal = areaSize.value.toDoubleOrNull() ?: 0.0
                val priceVal = price.value.toDoubleOrNull() ?: 0.0

                val isNew = editingPropertyId == null
                val propertyId = if (isNew) Property.generatePropertyId() else editingPropertyId!!

                // Build a candidate property object for duplicate checking and validation
                val candidateProperty = Property(
                    id = propertyId,
                    area = area.value.trim(),
                    latitude = latVal,
                    longitude = lngVal,
                    imagePath = null,
                    driveMediaIds = null,
                    driveFolderId = null,
                    documentUrl = documentUrl.value.trim(),
                    areaSize = sizeVal,
                    price = priceVal,
                    description = description.value.trim(),
                    status = resolvedStatus,
                    direction = direction.value.trim(),
                    ownerName = ownerName.value.trim(),
                    ownerPhone = ownerPhone.value.trim(),
                    propertyType = propertyType.value,
                    needToViewToday = needToViewToday.value,
                    isTextSynced = false,
                    rawText = rawText.value,
                    extractedBy = extractedBy.value,
                    updatedAt = System.currentTimeMillis(),
                    isVerified = shouldVerify
                )

                // Check for duplicates
                if (!ignoreDuplicates) {
                    val potentialDuplicates = propertyRepository.findPotentialDuplicates(candidateProperty)
                    if (potentialDuplicates.isNotEmpty()) {
                        _uiState.value = FormState.DuplicateWarning(potentialDuplicates)
                        return@launch
                    }
                }

                val dbProperty = if (!isNew) {
                    propertyRepository.getPropertyById(propertyId)
                } else null

                if (!isNew && dbProperty == null) {
                    _uiState.value = FormState.Error("Không tìm thấy dữ liệu BĐS gốc trong cơ sở dữ liệu. Huỷ lưu để tránh mất dữ liệu.")
                    return@launch
                }

                val latestDriveMediaIdsRaw = dbProperty?.driveMediaIds

                // 2. Parse tap path cu da co Drive ID tu driveMediaIds JSON map
                val oldPaths = mutableSetOf<String>()
                latestDriveMediaIdsRaw?.takeIf { it.isNotBlank() && it != "null" }?.let { rawJson ->
                    try {
                        val jsonObject = org.json.JSONObject(rawJson)
                        val keys = jsonObject.keys()
                        while (keys.hasNext()) {
                            oldPaths.add(keys.next())
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing driveMediaIds JSON in saveProperty", e)
                    }
                }

                // 3. Duyet images.value, tao danh sach moi finalPaths va thuc hien rename neu la anh moi
                val finalPaths = mutableListOf<String>()
                for (path in images.value) {
                    if (path in oldPaths) {
                        finalPaths.add(path)
                    } else {
                        try {
                            val file = File(path)
                            if (!file.exists()) {
                                Log.w(TAG, "Image file does not exist on disk for renaming: $path")
                                finalPaths.add(path)
                            } else {
                                val parentDir = file.parentFile
                                val oldName = file.name
                                if (oldName.startsWith("${propertyId}_")) {
                                    finalPaths.add(path)
                                } else {
                                    val newFile = File(parentDir, "${propertyId}_$oldName")
                                    if (file.renameTo(newFile)) {
                                        finalPaths.add(newFile.absolutePath)
                                        Log.d(TAG, "Successfully renamed image to: ${newFile.absolutePath}")
                                    } else {
                                        Log.e(TAG, "Rename ảnh thất bại: $path")
                                        finalPaths.add(path)
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Lỗi khi xử lý rename ảnh: $path", e)
                            finalPaths.add(path)
                        }
                    }
                }

                // Cap nhat lai images de UI va state dong nhat voi path moi
                savedStateHandle["images"] = finalPaths

                // 4. Build imgPathJoined tu finalPaths thay vi tu images.value
                val imgPathJoined = if (finalPaths.isEmpty()) null else finalPaths.joinToString("|||")

                val deletedDriveIds = mutableListOf<String>()
                val dbHasImages = !dbProperty?.imagePath.isNullOrBlank()

                val updatedDriveMediaIds = if (finalPaths.isEmpty() && dbHasImages) {
                    // Nghi ngờ lỗi nạp dữ liệu, giữ nguyên driveMediaIds cũ và không xóa bất kỳ ảnh nào trên Drive
                    latestDriveMediaIdsRaw
                } else {
                    latestDriveMediaIdsRaw?.takeIf { it.isNotBlank() && it != "null" }?.let { rawJson ->
                        try {
                            val jsonObject = org.json.JSONObject(rawJson)
                            val updatedJsonObject = org.json.JSONObject()
                            val keys = jsonObject.keys()
                            while (keys.hasNext()) {
                                val key = keys.next()
                                if (finalPaths.contains(key)) {
                                    updatedJsonObject.put(key, jsonObject.get(key))
                                } else {
                                    val driveId = jsonObject.optString(key)
                                    if (!driveId.isNullOrBlank() && driveId != "null") {
                                        deletedDriveIds.add(driveId)
                                    }
                                }
                            }
                            val removedCount = jsonObject.length() - updatedJsonObject.length()
                            if (removedCount > 0) {
                                if (BuildConfig.DEBUG) {
                                    AppLogger.log(TAG, "Đã loại bỏ $removedCount ảnh khỏi driveMediaIds của BĐS '${area.value.trim()}' (tiến hành xóa trên Drive)")
                                }
                            }
                            updatedJsonObject.toString()
                        } catch (e: Exception) {
                            Log.e(TAG, "Error diffing driveMediaIds JSON in saveProperty", e)
                            latestDriveMediaIdsRaw
                        }
                    }
                }

                if (deletedDriveIds.isNotEmpty()) {
                    viewModelScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                        for (driveId in deletedDriveIds) {
                            try {
                                if (BuildConfig.DEBUG) {
                                    AppLogger.log(TAG, "Bắt đầu xóa file trên Drive: $driveId")
                                }
                                val success = driveHelper.deleteFile(driveId)
                                if (success) {
                                    if (BuildConfig.DEBUG) {
                                        AppLogger.log(TAG, "Đã xóa file $driveId trên Google Drive thành công.")
                                    }
                                } else {
                                    if (BuildConfig.DEBUG) {
                                        AppLogger.log(TAG, "Xóa file $driveId trên Google Drive thất bại.")
                                    }
                                }
                            } catch (e: Exception) {
                                Log.e(TAG, "Lỗi khi xóa file trên Drive: $driveId", e)
                            }
                        }
                    }
                }

                val shouldClearFolder = finalPaths.isEmpty() && !latestDriveMediaIdsRaw.isNullOrBlank() && latestDriveMediaIdsRaw != "null" && !dbHasImages

                val property = if (isNew) {
                    Property(
                        id = propertyId,
                        area = area.value.trim(),
                        latitude = latVal,
                        longitude = lngVal,
                        imagePath = imgPathJoined,
                        documentUrl = documentUrl.value.trim(),
                        areaSize = sizeVal,
                        price = priceVal,
                        description = description.value.trim(),
                        status = resolvedStatus,
                        direction = direction.value.trim(),
                        ownerName = ownerName.value.trim(),
                        ownerPhone = ownerPhone.value.trim(),
                        propertyType = propertyType.value,
                        needToViewToday = needToViewToday.value,
                        isTextSynced = false, // reset sync status since content changed
                        rawText = rawText.value,
                        extractedBy = extractedBy.value,
                        updatedAt = System.currentTimeMillis(),
                        isVerified = shouldVerify
                    )
                } else {
                    dbProperty!!.copy(
                        area = area.value.trim(),
                        latitude = latVal,
                        longitude = lngVal,
                        imagePath = imgPathJoined,
                        driveMediaIds = updatedDriveMediaIds,
                        driveFolderId = if (shouldClearFolder) null else dbProperty.driveFolderId,
                        documentUrl = documentUrl.value.trim(),
                        areaSize = sizeVal,
                        price = priceVal,
                        description = description.value.trim(),
                        status = resolvedStatus,
                        direction = direction.value.trim(),
                        ownerName = ownerName.value.trim(),
                        ownerPhone = ownerPhone.value.trim(),
                        propertyType = propertyType.value,
                        needToViewToday = needToViewToday.value,
                        isTextSynced = false, // reset sync status since content changed
                        rawText = rawText.value,
                        extractedBy = extractedBy.value,
                        updatedAt = System.currentTimeMillis(),
                        surveyDate = _originalSurveyDate.value ?: dbProperty.surveyDate,
                        isVerified = shouldVerify
                    )
                }

                propertyRepository.insertProperty(property, linkedCustomerId.value)

                // Trigger auto-sync in background asynchronously
                try {
                    val intent = Intent(context, SyncForegroundService::class.java).apply {
                        putExtra("PROPERTY_ID", property.id)
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(intent)
                    } else {
                        context.startService(intent)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start SyncForegroundService for auto-sync", e)
                }

                _uiState.value = FormState.Success
                if (shouldVerify) {
                    savedStateHandle["isVerified"] = true
                }
                pendingVerify = false
                if (isNew) {
                    resetForm(isVerified.value)
                } else {
                    savedStateHandle["addedThisSession"] = emptyList<String>()
                }
                if (isNew) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã thêm mới BĐS: ${property.area}")
                    }
                } else {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã cập nhật BĐS: ${property.area}")
                    }
                }
                _navigateBack.send(Unit)
            } catch (e: Exception) {
                _uiState.value = FormState.Error("Lỗi lưu dữ liệu: ${e.localizedMessage}")
            }
        }
    }

    fun promoteAndSaveProperty(ignoreDuplicates: Boolean = false) {
        pendingVerify = true
        saveProperty(ignoreDuplicates)
    }

    private suspend fun compressAndSaveUri(uri: Uri): String? {
        val imagesDir = File(context.filesDir, "bds_images").apply { mkdirs() }
        val outputName = "IMG_" + UUID.randomUUID().toString().take(12) + ".jpg"
        val outputFile = File(imagesDir, outputName)

        val result = prepareImageUseCase.execute(uri, outputFile, 2048, 80)
        return if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Success) {
            result.filePath
        } else {
            if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Failure) {
                Log.e(TAG, "Failed to compress image: ${result.reason}")
            }
            null
        }
    }

    val fabOnLeft = settingsManager.fabOnLeftFlow
}
