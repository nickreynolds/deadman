package com.deadmansdrop.app.ui.screens.recipients

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.CreateRecipientResponse
import com.deadmansdrop.app.data.api.models.DeleteRecipientResponse
import com.deadmansdrop.app.data.api.models.GetRecipientsResponse
import com.deadmansdrop.app.data.api.models.RecipientResponse
import com.deadmansdrop.app.data.repository.RecipientRepository
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RecipientsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var recipientRepository: RecipientRepository
    private lateinit var viewModel: RecipientsViewModel

    private fun createRecipient(
        id: String = "recipient-1",
        email: String = "test@example.com",
        name: String? = "Test User"
    ) = RecipientResponse(id = id, email = email, name = name)

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        recipientRepository = mockk()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): RecipientsViewModel {
        return RecipientsViewModel(recipientRepository)
    }

    @Test
    fun `init loads recipients on creation`() = runTest {
        val recipients = listOf(createRecipient())
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = recipients)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.recipients.size)
        assertEquals("test@example.com", state.recipients[0].email)
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `loadRecipients sets error on failure`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Error("Network error")

        viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Network error", state.error)
        assertFalse(state.isLoading)
        assertTrue(state.recipients.isEmpty())
    }

    @Test
    fun `refreshRecipients updates list`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        val updatedRecipients = listOf(createRecipient(), createRecipient(id = "recipient-2", email = "other@example.com"))
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = updatedRecipients)
        )

        viewModel.refreshRecipients()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(2, state.recipients.size)
        assertFalse(state.isRefreshing)
    }

    @Test
    fun `refreshRecipients sets error on failure`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { recipientRepository.getRecipients() } returns ApiResult.Error("Refresh failed")

        viewModel.refreshRecipients()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Refresh failed", state.error)
        assertFalse(state.isRefreshing)
    }

    @Test
    fun `addRecipient adds to list on success`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        val newRecipient = createRecipient(id = "new-1", email = "new@example.com", name = "New User")
        coEvery { recipientRepository.addRecipient("new@example.com", "New User") } returns ApiResult.Success(
            CreateRecipientResponse(recipient = newRecipient)
        )

        viewModel.addRecipient("new@example.com", "New User")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.recipients.size)
        assertEquals("new@example.com", state.recipients[0].email)
        assertTrue(state.addSuccess)
        assertFalse(state.isAdding)
        assertFalse(state.showAddDialog)
    }

    @Test
    fun `addRecipient sets error on failure`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { recipientRepository.addRecipient("bad@example.com", null) } returns ApiResult.Error("Invalid email")

        viewModel.addRecipient("bad@example.com", null)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Invalid email", state.addError)
        assertFalse(state.isAdding)
        assertFalse(state.addSuccess)
    }

    @Test
    fun `requestDeleteRecipient sets recipientToDelete`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        val recipient = createRecipient()
        viewModel.requestDeleteRecipient(recipient)

        assertEquals(recipient, viewModel.uiState.value.recipientToDelete)
    }

    @Test
    fun `cancelDelete clears recipientToDelete`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.requestDeleteRecipient(createRecipient())
        viewModel.cancelDelete()

        assertNull(viewModel.uiState.value.recipientToDelete)
    }

    @Test
    fun `confirmDelete removes recipient on success`() = runTest {
        val recipient = createRecipient()
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = listOf(recipient))
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { recipientRepository.deleteRecipient("recipient-1") } returns ApiResult.Success(
            DeleteRecipientResponse(success = true)
        )

        viewModel.requestDeleteRecipient(recipient)
        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.recipients.isEmpty())
        assertFalse(state.isDeleting)
        assertNull(state.recipientToDelete)
    }

    @Test
    fun `confirmDelete sets deleteError on failure`() = runTest {
        val recipient = createRecipient()
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = listOf(recipient))
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { recipientRepository.deleteRecipient("recipient-1") } returns ApiResult.Error("Failed")

        viewModel.requestDeleteRecipient(recipient)
        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Failed to delete recipient", state.deleteError)
        assertFalse(state.isDeleting)
        assertEquals(1, state.recipients.size) // Recipient still in list
    }

    @Test
    fun `confirmDelete does nothing when no recipientToDelete`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.confirmDelete()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isDeleting)
    }

    @Test
    fun `showAddDialog sets flag`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.showAddDialog()

        assertTrue(viewModel.uiState.value.showAddDialog)
    }

    @Test
    fun `dismissAddDialog clears flag`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.showAddDialog()
        viewModel.dismissAddDialog()

        assertFalse(viewModel.uiState.value.showAddDialog)
    }

    @Test
    fun `clearAddSuccess clears flag`() = runTest {
        coEvery { recipientRepository.getRecipients() } returns ApiResult.Success(
            GetRecipientsResponse(recipients = emptyList())
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.clearAddSuccess()

        assertFalse(viewModel.uiState.value.addSuccess)
    }
}
