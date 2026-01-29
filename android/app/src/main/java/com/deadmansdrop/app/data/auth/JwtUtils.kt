package com.deadmansdrop.app.data.auth

import android.util.Base64
import android.util.Log
import org.json.JSONObject

/**
 * Utility functions for JWT token parsing.
 */
object JwtUtils {

    private const val TAG = "JwtUtils"

    /**
     * Parse the expiry timestamp from a JWT token.
     *
     * JWT tokens have three parts separated by dots: header.payload.signature
     * The payload contains the "exp" claim with the expiry timestamp in seconds.
     *
     * @param token The JWT token string
     * @return The expiry timestamp in milliseconds, or a default of 1 hour from now if parsing fails
     */
    fun parseExpiry(token: String): Long {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) {
                Log.w(TAG, "Invalid JWT format: expected 3 parts, got ${parts.size}")
                defaultExpiry()
            } else {
                val payloadJson = decodeBase64Url(parts[1])
                val payload = JSONObject(payloadJson)

                if (payload.has("exp")) {
                    // JWT exp is in seconds, convert to milliseconds
                    payload.getLong("exp") * 1000L
                } else {
                    Log.w(TAG, "JWT payload does not contain 'exp' claim")
                    defaultExpiry()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse JWT token expiry", e)
            defaultExpiry()
        }
    }

    /**
     * Parse user information from a JWT token.
     *
     * @param token The JWT token string
     * @return A JwtUserInfo object containing user data, or null if parsing fails
     */
    fun parseUserInfo(token: String): JwtUserInfo? {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) {
                null
            } else {
                val payloadJson = decodeBase64Url(parts[1])
                val payload = JSONObject(payloadJson)

                JwtUserInfo(
                    userId = payload.optString("sub", payload.optString("userId", "")),
                    username = payload.optString("username", ""),
                    isAdmin = payload.optBoolean("isAdmin", payload.optBoolean("is_admin", false))
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse JWT user info", e)
            null
        }
    }

    /**
     * Check if a JWT token is expired.
     *
     * @param token The JWT token string
     * @param bufferMs Buffer time in milliseconds to consider token expired before actual expiry
     * @return true if the token is expired or will expire within the buffer time
     */
    fun isExpired(token: String, bufferMs: Long = 0L): Boolean {
        val expiry = parseExpiry(token)
        return System.currentTimeMillis() >= (expiry - bufferMs)
    }

    /**
     * Decode a Base64 URL-encoded string.
     */
    private fun decodeBase64Url(encoded: String): String {
        // Add padding if needed
        val padded = when (encoded.length % 4) {
            2 -> "$encoded=="
            3 -> "$encoded="
            else -> encoded
        }

        val bytes = Base64.decode(padded, Base64.URL_SAFE or Base64.NO_WRAP)
        return String(bytes, Charsets.UTF_8)
    }

    /**
     * Default expiry time: 1 hour from now.
     */
    private fun defaultExpiry(): Long {
        return System.currentTimeMillis() + (60 * 60 * 1000L)
    }
}

/**
 * Data class containing user information extracted from a JWT token.
 */
data class JwtUserInfo(
    val userId: String,
    val username: String,
    val isAdmin: Boolean
)
