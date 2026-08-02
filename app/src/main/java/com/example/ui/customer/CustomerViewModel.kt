package com.example.ui.customer
import com.example.BuildConfig

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.domain.model.Customer
import com.example.domain.model.CustomerStatus
import com.example.domain.model.MatchResult
import com.example.domain.model.Property
import com.example.domain.model.LinkRole
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.customer.GetCustomersUseCase
import com.example.domain.usecase.customer.AddCustomerUseCase
import com.example.domain.usecase.customer.UpdateCustomerUseCase
import com.example.domain.usecase.customer.DeleteCustomerUseCase
import com.example.domain.usecase.match.MatchEngineUseCase
import com.example.ui.common.AppLogger
import com.example.domain.usecase.property.TransferPropertyOwnershipUseCase
import com.example.domain.model.isEligibleForMatching
import com.example.domain.model.normalizeVietnamese
import com.example.domain.model.normalizeVietnamesePhone
import com.example.ui.property.CustomerMatchUiState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val MATCH_SCORE_THRESHOLD = 50

sealed class MatchUiState {
    object Idle : MatchUiState()
    object Loading : MatchUiState()
    data class Success(val results: List<MatchResult>) : MatchUiState()
    data class Empty(val message: String) : MatchUiState()
}

sealed class SyncUiState {
    object Idle : SyncUiState()
    object Loading : SyncUiState()
    data class Success(val message: String) : SyncUiState()
    data class Error(val message: String) : SyncUiState()
}

