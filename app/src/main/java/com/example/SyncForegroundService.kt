package com.example

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.example.domain.repository.PropertyRepository
import com.example.domain.usecase.sync.SyncMediaUseCase
import com.example.domain.model.SyncSinglePropertyResult
import com.example.domain.usecase.sync.SyncTextUseCase
import com.example.ui.common.AppLogger
import com.example.ui.common.NotificationHelper
import com.example.ui.common.SyncStatusBus
import com.example.ui.common.SyncProgress
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.example.domain.usecase.media.RestoreMissingMediaUseCase
import com.example.domain.usecase.media.DownloadResult

@AndroidEntryPoint
class SyncForegroundService : Service() {

    private val TAG = "SyncForegroundService"
    private val serviceScope = CoroutineScope(Dispatchers.IO + Job())

    @Inject
    lateinit var syncTextUseCase: SyncTextUseCase

    @Inject
    lateinit var syncMediaUseCase: SyncMediaUseCase

    @Inject
    lateinit var propertyRepository: PropertyRepository

    @Inject
    lateinit var customerRepository: com.example.domain.repository.CustomerRepository

    @Inject
    lateinit var driveHelper: com.example.data.remote.drive.DriveHelper

    @Inject
    lateinit var syncSinglePropertyUseCase: com.example.domain.usecase.sync.SyncSinglePropertyUseCase

    @Inject
    lateinit var restoreMissingMediaUseCase: RestoreMissingMediaUseCase

