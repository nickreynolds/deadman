package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.ApiError
import com.google.gson.Gson
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Helper object for handling API responses and errors.
 */
object ApiClient {

    private val gson = Gson()

    /**
     * Execute an API call and wrap the result in ApiResult.
     *
     * @param apiCall The suspend function making the API call
     * @return ApiResult containing either the successful data or error details
     */
    suspend fun <T> safeApiCall(apiCall: suspend () -> Response<T>): ApiResult<T> {
        return try {
            val response = apiCall()
            handleResponse(response)
        } catch (e: SocketTimeoutException) {
            ApiResult.Error(
                message = "Connection timed out. Please check your network and try again.",
                cause = e
            )
        } catch (e: UnknownHostException) {
            ApiResult.Error(
                message = "Unable to reach server. Please check the server URL and your network connection.",
                cause = e
            )
        } catch (e: IOException) {
            ApiResult.Error(
                message = "Network error. Please check your connection and try again.",
                cause = e
            )
        } catch (e: Exception) {
            ApiResult.Error(
                message = e.message ?: "An unexpected error occurred",
                cause = e
            )
        }
    }

    /**
     * Handle the HTTP response and convert to ApiResult.
     */
    private fun <T> handleResponse(response: Response<T>): ApiResult<T> {
        return if (response.isSuccessful) {
            val body = response.body()
            if (body != null) {
                ApiResult.Success(body)
            } else {
                ApiResult.Error(
                    message = "Empty response from server",
                    code = response.code()
                )
            }
        } else {
            val errorMessage = parseErrorMessage(response)
            ApiResult.Error(
                message = errorMessage,
                code = response.code()
            )
        }
    }

    /**
     * Parse error message from the response body.
     */
    private fun <T> parseErrorMessage(response: Response<T>): String {
        return try {
            val errorBody = response.errorBody()?.string()
            if (!errorBody.isNullOrBlank()) {
                val apiError = gson.fromJson(errorBody, ApiError::class.java)
                apiError?.message ?: apiError?.error ?: getDefaultErrorMessage(response.code())
            } else {
                getDefaultErrorMessage(response.code())
            }
        } catch (e: Exception) {
            getDefaultErrorMessage(response.code())
        }
    }

    /**
     * Get a default error message based on HTTP status code.
     */
    private fun getDefaultErrorMessage(code: Int): String {
        return when (code) {
            400 -> "Invalid request. Please check your input."
            401 -> "Invalid credentials. Please check your username and password."
            403 -> "Access denied. You don't have permission to perform this action."
            404 -> "Resource not found."
            408 -> "Request timed out. Please try again."
            429 -> "Too many requests. Please wait a moment and try again."
            500 -> "Server error. Please try again later."
            502 -> "Server is temporarily unavailable. Please try again later."
            503 -> "Service unavailable. Please try again later."
            else -> "An error occurred (code: $code)"
        }
    }
}
