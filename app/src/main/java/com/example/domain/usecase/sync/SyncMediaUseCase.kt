package com.example.domain.usecase.sync

import android.util.Log
import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.PropertyRepository
import com.example.domain.model.toJsonDetail
import com.example.domain.model.getFolderName
import com.example.domain.model.toReadableText
import org.json.JSONObject
import java.io.File
import javax.inject.Inject

data class SyncMediaResult(
    val totalToUpload: Int,
    val uploadedCount: Int,
    val failedPaths: List<String>,
    val isFullSuccess: Boolean
)

class SyncMediaUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val driveHelper: DriveHelper
) {
    suspend operator fun invoke(
        propertyId: String,
        accessToken: String? = null,
        folderId: String? = null,
        onProgress: (Int, Int) -> Unit = { _, _ -> },
        onImageProcessed: (String, Boolean, Boolean) -> Unit = { _, _, _ -> }
    ): SyncMediaResult {
        var allStepsSuccess = true
        val property = propertyRepository.getPropertyById(propertyId)
        if (property == null) {
            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] SKIP property $propertyId - lý do: không tìm thấy trong DB")
            return SyncMediaResult(0, 0, emptyList(), false)
        }

        val parentFolderId = folderId ?: driveHelper.getOrCreateFolderPublic(accessToken)
        if (parentFolderId == null) {
            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] SKIP property $propertyId - lý do: parentFolderId (BDS_Collector_Media) là null")
            return SyncMediaResult(0, 0, emptyList(), false)
        }

        // Lấy hoặc tạo thư mục con riêng cho Property
        val targetFolderId = try {
            getOrCreatePropertyFolder(property, accessToken, parentFolderId)
        } catch (e: Exception) {
            Log.e("SYNC_UPLOAD_DEBUG", "LỖI tạo folder cho property $propertyId", e)
            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] LỖI tạo folder cho property $propertyId: ${e.localizedMessage}")
            null
        }

        if (targetFolderId == null) {
            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] SKIP property $propertyId - lý do: không lấy hoặc tạo được folder con")
            return SyncMediaResult(0, 0, emptyList(), false)
        }

        val imagePaths = property.imagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
        val existingLocalPaths = imagePaths.filter { File(it).exists() }
        
        imagePaths.forEach { path ->
            if (!File(path).exists()) {
                com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] SKIP ảnh $path - lý do: file không tồn tại")
                onImageProcessed(path, false, false)
            }
        }

        val totalToUpload = existingLocalPaths.size
        var uploadedCount = 0
        val failedPaths = mutableListOf<String>()

        if (totalToUpload > 0) {
            val currentMediaIds = try {
                JSONObject(property.driveMediaIds ?: "{}")
            } catch (e: Exception) {
                Log.e("SYNC_UPLOAD_DEBUG", "Lỗi parse driveMediaIds cho property $propertyId", e)
                JSONObject()
            }

            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] Property $propertyId: driveMediaIds=${property.driveMediaIds ?: "null/empty"}, localMediaPaths=${imagePaths.size}")

            val remoteFilesMap = driveHelper.listAllFilesInFolder(targetFolderId, accessToken)

            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] remoteFilesMap lấy được từ Drive có size: ${remoteFilesMap.size}")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] remoteFilesMap lấy được từ Drive có size: ${remoteFilesMap.size}")

            for (path in existingLocalPaths) {
                val file = File(path)
                val fileName = file.name
                
                val driveIdInMap = currentMediaIds.optString(path)
                if (!driveIdInMap.isNullOrBlank()) {
                    com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định: SKIP ảnh $path - lý do: đã có driveMediaId trong mapping ($driveIdInMap)")
                    uploadedCount++
                    onProgress(uploadedCount, totalToUpload)
                    onImageProcessed(path, true, true)
                    continue
                }
                
                val existingFileId = remoteFilesMap[fileName]
                
                com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Đang so khớp file cục bộ: fileName=$fileName, path=$path. Tìm thấy trên Drive ID: $existingFileId")
                android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Đang so khớp file cục bộ: fileName=$fileName, path=$path. Tìm thấy trên Drive ID: $existingFileId")

                if (existingFileId != null) {
                    com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định: SKIP ảnh $path - lý do: đã tồn tại trên Drive")
                    android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định: SKIP ảnh $path - lý do: đã tồn tại trên Drive")
                    com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] SKIP ảnh $path - lý do: đã có driveMediaId ($existingFileId)")
                    currentMediaIds.put(path, existingFileId)
                    uploadedCount++
                    onProgress(uploadedCount, totalToUpload)
                    onImageProcessed(path, true, true)
                } else {
                    com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định: UPLOAD ảnh $path - lý do: chưa tồn tại trên Drive")
                    android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định: UPLOAD ảnh $path - lý do: chưa tồn tại trên Drive")
                    com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] UPLOAD ảnh $path - bắt đầu")
                    Log.d("SYNC_UPLOAD_DEBUG", "Bắt đầu upload ảnh: $path")
                    val driveId = try {
                        val driveIdResult = driveHelper.uploadMediaFile(path, accessToken, targetFolderId, skipCheckExists = true)
                        if (driveIdResult != null) {
                            Log.d("SYNC_UPLOAD_DEBUG", "Upload OK: $path -> driveId=$driveIdResult")
                        } else {
                            Log.e("SYNC_UPLOAD_DEBUG", "Upload FAIL: $path (Không nhận được driveId từ Drive)", Exception("Không nhận được driveId từ Drive"))
                        }
                        driveIdResult
                    } catch (e: Exception) {
                        Log.e("SYNC_UPLOAD_DEBUG", "Upload FAIL: $path (Lỗi ngoại lệ: ${e.localizedMessage})", e)
                        com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] UPLOAD ảnh $path - thất bại (lỗi ngoại lệ: ${e.localizedMessage})")
                        null
                    }
                    if (driveId != null) {
                        com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] UPLOAD ảnh $path - thành công (driveMediaId: $driveId)")
                        currentMediaIds.put(path, driveId)
                        uploadedCount++
                        onProgress(uploadedCount, totalToUpload)
                        onImageProcessed(path, true, false)
                    } else {
                        com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] UPLOAD ảnh $path - thất bại (không nhận được driveId từ Drive)")
                        failedPaths.add(path)
                        onImageProcessed(path, false, false)
                    }
                }
            }

            if (uploadedCount > 0) {
                propertyRepository.updateDriveMediaIds(propertyId, currentMediaIds.toString())
            }

            if (failedPaths.isNotEmpty()) {
                for (attempt in 1..2) {
                    com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] Retry lần $attempt cho ${failedPaths.size} ảnh thất bại")
                    val currentFailures = failedPaths.toList()
                    for (path in currentFailures) {
                        Log.d("SYNC_UPLOAD_DEBUG", "Bắt đầu upload ảnh: $path")
                        val driveId = try {
                            val driveIdResult = driveHelper.uploadMediaFile(path, accessToken, targetFolderId, skipCheckExists = true)
                            if (driveIdResult != null) {
                                Log.d("SYNC_UPLOAD_DEBUG", "Upload OK: $path -> driveId=$driveIdResult")
                            } else {
                                Log.e("SYNC_UPLOAD_DEBUG", "RETRY $attempt FAIL: $path (Không nhận được driveId từ Drive)", Exception("Không nhận được driveId từ Drive"))
                            }
                            driveIdResult
                        } catch (e: Exception) {
                            Log.e("SYNC_UPLOAD_DEBUG", "RETRY $attempt FAIL: $path (Lỗi ngoại lệ: ${e.localizedMessage})", e)
                            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] RETRY $attempt ảnh $path - thất bại (lỗi ngoại lệ: ${e.localizedMessage})")
                            null
                        }
                        if (driveId != null) {
                            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] RETRY $attempt ảnh $path - thành công (driveMediaId: $driveId)")
                            currentMediaIds.put(path, driveId)
                            uploadedCount++
                            onProgress(uploadedCount, totalToUpload)
                            onImageProcessed(path, true, false)
                            failedPaths.remove(path)
                        } else {
                            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] RETRY $attempt ảnh $path - thất bại")
                        }
                        kotlinx.coroutines.delay(500L)
                    }
                    if (failedPaths.isEmpty()) {
                        break
                    }
                }
                if (uploadedCount > 0) {
                    propertyRepository.updateDriveMediaIds(propertyId, currentMediaIds.toString())
                }
            }
        }

        // If all files are successfully tracked/uploaded, update state
        val finalSuccess = allStepsSuccess && (uploadedCount == totalToUpload)

        // Write detail JSON and readable text files exactly once at the end
        try {
            val freshProperty = propertyRepository.getPropertyById(propertyId) ?: property
            val detailJson = freshProperty.toJsonDetail()
            val detailFileId = driveHelper.uploadOrUpdateJsonFile(
                fileName = "property_detail.json",
                content = detailJson.toString(),
                accessToken = accessToken,
                folderId = targetFolderId,
                cachedFileId = freshProperty.propertyDetailJsonFileId
            )
            
            val txtFileName = "${freshProperty.getFolderName()}.txt"
            val txtContent = freshProperty.toReadableText()
            val txtFileId = driveHelper.uploadOrUpdateJsonFile(
                fileName = txtFileName,
                content = txtContent,
                accessToken = accessToken,
                folderId = targetFolderId,
                cachedFileId = freshProperty.txtFileId
            )

            if (detailFileId != null || txtFileId != null) {
                propertyRepository.updateDriveFileIds(
                    id = propertyId,
                    propertyDetailJsonFileId = detailFileId ?: freshProperty.propertyDetailJsonFileId,
                    txtFileId = txtFileId ?: freshProperty.txtFileId
                )
            }

            if (detailFileId == null || txtFileId == null) {
                allStepsSuccess = false
                com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] CẢNH BÁO: Cập nhật files detail/txt thất bại cho property $propertyId")
            } else {
                com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] Đã cập nhật files detail và txt thành công cho property $propertyId")
            }
        } catch (e: Exception) {
            allStepsSuccess = false
            Log.e("SYNC_UPLOAD_DEBUG", "Cập nhật files detail/txt thất bại cho property $propertyId", e)
            com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] CẢNH BÁO: Cập nhật files detail/txt thất bại cho property $propertyId: ${e.localizedMessage}")
        }

        Log.d("SYNC_UPLOAD_DEBUG", "Property $propertyId: $uploadedCount ảnh thành công, ${failedPaths.size} ảnh thất bại")

        return SyncMediaResult(
            totalToUpload = totalToUpload,
            uploadedCount = uploadedCount,
            failedPaths = failedPaths.toList(),
            isFullSuccess = finalSuccess
        )
    }

    private suspend fun getOrCreatePropertyFolder(
        property: com.example.domain.model.Property,
        accessToken: String?,
        parentFolderId: String
    ): String? {
        var oldFolderIdExisted = false
        val preExistingFolderId = property.driveFolderId
        if (!preExistingFolderId.isNullOrBlank()) {
            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Đang xử lý propertyId: ${property.id}. driveFolderId hiện có trong DB trước khi check: $preExistingFolderId. Tiến hành gọi checkFolderExists...")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Đang xử lý propertyId: ${property.id}. driveFolderId hiện có trong DB trước khi check: $preExistingFolderId. Tiến hành gọi checkFolderExists...")
            val exists = driveHelper.checkFolderExists(preExistingFolderId, accessToken)
            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Kết quả checkFolderExists cho folderId $preExistingFolderId: $exists")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Kết quả checkFolderExists cho folderId $preExistingFolderId: $exists")
            if (exists) {
                com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định cuối: dùng folder cũ với ID: $preExistingFolderId")
                android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định cuối: dùng folder cũ với ID: $preExistingFolderId")
                return preExistingFolderId
            } else {
                oldFolderIdExisted = true
                com.example.ui.common.AppLogger.log("MediaSync", "[MediaSync] Phát hiện driveFolderId cũ (${preExistingFolderId}) không còn tồn tại cho property ${property.id}, tiến hành tạo lại...")
            }
        } else {
            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Đang xử lý propertyId: ${property.id}. Không có driveFolderId trong DB trước khi check.")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Đang xử lý propertyId: ${property.id}. Không có driveFolderId trong DB trước khi check.")
        }

        // Tạo tên folder theo định dạng {khu_vuc}_{ten_chu_nha}_{gia_trieu}_{property_id_rut_gon}
        val folderName = property.getFolderName()
        val priceToFreeze = property.priceAtFolderCreation ?: property.price
        
        com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định cuối: tạo folder mới với tên '$folderName'...")
        android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Quyết định cuối: tạo folder mới với tên '$folderName'...")
        val folderId = driveHelper.createFolderInParent(folderName, parentFolderId, accessToken)
        if (folderId != null) {
            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Đã tạo thành công folder mới với ID: $folderId")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Đã tạo thành công folder mới với ID: $folderId")
            // Lưu ngay vào Room DB cả driveFolderId và priceAtFolderCreation (sử dụng query targeted để tránh ghi đè full-row từ snapshot cũ)
            propertyRepository.updateDriveFolderInfo(property.id, folderId, priceToFreeze)
            if (oldFolderIdExisted) {
                com.example.ui.common.AppLogger.log("MediaSync", "Phát hiện driveFolderId cũ không còn tồn tại cho property ${property.id}, đã tạo lại folder mới: $folderId")
            }
        } else {
            com.example.ui.common.AppLogger.log("PropertyFolderDebug", "[PropertyFolderDebug] Lỗi: Không thể tạo folder mới cho propertyId: ${property.id}")
            android.util.Log.d("PropertyFolderDebug", "[PropertyFolderDebug] Lỗi: Không thể tạo folder mới cho propertyId: ${property.id}")
        }
        return folderId
    }
}
