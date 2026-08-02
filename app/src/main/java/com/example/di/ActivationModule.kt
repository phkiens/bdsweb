package com.example.di

import com.example.data.remote.activation.ActivationApi
import com.example.data.remote.activation.ActivationRepository
import com.example.data.remote.activation.ActivationRepositoryImpl
import com.example.data.remote.activation.SupabaseActivationApi
import com.example.data.remote.activation.SystemTimeProvider
import com.example.data.remote.activation.TimeProvider
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ActivationModule {

    @Binds
    @Singleton
    abstract fun bindActivationApi(
        impl: SupabaseActivationApi
    ): ActivationApi

    @Binds
    @Singleton
    abstract fun bindActivationRepository(
        impl: ActivationRepositoryImpl
    ): ActivationRepository

    @Binds
    @Singleton
    abstract fun bindTimeProvider(
        impl: SystemTimeProvider
    ): TimeProvider
}
