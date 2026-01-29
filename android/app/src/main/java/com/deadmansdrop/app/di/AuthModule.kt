package com.deadmansdrop.app.di

import com.deadmansdrop.app.data.auth.TokenManager
import com.deadmansdrop.app.data.auth.TokenManagerImpl
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module that provides authentication-related dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {

    /**
     * Binds TokenManagerImpl to TokenManager interface.
     */
    @Binds
    @Singleton
    abstract fun bindTokenManager(impl: TokenManagerImpl): TokenManager
}
