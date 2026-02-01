package com.deadmansdrop.app.data.repository

import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.RecipientApiService
import com.deadmansdrop.app.data.api.models.CreateRecipientRequest
import com.deadmansdrop.app.data.api.models.CreateRecipientResponse
import com.deadmansdrop.app.data.api.models.DeleteRecipientResponse
import com.deadmansdrop.app.data.api.models.GetRecipientsResponse
import com.deadmansdrop.app.data.security.CredentialManager
import retrofit2.Retrofit

/**
 * Repository for distribution recipient operations.
 * Handles API calls for listing, adding, and deleting recipients.
 */
class RecipientRepository(
    private val credentialManager: CredentialManager,
    private val retrofitBuilder: Retrofit.Builder
) {
    private var recipientApiService: RecipientApiService? = null
    private var currentServerUrl: String? = null

    /**
     * Get all distribution recipients for the current user.
     *
     * @return ApiResult containing the recipients list or error
     */
    suspend fun getRecipients(): ApiResult<GetRecipientsResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateRecipientApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.getRecipients()
        }
    }

    /**
     * Add a new distribution recipient.
     *
     * @param email Recipient email address
     * @param name Optional recipient name
     * @return ApiResult containing the created recipient or error
     */
    suspend fun addRecipient(email: String, name: String?): ApiResult<CreateRecipientResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateRecipientApiService(serverUrl)
        val request = CreateRecipientRequest(
            email = email,
            name = name?.ifBlank { null }
        )

        return ApiClient.safeApiCall {
            service.addRecipient(request)
        }
    }

    /**
     * Delete a distribution recipient.
     *
     * @param recipientId The ID of the recipient to delete
     * @return ApiResult containing the success status or error
     */
    suspend fun deleteRecipient(recipientId: String): ApiResult<DeleteRecipientResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateRecipientApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.deleteRecipient(recipientId)
        }
    }

    /**
     * Get or create RecipientApiService for the given server URL.
     * Caches the service and recreates if the server URL changes.
     */
    private fun getOrCreateRecipientApiService(serverUrl: String): RecipientApiService {
        if (currentServerUrl != serverUrl) {
            recipientApiService = null
            currentServerUrl = serverUrl
        }

        return recipientApiService ?: run {
            val normalizedUrl = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
            val retrofit = retrofitBuilder
                .baseUrl(normalizedUrl)
                .build()
            retrofit.create(RecipientApiService::class.java).also {
                recipientApiService = it
            }
        }
    }
}
