package com.deadmansdrop.app.data.api

/**
 * Sealed class representing the result of an API call.
 * Used to handle success and error states in a type-safe manner.
 */
sealed class ApiResult<out T> {
    /**
     * Successful API response with data.
     */
    data class Success<T>(val data: T) : ApiResult<T>()

    /**
     * API error with error details.
     */
    data class Error(
        val message: String,
        val code: Int? = null,
        val cause: Throwable? = null
    ) : ApiResult<Nothing>()

    /**
     * Check if the result is successful.
     */
    val isSuccess: Boolean get() = this is Success

    /**
     * Check if the result is an error.
     */
    val isError: Boolean get() = this is Error

    /**
     * Get the data if successful, or null if error.
     */
    fun getOrNull(): T? = when (this) {
        is Success -> data
        is Error -> null
    }

    /**
     * Get the data if successful, or throw an exception if error.
     */
    fun getOrThrow(): T = when (this) {
        is Success -> data
        is Error -> throw ApiException(message, code, cause)
    }

    /**
     * Transform successful data.
     */
    inline fun <R> map(transform: (T) -> R): ApiResult<R> = when (this) {
        is Success -> Success(transform(data))
        is Error -> this
    }

    /**
     * Execute action if successful.
     */
    inline fun onSuccess(action: (T) -> Unit): ApiResult<T> {
        if (this is Success) {
            action(data)
        }
        return this
    }

    /**
     * Execute action if error.
     */
    inline fun onError(action: (Error) -> Unit): ApiResult<T> {
        if (this is Error) {
            action(this)
        }
        return this
    }
}

/**
 * Exception thrown when API call fails.
 */
class ApiException(
    message: String,
    val code: Int? = null,
    cause: Throwable? = null
) : Exception(message, cause)
