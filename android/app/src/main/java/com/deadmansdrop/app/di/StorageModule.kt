package com.deadmansdrop.app.di

import com.deadmansdrop.app.data.security.EncryptedPreferencesStorage
import com.deadmansdrop.app.data.security.SecureStorage
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt module that provides storage-related dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class StorageModule {

    /**
     * Binds the EncryptedPreferencesStorage implementation to the SecureStorage interface.
     * This allows other classes to depend on SecureStorage without knowing the implementation.
     */
    @Binds
    @Singleton
    abstract fun bindSecureStorage(
        encryptedPreferencesStorage: EncryptedPreferencesStorage
    ): SecureStorage
}
