package com.example.data.local.database

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.example.data.local.dao.CustomerDao
import com.example.data.local.dao.PropertyDao
import com.example.data.local.entity.CustomerEntity
import com.example.data.local.entity.PropertyEntity
import com.example.data.local.entity.CustomerPropertyLink
import com.example.data.local.entity.SyncLogEntity
import com.example.data.local.dao.SyncLogDao
 
@Database(
    entities = [
        PropertyEntity::class,
        CustomerEntity::class,
        CustomerPropertyLink::class,
        SyncLogEntity::class
    ],
    version = 26,
    exportSchema = true
)
@androidx.room.TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun propertyDao(): PropertyDao
    abstract fun customerDao(): CustomerDao
    abstract fun syncLogDao(): SyncLogDao

    companion object {
        private const val DB_NAME = "bds_collector_database"

        private val MIGRATION_19_20 = object : androidx.room.migration.Migration(19, 20) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE customer_property_links ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE customer_property_links ADD COLUMN isDeleted INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE customer_property_links ADD COLUMN isSynced INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_20_21 = object : androidx.room.migration.Migration(20, 21) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN isMediaSynced INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_21_22 = object : androidx.room.migration.Migration(21, 22) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN driveFolderId TEXT DEFAULT NULL")
            }
        }

        private val MIGRATION_22_23 = object : androidx.room.migration.Migration(22, 23) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // 1. Create temporary table properties_new
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS `properties_new` (
                        `id` TEXT NOT NULL, 
                        `area` TEXT NOT NULL, 
                        `latitude` REAL, 
                        `longitude` REAL, 
                        `imagePath` TEXT, 
                        `driveMediaIds` TEXT, 
                        `driveFolderId` TEXT, 
                        `priceAtFolderCreation` REAL, 
                        `documentUrl` TEXT NOT NULL, 
                        `areaSize` REAL, 
                        `price` REAL NOT NULL, 
                        `description` TEXT NOT NULL, 
                        `status` TEXT NOT NULL, 
                        `surveyDate` TEXT NOT NULL, 
                        `direction` TEXT NOT NULL, 
                        `ownerName` TEXT NOT NULL, 
                        `ownerPhone` TEXT NOT NULL, 
                        `propertyType` TEXT NOT NULL, 
                        `needToViewToday` INTEGER NOT NULL, 
                        `isDraft` INTEGER NOT NULL, 
                        `isTextSynced` INTEGER NOT NULL, 
                        `rawText` TEXT NOT NULL, 
                        `diary` TEXT NOT NULL, 
                        `updatedAt` INTEGER NOT NULL, 
                        `isDeleted` INTEGER NOT NULL, 
                        `propertyDetailJsonFileId` TEXT, 
                        `txtFileId` TEXT, 
                        `isMediaSynced` INTEGER NOT NULL,
                        `title` TEXT,
                        `address` TEXT,
                        `mapLink` TEXT,
                        `extractedBy` TEXT,
                        `createdAt` INTEGER NOT NULL,
                        `isVerified` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                """.trimIndent())

                // 2. Copy official properties from properties table
                db.execSQL("""
                    INSERT INTO `properties_new` (
                        id, area, latitude, longitude, imagePath, driveMediaIds, driveFolderId,
                        priceAtFolderCreation, documentUrl, areaSize, price, description, status,
                        surveyDate, direction, ownerName, ownerPhone, propertyType, needToViewToday,
                        isDraft, isTextSynced, rawText, diary, updatedAt, isDeleted,
                        propertyDetailJsonFileId, txtFileId, isMediaSynced,
                        title, address, mapLink, extractedBy, createdAt, isVerified
                    )
                    SELECT
                        id, area, latitude, longitude, imagePath, driveMediaIds, driveFolderId,
                        priceAtFolderCreation, documentUrl, areaSize, price, description, status,
                        surveyDate, direction, ownerName, ownerPhone, propertyType,
                        CASE WHEN needToViewToday THEN 1 ELSE 0 END,
                        CASE WHEN isDraft THEN 1 ELSE 0 END,
                        CASE WHEN isTextSynced THEN 1 ELSE 0 END,
                        rawText, diary, updatedAt,
                        CASE WHEN isDeleted THEN 1 ELSE 0 END,
                        propertyDetailJsonFileId, txtFileId,
                        CASE WHEN isMediaSynced THEN 1 ELSE 0 END,
                        NULL, NULL, NULL, NULL, updatedAt, 1
                    FROM `properties`
                """.trimIndent())

                // 3. Copy and convert unverified properties using Cursor
                val cursor = db.query("SELECT * FROM unverified_properties")
                try {
                    val idIdx = cursor.getColumnIndexOrThrow("id")
                    val rawTextIdx = cursor.getColumnIndexOrThrow("rawText")
                    val titleIdx = cursor.getColumnIndexOrThrow("title")
                    val addressIdx = cursor.getColumnIndexOrThrow("address")
                    val areaIdx = cursor.getColumnIndexOrThrow("area")
                    val priceIdx = cursor.getColumnIndexOrThrow("price")
                    val directionIdx = cursor.getColumnIndexOrThrow("direction")
                    val ownerNameIdx = cursor.getColumnIndexOrThrow("ownerName")
                    val ownerPhoneIdx = cursor.getColumnIndexOrThrow("ownerPhone")
                    val propertyTypeIdx = cursor.getColumnIndexOrThrow("propertyType")
                    val latitudeIdx = cursor.getColumnIndexOrThrow("latitude")
                    val longitudeIdx = cursor.getColumnIndexOrThrow("longitude")
                    val mapLinkIdx = cursor.getColumnIndexOrThrow("mapLink")
                    val mediaPathsIdx = cursor.getColumnIndexOrThrow("mediaPaths")
                    val driveMediaIdsIdx = cursor.getColumnIndexOrThrow("driveMediaIds")
                    val driveFolderIdIdx = cursor.getColumnIndexOrThrow("driveFolderId")
                    val extractedByIdx = cursor.getColumnIndexOrThrow("extractedBy")
                    val isTextSyncedIdx = cursor.getColumnIndexOrThrow("isTextSynced")
                    val isMediaSyncedIdx = cursor.getColumnIndexOrThrow("isMediaSynced")
                    val descriptionIdx = cursor.getColumnIndexOrThrow("description")
                    val statusIdx = cursor.getColumnIndexOrThrow("status")
                    val surveyDateIdx = cursor.getColumnIndexOrThrow("surveyDate")
                    val isDraftIdx = cursor.getColumnIndexOrThrow("isDraft")
                    val createdAtIdx = cursor.getColumnIndexOrThrow("createdAt")
                    val updatedAtIdx = cursor.getColumnIndexOrThrow("updatedAt")
                    val isDeletedIdx = cursor.getColumnIndexOrThrow("isDeleted")

                    while (cursor.moveToNext()) {
                        val id = cursor.getString(idIdx)
                        val rawText = cursor.getString(rawTextIdx)
                        val title = if (cursor.isNull(titleIdx)) null else cursor.getString(titleIdx)
                        val address = if (cursor.isNull(addressIdx)) null else cursor.getString(addressIdx)
                        val areaSize = if (cursor.isNull(areaIdx)) null else cursor.getDouble(areaIdx)
                        val price = if (cursor.isNull(priceIdx)) 0.0 else cursor.getDouble(priceIdx)
                        val direction = if (cursor.isNull(directionIdx)) "" else cursor.getString(directionIdx)
                        val ownerName = if (cursor.isNull(ownerNameIdx)) "" else cursor.getString(ownerNameIdx)
                        val ownerPhone = if (cursor.isNull(ownerPhoneIdx)) "" else cursor.getString(ownerPhoneIdx)
                        val propertyType = cursor.getString(propertyTypeIdx)
                        val pTypeMapped = if (propertyType == "LAND") "Đất" else "Nhà"
                        
                        val latitude = if (cursor.isNull(latitudeIdx)) null else cursor.getDouble(latitudeIdx)
                        val longitude = if (cursor.isNull(longitudeIdx)) null else cursor.getDouble(longitudeIdx)
                        val mapLink = if (cursor.isNull(mapLinkIdx)) null else cursor.getString(mapLinkIdx)
                        val driveFolderId = if (cursor.isNull(driveFolderIdIdx)) null else cursor.getString(driveFolderIdIdx)
                        val extractedBy = cursor.getString(extractedByIdx)
                        val isTextSynced = cursor.getInt(isTextSyncedIdx)
                        val isMediaSynced = cursor.getInt(isMediaSyncedIdx)
                        val description = cursor.getString(descriptionIdx)
                        val status = cursor.getString(statusIdx)
                        val surveyDate = cursor.getString(surveyDateIdx)
                        val isDraft = cursor.getInt(isDraftIdx)
                        val createdAt = cursor.getLong(createdAtIdx)
                        val updatedAt = cursor.getLong(updatedAtIdx)
                        val isDeleted = cursor.getInt(isDeletedIdx)

                        // Parse mediaPaths (JSON list)
                        val mediaPathsJsonStr = cursor.getString(mediaPathsIdx)
                        val mediaPaths = mutableListOf<String>()
                        if (!mediaPathsJsonStr.isNullOrBlank()) {
                            try {
                                val arr = org.json.JSONArray(mediaPathsJsonStr)
                                for (i in 0 until arr.length()) {
                                    mediaPaths.add(arr.getString(i))
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                        val imagePathStr = if (mediaPaths.isEmpty()) null else mediaPaths.joinToString("|||")

                        // Parse driveMediaIds (JSON list)
                        val driveMediaIdsJsonStr = if (cursor.isNull(driveMediaIdsIdx)) null else cursor.getString(driveMediaIdsIdx)
                        val driveMediaIds = mutableListOf<String>()
                        if (!driveMediaIdsJsonStr.isNullOrBlank()) {
                            try {
                                val arr = org.json.JSONArray(driveMediaIdsJsonStr)
                                for (i in 0 until arr.length()) {
                                    driveMediaIds.add(arr.getString(i))
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }

                        // Build JSON map: key = absolute path, value = driveId
                        val driveMediaIdsMap = org.json.JSONObject()
                        for (i in driveMediaIds.indices) {
                            val driveId = driveMediaIds[i]
                            val localPath = mediaPaths.getOrNull(i)
                            if (!driveId.isNullOrBlank() && !localPath.isNullOrBlank()) {
                                driveMediaIdsMap.put(localPath, driveId)
                            }
                        }
                        val driveMediaIdsMapStr = if (driveMediaIdsMap.length() > 0) driveMediaIdsMap.toString() else null

                        // Insert into properties_new
                        val stmt = db.compileStatement("""
                            INSERT INTO `properties_new` (
                                id, area, latitude, longitude, imagePath, driveMediaIds, driveFolderId,
                                priceAtFolderCreation, documentUrl, areaSize, price, description, status,
                                surveyDate, direction, ownerName, ownerPhone, propertyType, needToViewToday,
                                isDraft, isTextSynced, rawText, diary, updatedAt, isDeleted,
                                propertyDetailJsonFileId, txtFileId, isMediaSynced,
                                title, address, mapLink, extractedBy, createdAt, isVerified
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """.trimIndent())

                        stmt.bindString(1, id)
                        stmt.bindString(2, "") // area default to ""
                        if (latitude == null) stmt.bindNull(3) else stmt.bindDouble(3, latitude)
                        if (longitude == null) stmt.bindNull(4) else stmt.bindDouble(4, longitude)
                        if (imagePathStr == null) stmt.bindNull(5) else stmt.bindString(5, imagePathStr)
                        if (driveMediaIdsMapStr == null) stmt.bindNull(6) else stmt.bindString(6, driveMediaIdsMapStr)
                        if (driveFolderId == null) stmt.bindNull(7) else stmt.bindString(7, driveFolderId)
                        stmt.bindNull(8) // priceAtFolderCreation
                        stmt.bindString(9, "") // documentUrl
                        if (areaSize == null) stmt.bindNull(10) else stmt.bindDouble(10, areaSize)
                        stmt.bindDouble(11, price)
                        stmt.bindString(12, description)
                        stmt.bindString(13, status)
                        stmt.bindString(14, surveyDate)
                        stmt.bindString(15, direction)
                        stmt.bindString(16, ownerName)
                        stmt.bindString(17, ownerPhone)
                        stmt.bindString(18, pTypeMapped)
                        stmt.bindLong(19, 0L) // needToViewToday
                        stmt.bindLong(20, isDraft.toLong())
                        stmt.bindLong(21, isTextSynced.toLong())
                        stmt.bindString(22, rawText)
                        stmt.bindString(23, "") // diary
                        stmt.bindLong(24, updatedAt)
                        stmt.bindLong(25, isDeleted.toLong())
                        stmt.bindNull(26) // propertyDetailJsonFileId
                        stmt.bindNull(27) // txtFileId
                        stmt.bindLong(28, isMediaSynced.toLong())
                        if (title == null) stmt.bindNull(29) else stmt.bindString(29, title)
                        if (address == null) stmt.bindNull(30) else stmt.bindString(30, address)
                        if (mapLink == null) stmt.bindNull(31) else stmt.bindString(31, mapLink)
                        stmt.bindString(32, extractedBy)
                        stmt.bindLong(33, createdAt)
                        stmt.bindLong(34, 0L) // isVerified = false
                        
                        stmt.executeInsert()
                    }
                } finally {
                    cursor.close()
                }

                // 4. Drop old table
                db.execSQL("DROP TABLE `properties`")

                // 5. Rename temporary table
                db.execSQL("ALTER TABLE `properties_new` RENAME TO `properties`")

                // 6. Recreate indexes
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_latitude` ON `properties` (`latitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_longitude` ON `properties` (`longitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_status` ON `properties` (`status`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_propertyType` ON `properties` (`propertyType`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_area` ON `properties` (`area`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_price` ON `properties` (`price`)")
            }
        }

        private val MIGRATION_23_24 = object : androidx.room.migration.Migration(23, 24) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("DROP TABLE IF EXISTS `unverified_properties`")
            }
        }

        private val MIGRATION_24_25 = object : androidx.room.migration.Migration(24, 25) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                val now = System.currentTimeMillis()
                db.execSQL("""
                    UPDATE properties
                    SET area = address,
                        updatedAt = $now,
                        isTextSynced = 0
                    WHERE isVerified = 0
                      AND (area = '' OR area IS NULL)
                      AND address IS NOT NULL
                      AND TRIM(address) != ''
                """.trimIndent())
            }
        }

        private val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN description TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN status TEXT NOT NULL DEFAULT 'Chờ khảo sát'")
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN surveyDate TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN isDraft INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_3_4 = object : androidx.room.migration.Migration(3, 4) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE customers ADD COLUMN role TEXT NOT NULL DEFAULT 'BUYER'")
                db.execSQL("ALTER TABLE customers ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'")
                db.execSQL("UPDATE customers SET demandType = 'Cần mua' WHERE demandType = 'Mua'")
                db.execSQL("UPDATE customers SET demandType = 'Cần bán' WHERE demandType = 'Thuê'")
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS `customer_property_links` (
                        `customerId` TEXT NOT NULL,
                        `propertyId` TEXT NOT NULL,
                        `role` TEXT NOT NULL DEFAULT 'OWNER',
                        PRIMARY KEY(`customerId`, `propertyId`)
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_4_5 = object : androidx.room.migration.Migration(4, 5) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("""
                    UPDATE unverified_properties
                    SET address = title
                    WHERE title IS NOT NULL AND (address IS NULL OR address = '')
                """.trimIndent())
            }
        }

        private val MIGRATION_5_6 = object : androidx.room.migration.Migration(5, 6) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE customers ADD COLUMN avatarPath TEXT")
                db.execSQL("ALTER TABLE customers ADD COLUMN avatarDriveUrl TEXT")
            }
        }

        private val MIGRATION_6_7 = object : androidx.room.migration.Migration(6, 7) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // No schema changes between 6 and 7, but defined to ensure migration chain continuity
            }
        }

        private val MIGRATION_7_8 = object : androidx.room.migration.Migration(7, 8) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN diary TEXT NOT NULL DEFAULT ''")
            }
        }

        private val MIGRATION_8_9 = object : androidx.room.migration.Migration(8, 9) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT ${System.currentTimeMillis()}")
            }
        }

        private val MIGRATION_9_10 = object : androidx.room.migration.Migration(9, 10) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN driveFolderId TEXT")
            }
        }

        private val MIGRATION_10_11 = object : androidx.room.migration.Migration(10, 11) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // 1. Create temporary table
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS `properties_new` (
                        `id` TEXT NOT NULL, 
                        `area` TEXT NOT NULL, 
                        `latitude` REAL NOT NULL, 
                        `longitude` REAL NOT NULL, 
                        `imagePath` TEXT, 
                        `driveMediaIds` TEXT, 
                        `driveFolderId` TEXT, 
                        `documentUrl` TEXT NOT NULL, 
                        `areaSize` REAL NOT NULL, 
                        `price` REAL NOT NULL, 
                        `description` TEXT NOT NULL, 
                        `status` TEXT NOT NULL, 
                        `surveyDate` TEXT NOT NULL, 
                        `direction` TEXT NOT NULL, 
                        `ownerName` TEXT NOT NULL, 
                        `ownerPhone` TEXT NOT NULL, 
                        `propertyType` TEXT NOT NULL, 
                        `needToViewToday` INTEGER NOT NULL, 
                        `isDraft` INTEGER NOT NULL, 
                        `isTextSynced` INTEGER NOT NULL, 
                        `rawText` TEXT NOT NULL, 
                        `diary` TEXT NOT NULL, 
                        `updatedAt` INTEGER NOT NULL, 
                        PRIMARY KEY(`id`)
                    )
                """.trimIndent())

                // 2. Copy data (excluding the name column)
                db.execSQL("""
                    INSERT INTO `properties_new` (
                        id, area, latitude, longitude, imagePath, driveMediaIds, driveFolderId, 
                        documentUrl, areaSize, price, description, status, surveyDate, 
                        direction, ownerName, ownerPhone, propertyType, needToViewToday, 
                        isDraft, isTextSynced, rawText, diary, updatedAt
                    )
                    SELECT 
                        id, area, latitude, longitude, imagePath, driveMediaIds, driveFolderId, 
                        documentUrl, areaSize, price, description, status, surveyDate, 
                        direction, ownerName, ownerPhone, propertyType, 
                        CASE WHEN needToViewToday THEN 1 ELSE 0 END, 
                        CASE WHEN isDraft THEN 1 ELSE 0 END, 
                        CASE WHEN isTextSynced THEN 1 ELSE 0 END, 
                        rawText, diary, updatedAt
                    FROM `properties`
                """.trimIndent())

                // 3. Drop old table
                db.execSQL("DROP TABLE `properties`")

                // 4. Rename temporary table
                db.execSQL("ALTER TABLE `properties_new` RENAME TO `properties`")

                // 5. Recreate indexes
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_latitude` ON `properties` (`latitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_longitude` ON `properties` (`longitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_status` ON `properties` (`status`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_propertyType` ON `properties` (`propertyType`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_area` ON `properties` (`area`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_properties_price` ON `properties` (`price`)")
            }
        }

        private val MIGRATION_11_12 = object : androidx.room.migration.Migration(11, 12) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // 1. Create temporary table with price as REAL
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS `unverified_properties_new` (
                        `id` TEXT NOT NULL,
                        `rawText` TEXT NOT NULL,
                        `title` TEXT,
                        `address` TEXT,
                        `area` REAL,
                        `price` REAL,
                        `direction` TEXT,
                        `ownerName` TEXT,
                        `ownerPhone` TEXT,
                        `propertyType` TEXT NOT NULL,
                        `latitude` REAL,
                        `longitude` REAL,
                        `mapLink` TEXT,
                        `mediaPaths` TEXT NOT NULL,
                        `extractedBy` TEXT NOT NULL,
                        `isTextSynced` INTEGER NOT NULL,
                        `isMediaSynced` INTEGER NOT NULL,
                        `description` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `surveyDate` TEXT NOT NULL,
                        `isDraft` INTEGER NOT NULL,
                        `createdAt` INTEGER NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                """.trimIndent())

                // 2. Copy data
                db.execSQL("""
                    INSERT INTO `unverified_properties_new` (
                        id, rawText, title, address, area, price, direction, ownerName, ownerPhone, 
                        propertyType, latitude, longitude, mapLink, mediaPaths, extractedBy, 
                        isTextSynced, isMediaSynced, description, status, surveyDate, isDraft, 
                        createdAt, updatedAt
                    )
                    SELECT 
                        id, rawText, title, address, area, price, direction, ownerName, ownerPhone, 
                        propertyType, latitude, longitude, mapLink, mediaPaths, extractedBy, 
                        CASE WHEN isTextSynced THEN 1 ELSE 0 END, 
                        CASE WHEN isMediaSynced THEN 1 ELSE 0 END, 
                        description, status, surveyDate, 
                        CASE WHEN isDraft THEN 1 ELSE 0 END, 
                        createdAt, updatedAt
                    FROM `unverified_properties`
                """.trimIndent())

                // 3. Drop old table
                db.execSQL("DROP TABLE `unverified_properties`")

                // 4. Rename temporary table
                db.execSQL("ALTER TABLE `unverified_properties_new` RENAME TO `unverified_properties`")

                // 5. Recreate indexes
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_unverified_properties_latitude` ON `unverified_properties` (`latitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_unverified_properties_longitude` ON `unverified_properties` (`longitude`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_unverified_properties_propertyType` ON `unverified_properties` (`propertyType`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_unverified_properties_price` ON `unverified_properties` (`price`)")
            }
        }

        private val MIGRATION_12_13 = object : androidx.room.migration.Migration(12, 13) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN isDeleted INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN isDeleted INTEGER NOT NULL DEFAULT 0")
            }
        }

        private val MIGRATION_13_14 = object : androidx.room.migration.Migration(13, 14) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN priceAtFolderCreation REAL DEFAULT NULL")
            }
        }

        private val MIGRATION_14_15 = object : androidx.room.migration.Migration(14, 15) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE unverified_properties ADD COLUMN driveMediaIds TEXT NOT NULL DEFAULT '[]'")
            }
        }

        private val MIGRATION_15_16 = object : androidx.room.migration.Migration(15, 16) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE properties ADD COLUMN propertyDetailJsonFileId TEXT")
                db.execSQL("ALTER TABLE properties ADD COLUMN txtFileId TEXT")
            }
        }

        private val MIGRATION_16_17 = object : androidx.room.migration.Migration(16, 17) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                db.execSQL("""
                    CREATE TABLE IF NOT EXISTS `sync_log` (
                        `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, 
                        `timestamp` INTEGER NOT NULL, 
                        `type` TEXT NOT NULL, 
                        `status` TEXT NOT NULL, 
                        `tag` TEXT NOT NULL, 
                        `message` TEXT NOT NULL, 
                        `itemCount` INTEGER, 
                        `totalCount` INTEGER
                    )
                """.trimIndent())
            }
        }

        private val MIGRATION_17_18 = object : androidx.room.migration.Migration(17, 18) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // No-op migration
            }
        }

        private val MIGRATION_18_19 = object : androidx.room.migration.Migration(18, 19) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                // area đã là REAL (64-bit), chỉ đổi type ở tầng Kotlin.
                // Không cần thao tác SQL.
            }
        }

        private val MIGRATION_25_26 = object : androidx.room.migration.Migration(25, 26) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                val now = System.currentTimeMillis()
                db.execSQL("""
                    UPDATE properties
                    SET status = 'Đang bán',
                        isTextSynced = 0,
                        updatedAt = $now
                    WHERE isVerified = 1
                      AND status = 'Chờ khảo sát'
                      AND isDeleted = 0
                """.trimIndent())
            }
        }

        internal val ALL_MIGRATIONS = arrayOf(
            MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6,
            MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10,
            MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13, MIGRATION_13_14,
            MIGRATION_14_15, MIGRATION_15_16, MIGRATION_16_17, MIGRATION_17_18, MIGRATION_18_19, MIGRATION_19_20, MIGRATION_20_21, MIGRATION_21_22, MIGRATION_22_23, MIGRATION_23_24, MIGRATION_24_25, MIGRATION_25_26
        )

        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    DB_NAME
                )
                    .addMigrations(*ALL_MIGRATIONS)
                    .addCallback(object : RoomDatabase.Callback() {
                        override fun onOpen(db: androidx.sqlite.db.SupportSQLiteDatabase) {
                            super.onOpen(db)
                            db.execSQL("UPDATE properties SET propertyType = 'Nhà' WHERE propertyType = 'Nhà riêng'")
                            db.execSQL("UPDATE customers SET propertyType = 'Nhà' WHERE propertyType = 'Nhà riêng'")
                        }
                    })
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
