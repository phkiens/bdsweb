package com.example.data.remote.supabase

import org.json.JSONObject

data class ReconciliationResult(
    val pathsToDelete: List<String>,
    val newImagePath: String?
)

object MediaReconciler {
    /**
     * Reconciles the local images of a property with the updated remote driveMediaIds.
     * Returns the list of local paths to delete and the new imagePath string.
     */
    fun reconcile(
        currentImagePath: String?,
        localDriveMediaIdsStr: String?,
        remoteDriveMediaIdsStr: String?
    ): ReconciliationResult {
        val localMediaMap = try {
            localDriveMediaIdsStr?.takeIf { it.isNotBlank() && it != "null" }?.let { JSONObject(it) } ?: JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }

        val remoteMediaMap = try {
            remoteDriveMediaIdsStr?.takeIf { it.isNotBlank() && it != "null" }?.let { JSONObject(it) } ?: JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }

        // Get all drive IDs present in remote JSON
        val remoteDriveIds = mutableSetOf<String>()
        val remoteKeys = remoteMediaMap.keys()
        while (remoteKeys.hasNext()) {
            val key = remoteKeys.next()
            remoteMediaMap.optString(key)?.let { remoteDriveIds.add(it) }
        }

        val pathsToDelete = mutableListOf<String>()
        val localKeys = localMediaMap.keys()
        while (localKeys.hasNext()) {
            val localPath = localKeys.next()
            val driveId = localMediaMap.optString(localPath)
            if (driveId != null && driveId.isNotBlank() && !remoteDriveIds.contains(driveId)) {
                pathsToDelete.add(localPath)
            }
        }

        // Rebuild imagePath: keep current paths minus deleted ones
        val currentPaths = currentImagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
        val updatedPaths = currentPaths.filter { it !in pathsToDelete }
        val newImagePath = if (updatedPaths.isEmpty()) null else updatedPaths.joinToString("|||")

        return ReconciliationResult(
            pathsToDelete = pathsToDelete,
            newImagePath = newImagePath
        )
    }

    fun isImagePresent(localPath: String, isVerified: Boolean, context: android.content.Context): Boolean {
        val f = java.io.File(localPath)
        val fileName = f.name
        val u = java.io.File(java.io.File(context.filesDir, "bds_images"), fileName)
        return if (isVerified) {
            (f.exists() && f.length() > 0L) || (u.exists() && u.length() > 0L)
        } else {
            u.exists() && u.length() > 0L
        }
    }

    /**
     * Đọc 1 lần danh sách tên file (non-empty) trong thư mục bds_images, trả về Set.
     * Dùng để đếm/so khớp ảnh trong RAM thay vì gọi File.exists() cho từng ảnh.
     */
    fun buildBdsImagesFileNameSet(context: android.content.Context): Set<String> {
        val dir = java.io.File(context.filesDir, "bds_images")
        val files = dir.listFiles() ?: return emptySet()
        val set = HashSet<String>(files.size)
        for (file in files) {
            if (file.isFile && file.length() > 0L) set.add(file.name)
        }
        return set
    }

    /**
     * Bản O(1) của isImagePresent dùng Set tên file đã dựng sẵn (buildBdsImagesFileNameSet).
     * Giữ NGUYÊN ngữ nghĩa isImagePresent:
     *  - verified: file có trong bds_images HOẶC tồn tại ở path tuyệt đối gốc.
     *  - unverified: chỉ tính khi có trong bds_images.
     * Lưu ý: nhánh kiểm path gốc của verified vẫn phải chạm đĩa 1 lần (File.exists),
     * nhưng chỉ khi tên file KHÔNG có sẵn trong Set — nên gần như luôn tránh được.
     */
    fun isImagePresentFast(
        localPath: String,
        isVerified: Boolean,
        bdsImagesFileNames: Set<String>
    ): Boolean {
        val fileName = java.io.File(localPath).name
        if (bdsImagesFileNames.contains(fileName)) return true
        if (!isVerified) return false
        // verified: ảnh có thể nằm ở path tuyệt đối gốc (ngoài bds_images)
        val f = java.io.File(localPath)
        return f.exists() && f.length() > 0L
    }

    /**
     * Rebuilds the imagePath after background restore or manual download.
     * Takes the union of existing paths in imagePath that are unsynced (not in driveMediaIds)
     * and synced paths in driveMediaIds that actually exist on disk.
     */
    fun rebuildImagePathAfterDownload(
        currentImagePath: String?,
        driveMediaIdsStr: String?,
        fileExistsCheck: (String) -> Boolean
    ): String? {
        val mediaIds = try {
            driveMediaIdsStr?.takeIf { it.isNotBlank() && it != "null" }?.let { JSONObject(it) } ?: JSONObject()
        } catch (e: Exception) {
            JSONObject()
        }

        val validLocalPaths = mutableListOf<String>()

        // 1. Add all paths from driveMediaIds that actually exist on disk (synced photos)
        val keys = mediaIds.keys()
        while (keys.hasNext()) {
            val localPath = keys.next()
            if (fileExistsCheck(localPath)) {
                validLocalPaths.add(localPath)
            }
        }

        // 2. Keep any paths in current imagePath that are not in driveMediaIds (local unsynced photos)
        val currentPaths = currentImagePath?.split("|||")?.filter { it.isNotBlank() } ?: emptyList()
        for (path in currentPaths) {
            if (!mediaIds.has(path) && fileExistsCheck(path) && path !in validLocalPaths) {
                validLocalPaths.add(path)
            }
        }

        return if (validLocalPaths.isEmpty()) null else validLocalPaths.joinToString("|||")
    }
}
