package com.deadmansdrop.app.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * Response from GET /api/user/recipients.
 */
data class GetRecipientsResponse(
    @SerializedName("recipients") val recipients: List<RecipientResponse>
)

/**
 * Single recipient data from the API.
 */
data class RecipientResponse(
    @SerializedName("id") val id: String,
    @SerializedName("email") val email: String,
    @SerializedName("name") val name: String?
)

/**
 * Request body for POST /api/user/recipients.
 */
data class CreateRecipientRequest(
    @SerializedName("email") val email: String,
    @SerializedName("name") val name: String? = null
)

/**
 * Response from POST /api/user/recipients.
 */
data class CreateRecipientResponse(
    @SerializedName("recipient") val recipient: RecipientResponse
)

/**
 * Response from DELETE /api/user/recipients/:id.
 */
data class DeleteRecipientResponse(
    @SerializedName("success") val success: Boolean
)
