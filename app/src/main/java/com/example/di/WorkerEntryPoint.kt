package com.example.di

import com.example.data.remote.drive.DriveHelper
import com.example.domain.repository.PropertyRepository
import com.example.domain.repository.CustomerRepository
import com.example.domain.usecase.sync.SyncMediaUseCase
import com.example.domain.usecase.sync.SyncTextUseCase
import com.example.data.local.dao.PropertyDao
import com.example.ui.common.SettingsManager
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WorkerEntryPoint {
    fun restoreMissingMediaUseCase(): com.example.domain.usecase.media.RestoreMissingMediaUseCase
    fun syncTextUseCase(): SyncTextUseCase
    fun syncMediaUseCase(): SyncMediaUseCase
    fun propertyRepository(): PropertyRepository
    fun customerRepository(): CustomerRepository
    fun apiConfigRepository(): com.example.domain.repository.ApiConfigRepository
    fun driveHelper(): DriveHelper
    fun propertyDao(): PropertyDao
    fun settingsManager(): SettingsManager
    fun customerSupabaseSyncUseCase(): com.example.domain.usecase.sync.CustomerSupabaseSyncUseCase
    fun supabaseClientProvider(): com.example.data.remote.supabase.SupabaseClientProvider
    fun propertySupabaseSyncUseCase(): com.example.domain.usecase.sync.PropertySupabaseSyncUseCase
    fun realtimeSyncManager(): com.example.data.remote.supabase.RealtimeSyncManager
    fun syncPullPrefs(): com.example.data.local.prefs.SyncPullPrefs
    fun syncLogDao(): com.example.data.local.dao.SyncLogDao
    fun customerPropertyLinkSupabaseSyncUseCase(): com.example.domain.usecase.sync.CustomerPropertyLinkSupabaseSyncUseCase
}