@HiltViewModel
class CustomerViewModel @Inject constructor(
    private val getCustomersUseCase: GetCustomersUseCase,
    private val addCustomerUseCase: AddCustomerUseCase,
    private val updateCustomerUseCase: UpdateCustomerUseCase,
    private val deleteCustomerUseCase: DeleteCustomerUseCase,
    private val matchEngineUseCase: MatchEngineUseCase,
    private val customerRepository: CustomerRepository,
    private val propertyRepository: PropertyRepository,
    private val driveHelper: com.example.data.remote.drive.DriveHelper,
    private val settingsManager: com.example.ui.common.SettingsManager,
    private val syncSingleCustomerUseCase: com.example.domain.usecase.sync.SyncSingleCustomerUseCase,
    private val prepareImageUseCase: com.example.domain.usecase.media.PrepareImageUseCase,
    private val snackbarManager: com.example.ui.common.SnackbarManager,
    private val transferPropertyOwnershipUseCase: TransferPropertyOwnershipUseCase
) : ViewModel() {

    private val TAG = "CustomerViewModel"

    private val _syncState = MutableStateFlow<SyncUiState>(SyncUiState.Idle)
    val syncState: StateFlow<SyncUiState> = _syncState.asStateFlow()

    fun syncSingleCustomer(customerId: String) {
        if (!driveHelper.isAuthorized()) {
            _syncState.value = SyncUiState.Error("Vui lòng kết nối Google Drive trong phần Cài đặt trước.")
            return
        }
        viewModelScope.launch {
            _syncState.value = SyncUiState.Loading
            syncSingleCustomerUseCase(customerId)
                .onSuccess {
                    _syncState.value = SyncUiState.Success("Đã sao lưu ✓")
                }
                .onFailure { e ->
                    _syncState.value = SyncUiState.Error("Sao lưu thất bại: ${e.localizedMessage}")
                }
        }
    }

    fun resetSyncState() {
        _syncState.value = SyncUiState.Idle
    }

    private val _searchQuery = MutableStateFlow("")
    val searchQuery = _searchQuery.asStateFlow()

    val ownerPropertyCounts: StateFlow<Map<String, Int>> = customerRepository.getOwnerPropertyCountsFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    private val _selectedCustomer = MutableStateFlow<Customer?>(null)
    val selectedCustomer = _selectedCustomer.asStateFlow()

    private val _selectedOwner = MutableStateFlow<Customer?>(null)
    val selectedOwner = _selectedOwner.asStateFlow()

    private val _linkedProperties = MutableStateFlow<List<Property>>(emptyList())
    val linkedProperties = _linkedProperties.asStateFlow()

    private val _matchingProperties = MutableStateFlow<List<MatchResult>>(emptyList())
    val matchingProperties = _matchingProperties.asStateFlow()

    private val _isMatching = MutableStateFlow(false)
    val isMatching = _isMatching.asStateFlow()

    private val _matchResults = MutableStateFlow<MatchUiState>(MatchUiState.Idle)
    val matchResults: StateFlow<MatchUiState> = _matchResults.asStateFlow()

    private val _customerMatchResults = MutableStateFlow<CustomerMatchUiState>(CustomerMatchUiState.Idle)
    val customerMatchResults: StateFlow<CustomerMatchUiState> = _customerMatchResults.asStateFlow()

    private val _selectedFilter = MutableStateFlow("Tất cả") // "Tất cả", "OWNER", "BUYER", "Đã giao dịch"
    val selectedFilter = _selectedFilter.asStateFlow()

    private val _distinctAreas = MutableStateFlow<List<String>>(emptyList())
    val distinctAreas = _distinctAreas.asStateFlow()

    val fabOnLeft: StateFlow<Boolean> = settingsManager.fabOnLeftFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    private val _duplicateCustomerNotice = MutableStateFlow<Customer?>(null)
    val duplicateCustomerNotice: StateFlow<Customer?> = _duplicateCustomerNotice.asStateFlow()

    fun checkDuplicatePhone(phoneInput: String) {
        viewModelScope.launch {
            if (phoneInput.isNotBlank()) {
                val normalized = phoneInput.normalizeVietnamesePhone()
                val existing = customerRepository.getCustomerByPhone(normalized)
                _duplicateCustomerNotice.value = existing
            } else {
                _duplicateCustomerNotice.value = null
            }
        }
    }

    // Form inputs
    val name = MutableStateFlow("")
    val phone = MutableStateFlow("")
    val role = MutableStateFlow("BUYER") // "BUYER" or "OWNER"
    val status = MutableStateFlow("ACTIVE") // "ACTIVE" or "CLOSED"
    val demandType = MutableStateFlow("Cần mua") // Compatibility
    val propertyType = MutableStateFlow("Nhà")
    val demandAreas = MutableStateFlow("") // separated by |||
    val demandDirections = MutableStateFlow("") // separated by |||
    val priceMin = MutableStateFlow("")
    val priceMax = MutableStateFlow("")
    val note = MutableStateFlow("")

    val avatarPath = MutableStateFlow<String?>(null)
    val avatarDriveUrl = MutableStateFlow<String?>(null)
    val isAvatarUploading = MutableStateFlow(false)

    init {
        loadDistinctAreas()
    }

    fun loadDistinctAreas() {
        viewModelScope.launch {
            try {
                _distinctAreas.value = propertyRepository.getAllDistinctAreas()
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Failed to load distinct areas: ${e.localizedMessage}")
                }
            }
        }
    }

    val customers: StateFlow<List<Customer>> = combine(
        getCustomersUseCase(),
        _searchQuery,
        _selectedFilter
    ) { list, query, filter ->
        val filteredList = when (filter) {
            "OWNER" -> list.filter { it.role == "OWNER" }
            "BUYER" -> list.filter { it.role == "BUYER" }
            "Đã giao dịch" -> list.filter { it.status == CustomerStatus.CLOSED.value }
            else -> list
        }

        if (query.isBlank()) {
            filteredList
        } else {
            filteredList.filter { c ->
                c.nameNormalized.contains(query, ignoreCase = true) || 
                c.name.contains(query, ignoreCase = true) ||
                c.phone.contains(query) ||
                c.noteNormalized.contains(query, ignoreCase = true)
            }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setFilter(filter: String) {
        _selectedFilter.value = filter
    }

    fun selectCustomer(customer: Customer?) {
        _selectedCustomer.value = customer
        if (customer != null) {
            findMatchesForCustomer(customer)
        } else {
            _matchingProperties.value = emptyList()
        }
    }

    private val _viewedProperties = MutableStateFlow<List<ViewedPropertyInfo>>(emptyList())
    val viewedProperties = _viewedProperties.asStateFlow()

    val allProperties: StateFlow<List<Property>> = propertyRepository.getAllPropertiesFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    fun addViewedProperty(customerId: String, propertyId: String, note: String, viewDate: String? = null) {
        viewModelScope.launch {
            try {
                val dateStr = if (!viewDate.isNullOrBlank()) {
                    viewDate
                } else {
                    java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date())
                }
                customerRepository.insertCustomerPropertyLink(
                    customerId = customerId,
                    propertyId = propertyId,
                    role = LinkRole.VIEWER.value,
                    viewDate = dateStr,
                    viewNote = note.ifBlank { "Không có ghi chú" }
                )
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Đã thêm liên kết xem nhà cho khách hàng $customerId, tài sản $propertyId")
                }
                selectOwner(_selectedOwner.value)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error adding viewed property link: ${e.localizedMessage}")
                }
            }
        }
    }

    fun updateCustomerNote(customer: Customer, newNote: String) {
        viewModelScope.launch {
            try {
                val trimmed = newNote.trim()
                val updated = customer.copy(
                    note = trimmed,
                    noteNormalized = trimmed.normalizeVietnamese(),
                    updatedAt = System.currentTimeMillis()
                )
                customerRepository.updateCustomer(updated, fromSync = false)
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Đã cập nhật ghi chú cho khách hàng ${customer.name}")
                }
                selectOwner(updated)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Lỗi khi cập nhật ghi chú: ${e.localizedMessage}")
                }
            }
        }
    }

    fun deleteViewingLink(customerId: String, propertyId: String) {
        viewModelScope.launch {
            try {
                customerRepository.softDeleteCustomerPropertyLink(customerId, propertyId)
                selectOwner(_selectedOwner.value)
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Đã xóa lượt xem nhà giữa khách hàng $customerId và tài sản $propertyId")
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Lỗi khi xóa lượt xem nhà: ${e.localizedMessage}")
                }
            }
        }
    }

    fun addOwnedProperties(customerId: String, propertyIds: List<String>) {
        viewModelScope.launch {
            try {
                for (propertyId in propertyIds) {
                    try {
                        transferPropertyOwnershipUseCase(propertyId, customerId)
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Đã gán quyền sở hữu tài sản $propertyId cho khách hàng $customerId")
                        }
                    } catch (e: Exception) {
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Lỗi khi gán quyền sở hữu tài sản $propertyId cho khách hàng $customerId: ${e.localizedMessage}")
                        }
                    }
                }
                selectOwner(_selectedOwner.value)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error in bulk ownership assignment: ${e.localizedMessage}")
                }
            }
        }
    }

    fun selectOwner(customer: Customer?) {
        _selectedOwner.value = customer
        if (customer != null) {
            viewModelScope.launch {
                try {
                    val properties = customerRepository.getPropertiesForCustomer(customer.id)
                    val links = customerRepository.getLinksForCustomer(customer.id)
                    
                    val combined = properties.map { prop ->
                        val link = links.find { it.propertyId == prop.id }
                        ViewedPropertyInfo(
                            property = prop,
                            viewDate = link?.viewDate,
                            viewNote = link?.viewNote,
                            role = LinkRole.fromValue(link?.role)
                        )
                    }
                    _viewedProperties.value = combined
                    _linkedProperties.value = properties
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã tải ${combined.size} tài sản liên kết cho '${customer.name}'")
                    }
                } catch (e: Exception) {
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Error loading owner properties: ${e.localizedMessage}")
                    }
                }
            }
        } else {
            _viewedProperties.value = emptyList()
            _linkedProperties.value = emptyList()
        }
    }

    fun findMatchesForCustomer(customer: Customer) {
        _isMatching.value = true
        viewModelScope.launch {
            try {
                val allProperties = propertyRepository.getVerifiedActiveProperties()
                val results = matchEngineUseCase.findMatchingProperties(customer, allProperties)
                val matches = results.filter { it.score >= MATCH_SCORE_THRESHOLD }
                _matchingProperties.value = matches
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Tìm thấy ${matches.size} BĐS phù hợp với khách '${customer.name}'")
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error matching properties: ${e.localizedMessage}")
                }
            } finally {
                _isMatching.value = false
            }
        }
    }

    fun onScanMatchingProperties(customer: Customer) {
        viewModelScope.launch {
            _matchResults.value = MatchUiState.Loading
            try {
                val allProperties = propertyRepository.getVerifiedActiveProperties()
                val results = matchEngineUseCase.findMatchingProperties(customer, allProperties)
                    .filter { it.score >= MATCH_SCORE_THRESHOLD }
                _matchResults.value = if (results.isEmpty()) {
                    MatchUiState.Empty("Không tìm thấy BĐS phù hợp")
                } else {
                    MatchUiState.Success(results)
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error scanning matching properties: ${e.localizedMessage}")
                }
                _matchResults.value = MatchUiState.Empty("Có lỗi xảy ra khi quét tìm BĐS")
            }
        }
    }
    fun onScanMatchingCustomersForProperty(property: Property, sellerCustomerId: String) {
        viewModelScope.launch {
            _customerMatchResults.value = CustomerMatchUiState.Loading
            try {
                val allCustomers = customerRepository.getAllCustomers()
                val candidateCustomers = allCustomers.filter {
                    it.isEligibleForMatching() && it.id != sellerCustomerId && (property.linkedCustomerId == null || it.id != property.linkedCustomerId)
                }
                val results = matchEngineUseCase.findMatchingCustomers(property, candidateCustomers)
                _customerMatchResults.value = if (results.isEmpty()) {
                    CustomerMatchUiState.Empty("Không tìm thấy khách hàng mua phù hợp")
                } else {
                    CustomerMatchUiState.Success(results)
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Error scanning matching customers for property: ${e.localizedMessage}")
                }
                _customerMatchResults.value = CustomerMatchUiState.Empty("Có lỗi xảy ra khi quét tìm khách mua")
            }
        }
    }

    fun resetMatchState() {
        _matchResults.value = MatchUiState.Idle
        _customerMatchResults.value = CustomerMatchUiState.Idle
    }

    fun loadFormWithCustomer(customer: Customer) {
        name.value = customer.name
        phone.value = customer.phone
        role.value = customer.role
        status.value = customer.status
        demandType.value = customer.demandType
        propertyType.value = customer.propertyType
        demandAreas.value = customer.demandAreas
        demandDirections.value = customer.demandDirections
        priceMin.value = customer.priceMin.toString()
        priceMax.value = customer.priceMax.toString()
        note.value = customer.note
        avatarPath.value = customer.avatarPath
        avatarDriveUrl.value = customer.avatarDriveUrl
    }

    fun clearForm() {
        name.value = ""
        phone.value = ""
        role.value = "BUYER"
        status.value = "ACTIVE"
        demandType.value = "Cần mua"
        propertyType.value = "Nhà"
        demandAreas.value = ""
        demandDirections.value = ""
        priceMin.value = ""
        priceMax.value = ""
        note.value = ""
        avatarPath.value = null
        avatarDriveUrl.value = null
        isAvatarUploading.value = false
        _duplicateCustomerNotice.value = null
    }

    fun saveCustomer(
        editingId: String? = null,
        prefilledPropertyId: String? = null,
        viewNote: String? = null
    ) {
        if (name.value.isBlank() || phone.value.isBlank()) return

        viewModelScope.launch {
            val minP = priceMin.value.toDoubleOrNull() ?: 0.0
            val maxP = priceMax.value.toDoubleOrNull() ?: 0.0

            val customerRole = if (prefilledPropertyId != null && editingId == null) "BUYER" else role.value

            val customer = Customer(
                id = editingId ?: java.util.UUID.randomUUID().toString(),
                name = name.value.trim(),
                phone = phone.value.trim(),
                demandType = if (customerRole == "OWNER") "Cần bán" else "Cần mua",
                role = customerRole,
                status = status.value,
                propertyType = propertyType.value,
                demandAreas = demandAreas.value.trim(),
                demandDirections = demandDirections.value.trim(),
                priceMin = minP,
                priceMax = maxP,
                note = note.value.trim(),
                updatedAt = System.currentTimeMillis(),
                avatarPath = avatarPath.value,
                avatarDriveUrl = avatarDriveUrl.value
            )

            if (editingId == null) {
                if (prefilledPropertyId != null) {
                    val formattedDate = java.text.SimpleDateFormat("dd/MM/yyyy", java.util.Locale.getDefault()).format(java.util.Date())
                    addCustomerUseCase(
                        customer = customer,
                        propertyId = prefilledPropertyId,
                        role = LinkRole.VIEWER.value,
                        viewDate = formattedDate,
                        viewNote = viewNote
                    )
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã thêm khách hàng mới liên kết với BĐS $prefilledPropertyId: ${customer.name}")
                    }
                } else {
                    addCustomerUseCase(customer)
                    if (BuildConfig.DEBUG) {
                        AppLogger.log(TAG, "Đã thêm khách hàng mới: ${customer.name} - SĐT: ${customer.phone}")
                    }
                }
            } else {
                updateCustomerUseCase(customer)
                if (BuildConfig.DEBUG) {
                    AppLogger.log(TAG, "Đã cập nhật khách hàng: ${customer.name}")
                }
            }
            clearForm()
        }
    }

    fun uploadAndSetAvatar(context: android.content.Context, customerId: String, uri: android.net.Uri, currentCustomer: Customer?) {
        viewModelScope.launch {
            try {
                isAvatarUploading.value = true
                val imagesDir = java.io.File(context.filesDir, "bds_images").apply { mkdirs() }
                val outputName = "CUST_AVATAR_" + customerId + "_" + java.util.UUID.randomUUID().toString().take(6) + ".jpg"
                val outputFile = java.io.File(imagesDir, outputName)
                
                val result = prepareImageUseCase.execute(uri, outputFile, 1024, 85)
                if (result is com.example.domain.usecase.media.PrepareImageUseCase.Result.Failure) {
                    isAvatarUploading.value = false
                    snackbarManager.showSnackbar("Lỗi nén ảnh: ${result.reason}")
                    return@launch
                }
                
                val localPath = outputFile.absolutePath
                avatarPath.value = localPath
                
                if (currentCustomer != null) {
                    val updatedLocal = currentCustomer.copy(avatarPath = localPath)
                    customerRepository.updateCustomer(updatedLocal)
                }
                
                val folderId = driveHelper.getOrCreateFolderPublic()
                val driveId = driveHelper.uploadMediaFile(localPath, folderId = folderId)
                if (driveId != null) {
                    avatarDriveUrl.value = driveId
                    if (currentCustomer != null) {
                        val updatedDrive = currentCustomer.copy(avatarPath = localPath, avatarDriveUrl = driveId)
                        customerRepository.updateCustomer(updatedDrive)
                        if (BuildConfig.DEBUG) {
                            AppLogger.log(TAG, "Đã upload avatar cho khách hàng ${currentCustomer.name} lên Drive ID: $driveId")
                        }
                    }
                    snackbarManager.showSnackbar("Đã cập nhật ảnh đại diện thành công!")
                } else {
                    snackbarManager.showSnackbar("Tải lên Google Drive thất bại, ảnh lưu tạm cục bộ.")
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "Lỗi nén/upload avatar", e)
                snackbarManager.showSnackbar("Lỗi: ${e.localizedMessage}")
            } finally {
                isAvatarUploading.value = false
            }
        }
    }

    fun deleteAvatar(context: android.content.Context, currentCustomer: Customer) {
        viewModelScope.launch {
            avatarPath.value = null
            avatarDriveUrl.value = null
            val updated = currentCustomer.copy(avatarPath = null, avatarDriveUrl = null)
            customerRepository.updateCustomer(updated)
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã xóa ảnh đại diện của khách hàng ${currentCustomer.name}")
            }
            snackbarManager.showSnackbar("Đã xóa ảnh đại diện")
        }
    }

    fun deleteCustomer(id: String) {
        viewModelScope.launch {
            val customer = customers.value.find { it.id == id }
            deleteCustomerUseCase(id)
            if (BuildConfig.DEBUG) {
                AppLogger.log(TAG, "Đã chuyển '${customer?.name ?: id}' vào thùng rác.")
            }
        }
    }
}

data class ViewedPropertyInfo(
    val property: Property,
    val viewDate: String?,
    val viewNote: String?,
    val role: LinkRole
)
