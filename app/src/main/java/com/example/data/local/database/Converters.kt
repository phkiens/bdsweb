package com.example.data.local.database

import androidx.room.TypeConverter
import com.example.domain.model.UnverifiedPropertyType
import com.example.domain.model.ExtractionType
import com.example.data.local.entity.SyncType
import com.example.data.local.entity.SyncStatus
import org.json.JSONArray

class Converters {
    @TypeConverter
    fun fromStringList(value: List<String>?): String {
        if (value == null) return "[]"
        val jsonArray = JSONArray()
        for (item in value) {
            jsonArray.put(item)
        }
        return jsonArray.toString()
    }

    @TypeConverter
    fun toStringList(value: String?): List<String> {
        if (value.isNullOrBlank()) return emptyList()
        val list = mutableListOf<String>()
        try {
            val jsonArray = JSONArray(value)
            for (i in 0 until jsonArray.length()) {
                list.add(jsonArray.getString(i))
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    @TypeConverter
    fun fromPropertyType(value: UnverifiedPropertyType?): String {
        return value?.name ?: UnverifiedPropertyType.HOUSE.name
    }

    @TypeConverter
    fun toPropertyType(value: String?): UnverifiedPropertyType {
        return try {
            if (value != null) UnverifiedPropertyType.valueOf(value) else UnverifiedPropertyType.HOUSE
        } catch (e: Exception) {
            UnverifiedPropertyType.HOUSE
        }
    }

    @TypeConverter
    fun fromExtractionType(value: ExtractionType?): String {
        return value?.name ?: ExtractionType.MANUAL.name
    }

    @TypeConverter
    fun toExtractionType(value: String?): ExtractionType {
        return try {
            if (value != null) ExtractionType.valueOf(value) else ExtractionType.MANUAL
        } catch (e: Exception) {
            ExtractionType.MANUAL
        }
    }

    @TypeConverter
    fun fromSyncType(value: SyncType?): String {
        return value?.name ?: SyncType.GENERAL.name
    }

    @TypeConverter
    fun toSyncType(value: String?): SyncType {
        return try {
            if (value != null) SyncType.valueOf(value) else SyncType.GENERAL
        } catch (e: Exception) {
            SyncType.GENERAL
        }
    }

    @TypeConverter
    fun fromSyncStatus(value: SyncStatus?): String {
        return value?.name ?: SyncStatus.INFO.name
    }

    @TypeConverter
    fun toSyncStatus(value: String?): SyncStatus {
        return try {
            if (value != null) SyncStatus.valueOf(value) else SyncStatus.INFO
        } catch (e: Exception) {
            SyncStatus.INFO
        }
    }
}
