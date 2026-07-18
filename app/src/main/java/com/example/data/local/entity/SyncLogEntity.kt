package com.example.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sync_log")
data class SyncLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val type: SyncType,
    val status: SyncStatus,
    val tag: String,
    val message: String,
    val itemCount: Int? = null,
    val totalCount: Int? = null
)