    private val notificationManager by lazy {
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "SyncForegroundService created")
        _isRunning.value = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "SyncForegroundService started onStartCommand")

        // Capture startId để mỗi coroutine chỉ dừng ĐÚNG lệnh của mình.
        // Nếu dùng stopSelf() không tham số, coroutine xong trước sẽ giết cả service
        // và cắt ngang các lệnh sync khác đang chạy (nhiều lệnh gửi dồn dập).
        val currentStartId = startId

        // Start foreground immediately
        val initialNotification = createNotification("Chuẩn bị đồng bộ dữ liệu...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NotificationHelper.TEXT_SYNC_NOTIFICATION_ID,
                initialNotification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(
                NotificationHelper.TEXT_SYNC_NOTIFICATION_ID,
                initialNotification
            )
        }

        val propertyId = intent?.getStringExtra("PROPERTY_ID")
        if (!propertyId.isNullOrBlank()) {
            serviceScope.launch {
                var propertyArea = "BĐS"
                try {
                    val property = propertyRepository.getPropertyById(propertyId)
                    val localImages = property?.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                    if (property != null) {
                        propertyArea = property.area
                    }
                    updateNotification("Đang đồng bộ $propertyArea...", "Đồng bộ BĐS")
                    SyncStatusBus.update(SyncProgress("Đang đồng bộ $propertyArea", indeterminate = true))
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                        status = com.example.data.local.entity.SyncStatus.STARTED,
                        tag = TAG,
                        message = "Bắt đầu đồng bộ đơn lẻ BĐS: $propertyArea"
                    )

                    val result = syncSinglePropertyUseCase(
                        propertyId,
                        onProgress = { current, total, imageName ->
                            val parts = imageName.split("|")
                            val actualCurrent = if (parts.size >= 4) (parts[0].toIntOrNull() ?: current) else current
                            val actualTotal = if (parts.size >= 4) (parts[1].toIntOrNull() ?: total) else total
                            val displayImageName = if (parts.size >= 4) parts[2] else imageName
                            val wasSkipped = if (parts.size >= 4) (parts[3] == "1") else false

                            val actionPrefix = if (wasSkipped) "Đang kiểm tra" else "Đang tải lên"
                            val label = if (actualTotal > 0) {
                                "$actionPrefix: $displayImageName ($actualCurrent/$actualTotal)"
                            } else {
                                "$actionPrefix: $displayImageName (đã xong $actualCurrent ảnh)"
                            }
                            SyncStatusBus.update(SyncProgress(label, actualCurrent, if (actualTotal > 0) actualTotal else 0, indeterminate = (actualTotal <= 0)))
                            updateNotification(label, "Đồng bộ BĐS")
                        }
                    )
                    if (result.mediaSuccess) {
                        if (result.textFileSuccess) {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                                tag = TAG,
                                message = "Đồng bộ đơn lẻ BĐS hoàn tất: $propertyArea"
                            )
                            NotificationHelper.showSystemNotification(
                                applicationContext,
                                "Đồng bộ hoàn tất",
                                "Đã đồng bộ $propertyArea",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        } else {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                                status = com.example.data.local.entity.SyncStatus.PARTIAL,
                                tag = TAG,
                                message = "Đồng bộ đơn lẻ BĐS hoàn tất một phần: $propertyArea (Lỗi văn bản: ${result.errorMessage})"
                            )
                            NotificationHelper.showSystemNotification(
                                applicationContext,
                                "Đồng bộ hoàn tất một phần",
                                "Đã sao lưu ảnh, nhưng lỗi văn bản: ${result.errorMessage}",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        }
                    } else {
                        val errorMsg = result.errorMessage ?: "Lỗi không xác định"
                        AppLogger.record(
                            type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = TAG,
                            message = "Đồng bộ đơn lẻ BĐS thất bại: $propertyArea - $errorMsg"
                        )
                        NotificationHelper.showSystemNotification(
                            applicationContext,
                            "Đồng bộ thất bại",
                            "Đồng bộ thất bại: $propertyArea - $errorMsg",
                            NotificationHelper.TEXT_SYNC_RESULT_ID
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Lỗi đồng bộ single property", e)
                    val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi đồng bộ đơn lẻ BĐS $propertyArea: $errorMsg"
                    )
                    NotificationHelper.showSystemNotification(
                        applicationContext,
                        "Đồng bộ thất bại",
                        "Đồng bộ thất bại: $propertyArea - $errorMsg",
                        NotificationHelper.TEXT_SYNC_RESULT_ID
                    )
                } finally {
                    SyncStatusBus.clear()
                    stopSelf(currentStartId)
                }
            }
            return START_NOT_STICKY
        }

        val unverifiedId = intent?.getStringExtra("UNVERIFIED_ID")
        if (!unverifiedId.isNullOrBlank()) {
            serviceScope.launch {
                var unverifiedArea = "Sản phẩm chờ"
                try {
                    val unverified = propertyRepository.getUnverifiedById(unverifiedId)
                    if (unverified != null) {
                        unverifiedArea = unverified.area.ifBlank { "Sản phẩm chờ" }
                    }
                    updateNotification("Đang đồng bộ $unverifiedArea...", "Đồng bộ sản phẩm chờ")
                    SyncStatusBus.update(SyncProgress("Đang đồng bộ $unverifiedArea", indeterminate = true))
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.UPLOAD_UNVERIFIED,
                        status = com.example.data.local.entity.SyncStatus.STARTED,
                        tag = TAG,
                        message = "Bắt đầu đồng bộ đơn lẻ Tin khảo sát: $unverifiedArea"
                    )

                    val result = syncSinglePropertyUseCase(
                        unverifiedId,
                        onProgress = { current, total, imageName ->
                            val parts = imageName.split("|")
                            val actualCurrent = if (parts.size >= 4) (parts[0].toIntOrNull() ?: current) else current
                            val actualTotal = if (parts.size >= 4) (parts[1].toIntOrNull() ?: total) else total
                            val displayImageName = if (parts.size >= 4) parts[2] else imageName
                            val wasSkipped = if (parts.size >= 4) (parts[3] == "1") else false

                            val actionPrefix = if (wasSkipped) "Đang kiểm tra" else "Đang tải lên"
                            val label = if (actualTotal > 0) {
                                "$actionPrefix: $displayImageName ($actualCurrent/$actualTotal)"
                            } else {
                                "$actionPrefix: $displayImageName (đã xong $actualCurrent ảnh)"
                            }
                            SyncStatusBus.update(SyncProgress(label, actualCurrent, if (actualTotal > 0) actualTotal else 0, indeterminate = (actualTotal <= 0)))
                            updateNotification(label, "Đồng bộ sản phẩm chờ")
                        }
                    )
                    if (result.mediaSuccess) {
                        if (result.textFileSuccess) {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.UPLOAD_UNVERIFIED,
                                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                                tag = TAG,
                                message = "Đồng bộ đơn lẻ Tin khảo sát hoàn tất: $unverifiedArea"
                            )
                            NotificationHelper.showSystemNotification(
                                applicationContext,
                                "Đồng bộ hoàn tất",
                                "Đã đồng bộ $unverifiedArea",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        } else {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.UPLOAD_UNVERIFIED,
                                status = com.example.data.local.entity.SyncStatus.PARTIAL,
                                tag = TAG,
                                message = "Đồng bộ đơn lẻ Tin khảo sát hoàn tất một phần: $unverifiedArea (Lỗi văn bản: ${result.errorMessage})"
                            )
                            NotificationHelper.showSystemNotification(
                                applicationContext,
                                "Đồng bộ hoàn tất một phần",
                                "Đã sao lưu ảnh, nhưng lỗi văn bản: ${result.errorMessage}",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        }
                    } else {
                        val errorMsg = result.errorMessage ?: "Lỗi không xác định"
                        AppLogger.record(
                            type = com.example.data.local.entity.SyncType.UPLOAD_UNVERIFIED,
                            status = com.example.data.local.entity.SyncStatus.FAILED,
                            tag = TAG,
                            message = "Đồng bộ đơn lẻ Tin khảo sát thất bại: $unverifiedArea - $errorMsg"
                        )
                        NotificationHelper.showSystemNotification(
                            applicationContext,
                            "Đồng bộ thất bại",
                            "Đồng bộ thất bại: $unverifiedArea - $errorMsg",
                            NotificationHelper.TEXT_SYNC_RESULT_ID
                        )
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Lỗi đồng bộ single unverified", e)
                    val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.UPLOAD_UNVERIFIED,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi đồng bộ đơn lẻ Tin khảo sát $unverifiedArea: $errorMsg"
                    )
                    NotificationHelper.showSystemNotification(
                        applicationContext,
                        "Đồng bộ thất bại",
                        "Đồng bộ thất bại: $unverifiedArea - $errorMsg",
                        NotificationHelper.TEXT_SYNC_RESULT_ID
                    )
                } finally {
                    SyncStatusBus.clear()
                    stopSelf(currentStartId)
                }
            }
            return START_NOT_STICKY
        }

        val downloadPropertyId = intent?.getStringExtra("DOWNLOAD_PROPERTY_ID")
        if (!downloadPropertyId.isNullOrBlank()) {
            serviceScope.launch {
                var propertyArea = "BĐS"
                try {
                    val property = propertyRepository.getPropertyById(downloadPropertyId)
                    if (property != null) propertyArea = property.area
                    updateNotification("Đang tải ảnh về: $propertyArea...", "Tải ảnh về máy")
                    SyncStatusBus.update(SyncProgress("Đang tải ảnh về: $propertyArea", indeterminate = true))
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.STARTED,
                        tag = TAG,
                        message = "Bắt đầu tải ảnh đơn lẻ: $propertyArea"
                    )

                    when (val result = restoreMissingMediaUseCase.downloadSinglePropertyImages(downloadPropertyId)) {
                        is DownloadResult.Success -> {
                            val msg = if (result.downloadedCount > 0) "Đã tải ${result.downloadedCount} ảnh về máy" else "Ảnh đã đầy đủ trên máy"
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                                status = com.example.data.local.entity.SyncStatus.SUCCESS,
                                tag = TAG,
                                message = "$msg ($propertyArea)"
                            )
                            Log.d(TAG, "DOWNLOAD_PROPERTY_ID: Calling showSystemNotification [Success branch] - count: ${result.downloadedCount}, message: $msg")
                            NotificationHelper.showSystemNotification(
                                applicationContext, "Tải ảnh hoàn tất", "$propertyArea: $msg",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        }
                        is DownloadResult.NoDriveAuth -> {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                                status = com.example.data.local.entity.SyncStatus.FAILED,
                                tag = TAG,
                                message = "Chưa liên kết Drive ($propertyArea)"
                            )
                            Log.d(TAG, "DOWNLOAD_PROPERTY_ID: Calling showSystemNotification [NoDriveAuth branch]")
                            NotificationHelper.showSystemNotification(
                                applicationContext, "Tải ảnh thất bại", "Chưa liên kết Google Drive",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        }
                        is DownloadResult.Failed -> {
                            AppLogger.record(
                                type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                                status = com.example.data.local.entity.SyncStatus.FAILED,
                                tag = TAG,
                                message = "Tải ảnh thất bại: ${result.message} ($propertyArea)"
                            )
                            Log.d(TAG, "DOWNLOAD_PROPERTY_ID: Calling showSystemNotification [Failed branch] - error: ${result.message}")
                            NotificationHelper.showSystemNotification(
                                applicationContext, "Tải ảnh thất bại", "$propertyArea: ${result.message}",
                                NotificationHelper.TEXT_SYNC_RESULT_ID
                            )
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Lỗi tải ảnh đơn lẻ $downloadPropertyId", e)
                    AppLogger.record(
                        type = com.example.data.local.entity.SyncType.DOWNLOAD_MEDIA,
                        status = com.example.data.local.entity.SyncStatus.FAILED,
                        tag = TAG,
                        message = "Lỗi tải ảnh $propertyArea: ${e.localizedMessage}"
                    )
                    Log.d(TAG, "DOWNLOAD_PROPERTY_ID: Calling showSystemNotification [Exception branch] - error: ${e.localizedMessage}")
                    NotificationHelper.showSystemNotification(
                        applicationContext, "Tải ảnh thất bại", "$propertyArea: ${e.localizedMessage}",
                        NotificationHelper.TEXT_SYNC_RESULT_ID
                    )
                } finally {
                    SyncStatusBus.clear()
                    stopSelf(currentStartId)
                }
            }
            return START_NOT_STICKY
        }

        // Run sync job
        serviceScope.launch {
            var totalBds = 0
            var totalImages = 0
            var totalAvatars = 0
            var successCount = 0
            var unvSuccessCount = 0
            try {
                AppLogger.record(
                    type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                    status = com.example.data.local.entity.SyncStatus.STARTED,
                    tag = TAG,
                    message = "Bắt đầu đồng bộ toàn bộ"
                )
                // 1. Sync Media (Properties & Customers) FIRST to populate driveMediaIds
                updateNotification("Đang tải danh sách ảnh cần đồng bộ...")
                SyncStatusBus.update(SyncProgress("Đang tải danh sách ảnh cần đồng bộ...", indeterminate = true))
                val properties = propertyRepository.getVerifiedProperties()
                val propertiesWithImages = properties.filter { !it.imagePath.isNullOrBlank() && !it.isMediaSynced }

                totalBds = propertiesWithImages.size
                
                val allUnverified = propertyRepository.getAllUnverified()
                val unverifiedToSync = allUnverified.filter { unv ->
                    val localImages = unv.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                    val driveIdsMap = try {
                        if (!unv.driveMediaIds.isNullOrBlank() && unv.driveMediaIds != "null") org.json.JSONObject(unv.driveMediaIds) else org.json.JSONObject()
                    } catch (e: Exception) { org.json.JSONObject() }
                    val isMissingAnyDriveId = localImages.any { driveIdsMap.optString(it, "").isBlank() }
                    val hasLocalImages = localImages.isNotEmpty()
                    val notSynced = !unv.isMediaSynced || isMissingAnyDriveId
                    hasLocalImages && notSynced
                }
                
                AppLogger.log("MediaSync", "[MediaSync] Bắt đầu đồng bộ media cho ${propertiesWithImages.size} property (unverified cần sync: ${unverifiedToSync.size})")
                
                val propertyImagesCount = propertiesWithImages.sumOf { p ->
                    p.imagePath?.split("|||")?.filter { it.isNotBlank() }?.size ?: 0
                }
                val unverifiedImagesCount = unverifiedToSync.sumOf { u ->
                    u.imagePath?.split("|||")?.filter { it.isNotBlank() }?.size ?: 0
                }
                totalImages = propertyImagesCount + unverifiedImagesCount

                val customers = customerRepository.getAllCustomers()
                val customersWithAvatars = customers.filter {
                    !it.avatarPath.isNullOrBlank() && java.io.File(it.avatarPath).exists()
                }
                totalAvatars = customersWithAvatars.size

                val totalMedia = totalImages + totalAvatars

                if (totalMedia == 0) {
                    AppLogger.log(TAG, "Không có hình ảnh cục bộ nào cần đồng bộ.")
                } else {
                    val folderId = driveHelper.getOrCreateFolderPublic(null)
                    successCount = 0
                    var globalImageIndex = 0

                    // Sync Property Images
                    for ((index, property) in propertiesWithImages.withIndex()) {
                        val localImages = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
                        AppLogger.log(TAG, "Đang đồng bộ ảnh cho BĐS: ${property.area} (${index + 1}/$totalBds)")
                        SyncStatusBus.update(SyncProgress("Đang đồng bộ BĐS", index + 1, totalBds))
                        NotificationHelper.showSyncProgress(
                            applicationContext,
                            "Đang đồng bộ BĐS",
                            index + 1,
                            totalBds,
                            false,
                            NotificationHelper.TEXT_SYNC_NOTIFICATION_ID
                        )
                        
                        val mediaResult = syncMediaUseCase(
                            propertyId = property.id,
                            accessToken = null,
                            folderId = folderId,
                            onImageProcessed = { _, _, _ ->
                                globalImageIndex++
                                val progressText = "Đang upload ảnh BĐS ($globalImageIndex/$totalMedia ảnh - ${index + 1}/$totalBds BĐS)"
                                updateNotification(progressText)
                            }
                        )
                        if (mediaResult.isFullSuccess) {
                            successCount++
                            AppLogger.log(TAG, "Đồng bộ ảnh BĐS '${property.area}' thành công. Đã upload ${mediaResult.uploadedCount}/${mediaResult.totalToUpload} ảnh.")
                            propertyRepository.updateMediaSyncStatus(property.id, true, property.imagePath)
                        } else {
                            AppLogger.log(TAG, "Không thể đồng bộ ảnh BĐS '${property.area}' (Thành công ${mediaResult.uploadedCount}/${mediaResult.totalToUpload} ảnh, lỗi ${mediaResult.failedPaths.size} ảnh).")
                        }
                    }

                    // Sync Unverified Property Images
                    unvSuccessCount = 0
                    if (unverifiedToSync.isNotEmpty()) {
                        AppLogger.log(TAG, "Bắt đầu đồng bộ ảnh cho ${unverifiedToSync.size} sản phẩm chờ...")
                        for ((uIndex, unv) in unverifiedToSync.withIndex()) {
                            AppLogger.log(TAG, "Đang đồng bộ ảnh cho sản phẩm chờ: ${unv.title ?: unv.id} (${uIndex + 1}/${unverifiedToSync.size})")
                            val progressText = "Đang upload ảnh tin thô ($globalImageIndex/$totalMedia ảnh - ${uIndex + 1}/${unverifiedToSync.size} tin)"
                            updateNotification(progressText)
                            
                            val mediaResult = syncMediaUseCase(
                                propertyId = unv.id,
                                accessToken = null,
                                folderId = folderId,
                                onImageProcessed = { _, _, _ ->
                                    globalImageIndex++
                                    val currentProgressText = "Đang upload ảnh tin thô ($globalImageIndex/$totalMedia ảnh - ${uIndex + 1}/${unverifiedToSync.size} tin)"
                                    updateNotification(currentProgressText)
                                }
                            )
                            if (mediaResult.isFullSuccess) {
                                unvSuccessCount++
                                AppLogger.log(TAG, "Đồng bộ ảnh sản phẩm chờ '${unv.title ?: unv.id}' thành công.")
                                propertyRepository.updateMediaSyncStatus(unv.id, true, unv.imagePath)
                            } else {
                                AppLogger.log(TAG, "Đồng bộ ảnh sản phẩm chờ '${unv.title ?: unv.id}' thất bại.")
                            }
                        }
                    }

                    // Sync Customer Avatars
                    if (customersWithAvatars.isNotEmpty()) {
                        AppLogger.log(TAG, "Bắt đầu tải lên $totalAvatars ảnh đại diện khách hàng...")
                        for ((cIndex, customer) in customersWithAvatars.withIndex()) {
                            val avatarPath = customer.avatarPath!!
                            AppLogger.log(TAG, "Đang tải lên avatar cho khách hàng: ${customer.name} (${cIndex + 1}/$totalAvatars)")
                            
                            val fileId = driveHelper.uploadMediaFile(avatarPath, null, folderId)
                            if (!fileId.isNullOrBlank()) {
                                customerRepository.updateAvatarDriveUrl(customer.id, fileId)
                                AppLogger.log(TAG, "Cập nhật avatarDriveUrl thành công cho ${customer.name}: $fileId")
                            } else {
                                AppLogger.log(TAG, "Tải lên avatar cho khách hàng ${customer.name} thất bại.")
                            }
                            globalImageIndex++
                            val progressText = "Đang upload ảnh đại diện ($globalImageIndex/$totalMedia ảnh - ${cIndex + 1}/$totalAvatars khách)"
                            updateNotification(progressText)
                        }
                    }

                    AppLogger.log(TAG, "Đồng bộ ảnh hoàn tất! Thành công: $successCount/$totalBds BĐS, $unvSuccessCount/${unverifiedToSync.size} tin thô, $totalAvatars ảnh đại diện.")
                }

                // 2. Sync Text SECOND (with driveMediaIds now fully written to local DB)
                updateNotification("Đang sao lưu dữ liệu... (0/4 file)")
                AppLogger.log(TAG, "Bắt đầu sao lưu toàn bộ dữ liệu văn bản...")
                val textSuccess = syncTextUseCase(
                    onProgress = { current, total ->
                        updateNotification("Đang sao lưu dữ liệu... ($current/$total tệp)")
                    }
                )
                
                if (textSuccess) {
                    AppLogger.log(TAG, "Sao lưu dữ liệu văn bản lên Google Drive THÀNH CÔNG.")
                } else {
                    AppLogger.log(TAG, "Sao lưu dữ liệu văn bản thất bại (Vui lòng kiểm tra liên kết Drive).")
                }

                val unvToSyncCount = unverifiedToSync.size
                val isFullySuccessful = (successCount == totalBds) && (unvSuccessCount == unvToSyncCount) && (textSuccess == true)
                val finalNotificationText = if (isFullySuccessful) {
                    "Đồng bộ hoàn tất: $successCount BĐS, $unvSuccessCount tin thô, ${totalImages + totalAvatars} ảnh ✓"
                } else {
                    "Đồng bộ MỘT PHẦN: $successCount/$totalBds BĐS, $unvSuccessCount/$unvToSyncCount tin thô. Dữ liệu văn bản: ${if (textSuccess) "OK" else "LỖI"}. Vui lòng thử lại."
                }
                updateNotification(finalNotificationText)

                AppLogger.record(
                    type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                    status = if (isFullySuccessful) com.example.data.local.entity.SyncStatus.SUCCESS else com.example.data.local.entity.SyncStatus.PARTIAL,
                    tag = TAG,
                    message = finalNotificationText,
                    itemCount = successCount + unvSuccessCount,
                    totalCount = totalBds + unvToSyncCount
                )

                // Write result to SharedPreferences (Part C3)
                val prefs = applicationContext.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                val timeString = java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault()).format(java.util.Date())
                val lastSyncStatusVal = if (isFullySuccessful) {
                    "Lần cuối: $timeString — $successCount BĐS, ${totalImages + totalAvatars} ảnh ✓"
                } else {
                    "Lần cuối: $timeString — MỘT PHẦN: $successCount/$totalBds BĐS. Văn bản: ${if (textSuccess) "OK" else "LỖI"}"
                }
                prefs.edit()
                    .putString("last_sync_status", lastSyncStatusVal)
                    .apply()

                // Show result notification
                val systemTitle = if (isFullySuccessful) "Đồng bộ hoàn tất" else "Đồng bộ một phần/thất bại"
                val systemMessage = if (isFullySuccessful) "Dữ liệu và hình ảnh đã được đồng bộ lên Google Drive." else finalNotificationText
                NotificationHelper.showSystemNotification(
                    applicationContext,
                    systemTitle,
                    systemMessage,
                    NotificationHelper.TEXT_SYNC_RESULT_ID
                )

            } catch (e: Exception) {
                Log.e(TAG, "Error in SyncForegroundService", e)
                val errorMsg = e.localizedMessage ?: "Lỗi không xác định"
                AppLogger.record(
                    type = com.example.data.local.entity.SyncType.UPLOAD_PROPERTY,
                    status = com.example.data.local.entity.SyncStatus.FAILED,
                    tag = TAG,
                    message = "Đồng bộ dữ liệu gặp lỗi: $errorMsg"
                )
                updateNotification("Lỗi đồng bộ: $errorMsg")
                
                // Write error result to SharedPreferences (Part C3)
                val prefs = applicationContext.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                val timeString = java.text.SimpleDateFormat("HH:mm dd/MM", java.util.Locale.getDefault()).format(java.util.Date())
                prefs.edit()
                    .putString("last_sync_status", "Lần cuối: thất bại lúc $timeString — $errorMsg")
                    .apply()

                NotificationHelper.showSystemNotification(
                    applicationContext,
                    "Đồng bộ thất bại",
                    "Lỗi đồng bộ: $errorMsg",
                    NotificationHelper.TEXT_SYNC_RESULT_ID
                )
            } finally {
                SyncStatusBus.clear()
                stopSelf(currentStartId)
            }
        }

        return START_NOT_STICKY
    }

    private fun createNotification(contentText: String, contentTitle: String = "BĐS Collector Sync"): Notification {
        return NotificationCompat.Builder(this, NotificationHelper.SYNC_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(contentTitle)
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(contentText: String, contentTitle: String = "BĐS Collector Sync") {
        val notification = createNotification(contentText, contentTitle)
        notificationManager.notify(NotificationHelper.TEXT_SYNC_NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "SyncForegroundService destroyed")
        // Huỷ mọi coroutine còn treo để không có tác vụ chạy ngầm sau khi service chết.
        // Bình thường finally đã stopSelf sau khi xong nên scope rỗng; cancel() ở đây là
        // lớp bảo hiểm khi OS giết service giữa chừng.
        serviceScope.cancel()
        _isRunning.value = false
    }

    companion object {
        private val _isRunning = MutableStateFlow(false)
        val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()
    }
}
