package com.deadmansdrop.app.di

import com.deadmansdrop.app.BuildConfig
import com.deadmansdrop.app.data.api.AuthApiService
import com.deadmansdrop.app.data.auth.TokenAuthenticator
import com.deadmansdrop.app.data.auth.TokenRefreshInterceptor
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

/**
 * Hilt module that provides networking dependencies.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val CONNECT_TIMEOUT_SECONDS = 30L
    private const val READ_TIMEOUT_SECONDS = 30L
    private const val WRITE_TIMEOUT_SECONDS = 60L // Longer for video uploads

    /**
     * Provides Gson instance for JSON serialization/deserialization.
     */
    @Provides
    @Singleton
    fun provideGson(): Gson {
        return GsonBuilder()
            .setLenient()
            .create()
    }

    /**
     * Provides HTTP logging interceptor for debugging.
     * Only logs in debug builds.
     */
    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
    }

    /**
     * Provides auth interceptor that adds JWT token to requests.
     */
    @Provides
    @Singleton
    @Named("AuthInterceptor")
    fun provideAuthInterceptor(credentialManager: CredentialManager): Interceptor {
        return Interceptor { chain ->
            val originalRequest = chain.request()

            // Skip auth header for login endpoint
            if (originalRequest.url.encodedPath.contains("auth/login")) {
                return@Interceptor chain.proceed(originalRequest)
            }

            val token = credentialManager.getJwtToken()
            val request = if (!token.isNullOrBlank()) {
                originalRequest.newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .build()
            } else {
                originalRequest
            }

            chain.proceed(request)
        }
    }

    /**
     * Provides OkHttpClient with logging, auth interceptors, and token refresh.
     *
     * The interceptors and authenticator are ordered as follows:
     * 1. TokenRefreshInterceptor - Proactively refreshes token before expiry
     * 2. AuthInterceptor - Adds the Authorization header
     * 3. LoggingInterceptor - Logs requests/responses
     * 4. TokenAuthenticator - Handles 401 responses by refreshing the token
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        loggingInterceptor: HttpLoggingInterceptor,
        @Named("AuthInterceptor") authInterceptor: Interceptor,
        tokenRefreshInterceptor: TokenRefreshInterceptor,
        tokenAuthenticator: TokenAuthenticator
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor(tokenRefreshInterceptor)
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .authenticator(tokenAuthenticator)
            .build()
    }

    /**
     * Provides a Retrofit builder that can be used to create API services.
     * Note: The actual Retrofit instance is created dynamically based on server URL.
     */
    @Provides
    @Singleton
    fun provideRetrofitBuilder(
        okHttpClient: OkHttpClient,
        gson: Gson
    ): Retrofit.Builder {
        return Retrofit.Builder()
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
    }
}
