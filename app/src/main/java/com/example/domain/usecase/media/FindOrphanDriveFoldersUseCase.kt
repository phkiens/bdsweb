package com.example.domain.usecase.media
import com.example.BuildConfig

import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.PropertyRepository
import com.example.ui.common.AppLogger
import javax.inject.Inject

class FindOrphanDriveFoldersUseCase @Inject constructor(
    private val driveHelper: DriveHelper,
    private val propertyRepository: PropertyRepository
) {
    suspend operator fun invoke(accessToken: String? = null): Result {
        val rootFolderId = driveHelper.getOrCreateFolderPublic(accessToken)
            ?: return Result(0, 0, "Không lấy được thư mục gốc BDS_Collector_Media trên Drive")

        // Lấy toàn bộ thư mục con (chỉ mimeType folder) trong BDS_Collector_Media
        val allSubFolders = driveHelper.listSubFoldersInFolder(rootFolderId, accessToken)

        // Tập driveFolderId đang sống — LẤY TOÀN BỘ property (cả verified & unverified), không lọc isDeleted,
        // vì record vừa xóa mềm (<30 ngày) vẫn phải giữ folder.
        val liveFolderIds = propertyRepository.getAllProperties()
            .mapNotNull { it.driveFolderId }
            .filterNot { it.isBlank() }
            .toSet()

        // Chặn an toàn: đếm trước xem sẽ đổi tên bao nhiêu folder. Nếu con số bất thường lớn
        // (hoặc DB không có folder nào đang sống) thì DỪNG, không ghi gì lên Drive.
        // Ca cần chặn: local DB thiếu dữ liệu (vừa restore, đẩy nhầm file .db, pull chưa xong)
        // -> mọi folder đều trông như mồ côi -> đổi tên gần hết. Lưu ý lớp chặn ở SettingsViewModel
        // canh chiều local->remote (isTextSynced=0) nên KHÔNG bắt được ca này: DB rỗng thì cũng
        // không có record nào mang cờ bẩn.
        val candidates = allSubFolders.filterNot { (name, id) ->
            name == "Customers" || name.startsWith("ZZZ_MOCOI_") || id in liveFolderIds
        }
        if (allSubFolders.isNotEmpty() &&
            (liveFolderIds.isEmpty() || candidates.size > allSubFolders.size * 0.3)
        ) {
            val msg = "Dừng an toàn: định đổi tên ${candidates.size}/${allSubFolders.size} folder " +
                "(local đang có ${liveFolderIds.size} folder sống). Con số bất thường — có thể dữ liệu " +
                "chưa kéo về đủ. Hãy bấm 'Đồng bộ ngay', chờ xong rồi thử lại."
            if (BuildConfig.DEBUG) {
                AppLogger.log("OrphanDriveCleanup", msg)
            }
            return Result(0, 0, msg)
        }

        var renamed = 0
        var skipped = 0
        for ((name, id) in allSubFolders) {
            if (name == "Customers") { skipped++; continue }          // Giữ nguyên folder khách hàng
            if (name.startsWith("ZZZ_MOCOI_")) { skipped++; continue } // Đã đánh dấu từ lần quét trước
            if (id in liveFolderIds) { skipped++; continue }           // Còn được tham chiếu bởi SP local

            val ok = driveHelper.updateFolderMetadata(id, newName = "ZZZ_MOCOI_$name", accessToken = accessToken)
            if (ok) {
                renamed++
                if (BuildConfig.DEBUG) {
                    AppLogger.log("OrphanDriveCleanup", "Đã đổi tên: $name -> ZZZ_MOCOI_$name (id=$id)")
                }
            } else {
                skipped++
            }
        }
        return Result(renamed, skipped, null)
    }

    data class Result(val renamed: Int, val skipped: Int, val error: String?)
}
