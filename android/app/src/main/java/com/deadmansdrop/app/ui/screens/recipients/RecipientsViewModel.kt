package com.deadmansdrop.app.ui.screens.recipients

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.RecipientResponse
import com.deadmansdrop.app.data.repository.RecipientRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * UI state for the recipients screen.
 */
data class RecipientsUiState(
    val recipients: List<RecipientResponse> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val recipientToDelete: RecipientResponse? = null,
    val isDeleting: Boolean = false,
    val deleteError: String? = null,
    val showAddDialog: Boolean = false,
    val isAdding: Boolean = false,
    val addError: String? = null,
    val addSuccess: Boolean = false
)

/**
 * ViewModel for the recipients screen.
 * Manages fetching, adding, and deleting distribution recipients.
 */
@HiltViewModel
class RecipientsViewModel @Inject constructor(
    private val recipientRepository: RecipientRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecipientsUiState())
    val uiState: StateFlow<RecipientsUiState> = _uiState.asStateFlow()

    init {
        loadRecipients()
    }

    /**
     * Load recipients from the server.
     */
    fun loadRecipients() {
        if (_uiState.value.isLoading) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            when (val result = recipientRepository.getRecipients()) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            recipients = result.data.recipients,
                            isLoading = false,
                            error = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            error = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Refresh recipients (pull-to-refresh).
     */
    fun refreshRecipients() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }

            when (val result = recipientRepository.getRecipients()) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            recipients = result.data.recipients,
                            isRefreshing = false,
                            error = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isRefreshing = false,
                            error = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Add a new recipient.
     */
    fun addRecipient(email: String, name: String?) {
        if (_uiState.value.isAdding) return

        viewModelScope.launch {
            _uiState.update { it.copy(isAdding = true, addError = null, addSuccess = false) }

            when (val result = recipientRepository.addRecipient(email.trim(), name?.trim())) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            recipients = listOf(result.data.recipient) + state.recipients,
                            isAdding = false,
                            addSuccess = true,
                            addError = null,
                            showAddDialog = false
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isAdding = false,
                            addError = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Request deletion of a recipient (shows confirmation dialog).
     */
    fun requestDeleteRecipient(recipient: RecipientResponse) {
        _uiState.update { it.copy(recipientToDelete = recipient, deleteError = null) }
    }

    /**
     * Confirm deletion of the selected recipient.
     */
    fun confirmDelete() {
        val recipient = _uiState.value.recipientToDelete ?: return
        if (_uiState.value.isDeleting) return

        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true, deleteError = null) }

            when (recipientRepository.deleteRecipient(recipient.id)) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            recipients = state.recipients.filter { it.id != recipient.id },
                            isDeleting = false,
                            recipientToDelete = null,
                            deleteError = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isDeleting = false,
                            deleteError = "Failed to delete recipient"
                        )
                    }
                }
            }
        }
    }

    /**
     * Cancel deletion.
     */
    fun cancelDelete() {
        _uiState.update { it.copy(recipientToDelete = null, deleteError = null) }
    }

    /**
     * Show the add recipient dialog.
     */
    fun showAddDialog() {
        _uiState.update { it.copy(showAddDialog = true, addError = null, addSuccess = false) }
    }

    /**
     * Dismiss the add recipient dialog.
     */
    fun dismissAddDialog() {
        _uiState.update { it.copy(showAddDialog = false, addError = null) }
    }

    /**
     * Clear the add success flag.
     */
    fun clearAddSuccess() {
        _uiState.update { it.copy(addSuccess = false) }
    }
}
