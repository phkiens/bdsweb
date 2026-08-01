package com.example.di

import com.example.data.remote.drive.DriveAccountInfoProvider
import com.example.data.remote.drive.DriveAuthorizationProvider
import com.example.data.remote.drive.GoogleDriveAccountInfoProvider
import com.example.data.remote.drive.GoogleDriveAuthorizationProvider
import com.example.data.repository.ApiConfigRepositoryImpl
import com.example.data.repository.CustomerRepositoryImpl
import com.example.data.repository.PropertyRepositoryImpl
import com.example.domain.repository.ApiConfigRepository
import com.example.domain.repository.CustomerRepository
import com.example.domain.repository.PropertyRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindApiConfigRepository(
        impl: ApiConfigRepositoryImpl
    ): ApiConfigRepository

    @Binds
    @Singleton
    abstract fun bindPropertyRepository(
        impl: PropertyRepositoryImpl
    ): PropertyRepository

    @Binds
    @Singleton
    abstract fun bindCustomerRepository(
        impl: CustomerRepositoryImpl
    ): CustomerRepository

    @Binds
    @Singleton
    abstract fun bindDriveAuthorizationProvider(
        impl: GoogleDriveAuthorizationProvider
    ): DriveAuthorizationProvider

    @Binds
    @Singleton
    abstract fun bindDriveAccountInfoProvider(
        impl: GoogleDriveAccountInfoProvider
    ): DriveAccountInfoProvider
}
