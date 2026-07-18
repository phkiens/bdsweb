package com.example.di

import android.content.Context
import com.example.data.local.dao.CustomerDao
import com.example.data.local.dao.PropertyDao
import com.example.data.local.database.AppDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase {
        return AppDatabase.getDatabase(context)
    }

    @Provides
    fun providePropertyDao(database: AppDatabase): PropertyDao {
        return database.propertyDao()
    }

    @Provides
    fun provideCustomerDao(database: AppDatabase): CustomerDao {
        return database.customerDao()
    }

    @Provides
    fun provideSyncLogDao(database: AppDatabase): com.example.data.local.dao.SyncLogDao {
        return database.syncLogDao()
    }
}
