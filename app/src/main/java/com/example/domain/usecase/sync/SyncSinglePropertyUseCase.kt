package com.example.domain.usecase.sync

import android.util.Log
import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.PropertyRepository
import com.example.domain.model.toJsonDetail
import com.example.domain.model.getFolderName
import com.example.domain.model.toReadableText
import com.example.domain.model.SyncSinglePropertyResult
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject

class SyncSinglePropertyUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val syncMediaUseCase: SyncMediaUseCase,
    private val driveHelper: DriveHelper
) {
    suspend operator fun invoke(
        propertyId: String,
        accessToken: String? = null,
        onProgress: (current: Int, total: Int, imageName: String) -> Unit = { _, _, _ -> }
    ): SyncSinglePropertyResult {
        try {
            // Step a: Get Property
            val property = propertyRepository.getPropertyById(propertyId)
                ?: return SyncSinglePropertyResult(
                    mediaSuccess = false,
                    textFileSuccess = false,
                    errorMessage = "Không tìm thấy bất động sản"
                )

            // Step b: Sync images
            var uploadedSoFar = 0
            val mediaResult = syncMediaUseCase(
                propertyId = propertyId,
                accessToken = accessToken,
                onProgress = { current, total ->
                    onProgress(current, total, "$current|$total|ảnh|0")   // fallback tên chung nếu không lấy được tên file cụ thể ở bước này
                },
                onImageProcessed = { path, success, wasSkipped ->
                    if (success) {
                        uploadedSoFar++
                        val skipVal = if (wasSkipped) "1" else "0"
                        onProgress(uploadedSoFar, -1, "$uploadedSoFar|-1|${java.io.File(path).name}|$skipVal")  // total=-1 nghĩa là "chưa biết tổng tại thời điểm này"; SyncForegroundService sẽ tự xử lý hiển thị dạng đếm dồn nếu total=-1
                    }
                }
            )
            if (!mediaResult.isFullSuccess) {
                val failInfo = if (mediaResult.failedPaths.isNotEmpty()) " (Thất bại ${mediaResult.failedPaths.size}/${mediaResult.totalToUpload} ảnh)" else ""
                return SyncSinglePropertyResult(
                    mediaSuccess = false,
                    textFileSuccess = false,
                    errorMessage = "Đồng bộ hình ảnh thất bại$failInfo"
                )
            }

            // Reload property to get the updated driveMediaIds
            val updatedProperty = propertyRepository.getPropertyById(propertyId)
                ?: return SyncSinglePropertyResult(
                    mediaSuccess = true,
                    textFileSuccess = false,
                    errorMessage = "Lỗi tải lại dữ liệu bất động sản"
                )

            // Step c: Sync text
            val driveFiles = driveHelper.findJsonFiles(accessToken)
            val backupFile = driveFiles.find { it.first == "bds_collector_backup.json" }

            val propertiesArray = if (backupFile != null) {
                val existingContent = driveHelper.downloadJsonFileContent(backupFile.second, accessToken)
                if (!existingContent.isNullOrBlank()) {
                    try {
                        JSONArray(existingContent)
                    } catch (e: Exception) {
                        JSONArray()
                    }
                } else {
                    JSONArray()
                }
            } else {
                JSONArray()
            }

            // Create JSON object for the single updated property
            val propertyJson = updatedProperty.toJsonDetail(overrideTextSynced = true)

            // Search and replace or append
            var found = false
            for (i in 0 until propertiesArray.length()) {
                val obj = propertiesArray.getJSONObject(i)
                if (obj.optString("id") == updatedProperty.id) {
                    propertiesArray.put(i, propertyJson)
                    found = true
                    break
                }
            }
            if (!found) {
                propertiesArray.put(propertyJson)
            }

            // Write back to Google Drive
            val uploadSuccess = driveHelper.uploadOrUpdateJsonFile(
                fileName = "bds_collector_backup.json",
                content = propertiesArray.toString(),
                accessToken = accessToken
            ) != null

            if (!uploadSuccess) {
                return SyncSinglePropertyResult(
                    mediaSuccess = true,
                    textFileSuccess = false,
                    errorMessage = "Tải tệp bds_collector_backup.json lên Google Drive thất bại"
                )
            }

            // Part C: Write property_detail.json inside the property's drive folder
            val driveFolderId = updatedProperty.driveFolderId
            var textFileSuccess = true
            var textErrorMessage: String? = null

            if (!driveFolderId.isNullOrBlank()) {
                val detailFileIdResult = driveHelper.uploadOrUpdateJsonFile(
                    fileName = "property_detail.json",
                    content = propertyJson.toString(),
                    accessToken = accessToken,
                    folderId = driveFolderId,
                    cachedFileId = updatedProperty.propertyDetailJsonFileId
                )
                if (detailFileIdResult == null) {
                    return SyncSinglePropertyResult(
                        mediaSuccess = true,
                        textFileSuccess = false,
                        errorMessage = "Tải tệp property_detail.json lên Google Drive thất bại"
                    )
                }
                com.example.ui.common.AppLogger.log("SyncSingleProperty", "Ghi tệp property_detail.json thành công vào thư mục Drive ID: $driveFolderId")

                var newTxtFileId: String? = updatedProperty.txtFileId
                // Write readable txt file
                try {
                    val txtFileName = "${updatedProperty.getFolderName()}.txt"
                    val txtContent = updatedProperty.toReadableText()
                    val txtFileIdResult = driveHelper.uploadOrUpdateJsonFile(
                        fileName = txtFileName,
                        content = txtContent,
                        accessToken = accessToken,
                        folderId = driveFolderId,
                        cachedFileId = updatedProperty.txtFileId
                    )
                    if (txtFileIdResult != null) {
                        newTxtFileId = txtFileIdResult
                        com.example.ui.common.AppLogger.log("SyncSingleProperty", "Ghi tệp $txtFileName thành công vào thư mục Drive ID: $driveFolderId")
                    } else {
                        textFileSuccess = false
                        textErrorMessage = "Tải tệp $txtFileName lên Google Drive thất bại"
                        com.example.ui.common.AppLogger.log("SyncSingleProperty", "CẢNH BÁO: Ghi tệp $txtFileName thất bại")
                    }
                } catch (e: Exception) {
                    textFileSuccess = false
                    textErrorMessage = e.localizedMessage ?: "Lỗi ghi tệp .txt"
                    com.example.ui.common.AppLogger.log("SyncSingleProperty", "CẢNH BÁO: Ghi tệp txt thất bại: ${e.localizedMessage}")
                }

                // Update both IDs in database
                propertyRepository.updateDriveFileIds(propertyId, detailFileIdResult, newTxtFileId)
            } else {
                textFileSuccess = false
                textErrorMessage = "Không tìm thấy thư mục Google Drive của tài sản"
                com.example.ui.common.AppLogger.log("SyncSingleProperty", "CẢNH BÁO: Không tìm thấy driveFolderId cho property $propertyId")
            }

            // Update database sync status if textFileSuccess is true (Google Drive sync no longer updates local database sync status flags, but does update media sync status)
            if (textFileSuccess) {
                propertyRepository.updateMediaSyncStatus(propertyId, true, property.imagePath)
            }
            return SyncSinglePropertyResult(
                mediaSuccess = true,
                textFileSuccess = textFileSuccess,
                errorMessage = textErrorMessage
            )
        } catch (e: Exception) {
            return SyncSinglePropertyResult(
                mediaSuccess = false,
                textFileSuccess = false,
                errorMessage = e.localizedMessage ?: "Lỗi không xác định"
            )
        }
    }
}
