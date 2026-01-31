package com.deadmansdrop.app.di

import com.deadmansdrop.app.data.repository.VideoRepository
import com.deadmansdrop.app.data.security.CredentialManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import retrofit2.Retrofit
import javax.inject.Singleton

/**
 * Hilt module that provides repository dependencies.
 * Explicit bindings help the Hilt processor resolve repositories when building ViewModels.
 */
@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    @Provides
    @Singleton
    fun provideVideoRepository(
        credentialManager: CredentialManager,
        retrofitBuilder: Retrofit.Builder
    ): VideoRepository {
        return VideoRepository(credentialManager, retrofitBuilder)
    }
}
