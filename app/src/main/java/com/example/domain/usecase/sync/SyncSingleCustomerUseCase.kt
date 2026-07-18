package com.example.domain.usecase.sync

import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.CustomerRepository
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject

class SyncSingleCustomerUseCase @Inject constructor(
    private val customerRepository: CustomerRepository,
    private val driveHelper: DriveHelper
) {
    suspend operator fun invoke(
        customerId: String,
        accessToken: String? = null
    ): Result<Unit> {
        try {
            // Step a: Get Customer
            val customer = customerRepository.getCustomerById(customerId)
                ?: return Result.failure(Exception("Không tìm thấy khách hàng"))

            // Step b: Sync avatar if present
            val avatarPath = customer.avatarPath
            if (!avatarPath.isNullOrBlank()) {
                val parentFolderId = driveHelper.getOrCreateFolderPublic(accessToken)
                if (parentFolderId == null) {
                    return Result.failure(Exception("Không thể tìm hoặc tạo thư mục gốc BDS_Collector_Media"))
                }

                val customersFolderId = driveHelper.getOrCreateSubFolder(parentFolderId, "Customers", accessToken)
                if (customersFolderId == null) {
                    return Result.failure(Exception("Không thể tìm hoặc tạo thư mục Customers"))
                }
                
                val file = java.io.File(avatarPath)
                val extension = file.extension.ifBlank { "jpg" }
                val customFileName = "${customerId}_avatar.${extension}"

                val driveFileId = driveHelper.uploadMediaFile(
                    avatarPath,
                    accessToken,
                    customersFolderId,
                    skipCheckExists = false,
                    customFileName = customFileName
                )
                if (!driveFileId.isNullOrBlank()) {
                    customerRepository.updateAvatarDriveUrl(customerId, driveFileId)
                } else {
                    return Result.failure(Exception("Đồng bộ ảnh đại diện lên Google Drive thất bại"))
                }
            }

            // Reload customer to get the updated avatarDriveUrl
            val updatedCustomer = customerRepository.getCustomerById(customerId)
                ?: return Result.failure(Exception("Lỗi tải lại dữ liệu khách hàng"))

            // Step c: Sync text to bds_customers_backup.json
            val driveFiles = driveHelper.findJsonFiles(accessToken)
            val customersFile = driveFiles.find { it.first == "bds_customers_backup.json" }

            val customersArray = if (customersFile != null) {
                val existingContent = driveHelper.downloadJsonFileContent(customersFile.second, accessToken)
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

            // Create JSON object for the single updated customer
            val customerJson = JSONObject().apply {
                put("id", updatedCustomer.id)
                put("name", updatedCustomer.name)
                put("nameNormalized", updatedCustomer.nameNormalized)
                put("phone", updatedCustomer.phone)
                put("demandType", updatedCustomer.demandType)
                put("propertyType", updatedCustomer.propertyType)
                put("demandAreas", updatedCustomer.demandAreas)
                put("demandDirections", updatedCustomer.demandDirections)
                put("priceMin", updatedCustomer.priceMin)
                put("priceMax", updatedCustomer.priceMax)
                put("note", updatedCustomer.note)
                put("noteNormalized", updatedCustomer.noteNormalized)
                put("role", updatedCustomer.role)
                put("status", updatedCustomer.status)
                put("updatedAt", updatedCustomer.updatedAt)
                put("isSynced", true) // Mark as synced
                put("isDeleted", updatedCustomer.isDeleted)
                put("avatarPath", updatedCustomer.avatarPath)
                put("avatarDriveUrl", updatedCustomer.avatarDriveUrl)
            }

            // Search and replace or append
            var found = false
            for (i in 0 until customersArray.length()) {
                val obj = customersArray.getJSONObject(i)
                if (obj.optString("id") == updatedCustomer.id) {
                    customersArray.put(i, customerJson)
                    found = true
                    break
                }
            }
            if (!found) {
                customersArray.put(customerJson)
            }

            // Write customers backup back to Google Drive
            val uploadSuccess = driveHelper.uploadOrUpdateJsonFile(
                fileName = "bds_customers_backup.json",
                content = customersArray.toString(),
                accessToken = accessToken
            ) != null

            if (!uploadSuccess) {
                return Result.failure(Exception("Tải tệp bds_customers_backup.json lên Google Drive thất bại"))
            }

            // Update database sync status (Google Drive sync no longer updates local database sync status flags)
            return Result.success(Unit)
        } catch (e: Exception) {
            return Result.failure(e)
        }
    }
}
