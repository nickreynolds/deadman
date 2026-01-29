package com.deadmansdrop.app.data.security

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * SecureStorage implementation using Android's EncryptedSharedPreferences.
 *
 * Uses AES-256 encryption with a master key stored in the Android Keystore.
 * The master key is hardware-backed on devices that support it.
 *
 * Data is encrypted at rest and protected by the device's secure hardware
 * when available (StrongBox or TEE).
 */
@Singleton
class EncryptedPreferencesStorage @Inject constructor(
    @ApplicationContext private val context: Context
) : SecureStorage {

    private val encryptedPrefs: SharedPreferences by lazy {
        createEncryptedPreferences()
    }

    private fun createEncryptedPreferences(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                context,
                PREFS_FILENAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            // Log the error but don't crash - fall back to regular prefs in extreme cases
            // This should only happen on very old or rooted devices
            Log.e(TAG, "Failed to create encrypted preferences, this is a critical security issue", e)
            throw SecurityException("Unable to create secure storage. Device may not support encryption.", e)
        }
    }

    override fun putString(key: String, value: String?) {
        encryptedPrefs.edit().apply {
            if (value != null) {
                putString(key, value)
            } else {
                remove(key)
            }
        }.apply()
    }

    override fun getString(key: String): String? {
        return encryptedPrefs.getString(key, null)
    }

    override fun putBoolean(key: String, value: Boolean) {
        encryptedPrefs.edit().putBoolean(key, value).apply()
    }

    override fun getBoolean(key: String, defaultValue: Boolean): Boolean {
        return encryptedPrefs.getBoolean(key, defaultValue)
    }

    override fun putLong(key: String, value: Long) {
        encryptedPrefs.edit().putLong(key, value).apply()
    }

    override fun getLong(key: String, defaultValue: Long): Long {
        return encryptedPrefs.getLong(key, defaultValue)
    }

    override fun contains(key: String): Boolean {
        return encryptedPrefs.contains(key)
    }

    override fun remove(key: String) {
        encryptedPrefs.edit().remove(key).apply()
    }

    override fun clear() {
        encryptedPrefs.edit().clear().apply()
    }

    companion object {
        private const val TAG = "EncryptedPrefsStorage"
        private const val PREFS_FILENAME = "encrypted_prefs"
    }
}
