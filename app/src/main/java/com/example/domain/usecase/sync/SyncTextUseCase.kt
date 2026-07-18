package com.example.domain.usecase.sync

import com.example.data.remote.drive.DriveHelper
import com.example.domain.model.toJsonDetail
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import com.example.domain.model.toUnverified
import org.json.JSONArray
import org.json.JSONObject
import javax.inject.Inject

private fun Double?.safe(): Double = if (this == null || this.isNaN() || this.isInfinite()) 0.0 else this
private fun Float?.safe(): Double = if (this == null || this.isNaN() || this.isInfinite()) 0.0 else this.toDouble()

class SyncTextUseCase @Inject constructor(
    private val propertyRepository: PropertyRepository,
    private val customerRepository: CustomerRepository,
    private val driveHelper: DriveHelper
) {
    suspend operator fun invoke(
        accessToken: String? = null,
        syncType: String? = null, // "PROPERTY", "UNVERIFIED", "CUSTOMER", or null for ALL
        onProgress: (Int, Int) -> Unit = { _, _ -> }
    ): Boolean {
        if (syncType == "PROPERTY") {
            return true
        }

        if (syncType == "UNVERIFIED") {
            return true
        }

        // 1. Get all records
        val properties = propertyRepository.getVerifiedProperties()
        val unverified = propertyRepository.getAllUnverified().map { it.toUnverified() }
        val customers = customerRepository.getAllCustomers()

        // 2. Map to JSON format
        // Fetch existing bds_collector_backup.json from Google Drive to preserve driveMediaIds
        val driveFiles = driveHelper.findJsonFiles(accessToken)
        val backupFile = driveFiles.find { it.first == "bds_collector_backup.json" }
        val driveMediaIdsMap = mutableMapOf<String, String>()
        if (backupFile != null) {
            try {
                val existingContent = driveHelper.downloadJsonFileContent(backupFile.second, accessToken)
                if (!existingContent.isNullOrBlank()) {
                    val existingArr = JSONArray(existingContent)
                    for (i in 0 until existingArr.length()) {
                        val obj = existingArr.getJSONObject(i)
                        val id = obj.optString("id")
                        val driveMediaIds = obj.optString("driveMediaIds", "")
                        if (!id.isNullOrBlank() && !driveMediaIds.isNullOrBlank() && driveMediaIds != "null") {
                            driveMediaIdsMap[id] = driveMediaIds
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("SyncTextUseCase", "Error loading existing driveMediaIds from Drive", e)
            }
        }

        val propertiesArray = JSONArray()
        val unverifiedArray = JSONArray()
        val customersArray = JSONArray()

        // 2a. Properties -> dùng chung format với SyncSinglePropertyUseCase (Property.toJsonDetail).
        // Ưu tiên preserve driveMediaIds từ backup cũ trên Drive nếu bản local đang rỗng
        // (tránh nuốt driveMediaIds khi record local chưa kịp ghi lại).
        for (p in properties) {
            val obj = p.toJsonDetail()
            val localDriveMediaIds = obj.optString("driveMediaIds", "")
            if (localDriveMediaIds.isBlank() || localDriveMediaIds == "null") {
                driveMediaIdsMap[p.id]?.let { preserved ->
                    obj.put("driveMediaIds", preserved)
                }
            }
            propertiesArray.put(obj)
        }

        // 2b. Unverified -> dùng chung format với SyncSingleUnverifiedUseCase
        for (u in unverified) {
            val obj = JSONObject().apply {
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
                put("driveMediaIds", if (u.driveMediaIds.isNotEmpty()) JSONArray(u.driveMediaIds) else JSONObject.NULL)
                put("extractedBy", u.extractedBy.name)
                put("isTextSynced", true)
                put("isMediaSynced", u.isMediaSynced)
                put("createdAt", u.createdAt)
                put("updatedAt", u.updatedAt)
                put("isDeleted", u.isDeleted)
            }
            unverifiedArray.put(obj)
        }

        // 2c. Customers -> dùng chung format với SyncSingleCustomerUseCase
        for (c in customers) {
            val obj = JSONObject().apply {
                put("id", c.id)
                put("name", c.name)
                put("nameNormalized", c.nameNormalized)
                put("phone", c.phone)
                put("demandType", c.demandType)
                put("propertyType", c.propertyType)
                put("demandAreas", c.demandAreas)
                put("demandDirections", c.demandDirections)
                put("priceMin", c.priceMin)
                put("priceMax", c.priceMax)
                put("note", c.note)
                put("noteNormalized", c.noteNormalized)
                put("role", c.role)
                put("status", c.status)
                put("updatedAt", c.updatedAt)
                put("isSynced", true)
                put("isDeleted", c.isDeleted)
                put("avatarPath", c.avatarPath)
                put("avatarDriveUrl", c.avatarDriveUrl)
            }
            customersArray.put(obj)
        }

        // 3. Perform backup using DriveHelper
        val isSuccess = driveHelper.backupTextData(
            propertiesArray.toString(),
            unverifiedArray.toString(),
            customersArray.toString(),
            accessToken,
            onProgress = { current, total ->
                onProgress(current, total)
            }
        )

        val finalSuccess = isSuccess

        // 4. Update sync flags in database if successful (Google Drive sync no longer updates local database sync status flags)

        return finalSuccess
    }
}
