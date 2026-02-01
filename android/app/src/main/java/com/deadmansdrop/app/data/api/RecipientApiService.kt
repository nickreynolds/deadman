package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.CreateRecipientRequest
import com.deadmansdrop.app.data.api.models.CreateRecipientResponse
import com.deadmansdrop.app.data.api.models.DeleteRecipientResponse
import com.deadmansdrop.app.data.api.models.GetRecipientsResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * Retrofit API service interface for distribution recipient endpoints.
 * Defined according to PRD Section 5.3 User Settings Endpoints.
 */
interface RecipientApiService {

    /**
     * Get user's distribution recipients.
     * GET /api/user/recipients
     */
    @GET("api/user/recipients")
    suspend fun getRecipients(): Response<GetRecipientsResponse>

    /**
     * Add a distribution recipient.
     * POST /api/user/recipients
     */
    @POST("api/user/recipients")
    suspend fun addRecipient(
        @Body request: CreateRecipientRequest
    ): Response<CreateRecipientResponse>

    /**
     * Remove a distribution recipient.
     * DELETE /api/user/recipients/:id
     */
    @DELETE("api/user/recipients/{id}")
    suspend fun deleteRecipient(
        @Path("id") recipientId: String
    ): Response<DeleteRecipientResponse>
}
