package com.example.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.example.data.local.entity.SyncLogEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncLogDao {
    @Insert
    suspend fun insert(log: SyncLogEntity)

    @Insert
    suspend fun insertAll(logs: List<SyncLogEntity>)

    @Query("SELECT * FROM sync_log ORDER BY timestamp DESC LIMIT 500")
    fun observeAll(): Flow<List<SyncLogEntity>>

    @Query("DELETE FROM sync_log")
    suspend fun clearAll()

    @Query("DELETE FROM sync_log WHERE timestamp < :cutoff")
    suspend fun purgeOlderThan(cutoff: Long)
}
