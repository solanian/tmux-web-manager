export const PAGE_SCRIPT_RUNTIME_FORMS = `    backendForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      backendFormError.hidden = true;
      backendFormError.textContent = '';
      backendSubmit.disabled = true;
      backendSubmit.textContent = 'Saving...';
      try {
        const body = JSON.stringify({
          name: backendNameInput.value,
          baseUrl: backendBaseUrlInput.value,
          ...(backendAuthTokenInput.value ? { authToken: backendAuthTokenInput.value } : {}),
        });
        const backendId = backendIdInput.value.trim();
        if (backendId) {
          await api('/api/backends/' + encodeURIComponent(backendId), { method: 'PUT', body });
        } else {
          await api('/api/backends', { method: 'POST', body });
        }
        resetBackendForm();
        closeModal();
        await loadState();
      } catch (error) {
        backendFormError.textContent = String(error);
        backendFormError.hidden = false;
      } finally {
        backendSubmit.disabled = false;
        backendSubmit.textContent = 'Save Server';
      }
    });

    backendResetButton.addEventListener('click', () => {
      resetBackendForm();
      closeModal();
    });

    sessionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setSidebarTab('sessions');
      sessionFormError.hidden = true;
      sessionFormError.textContent = '';
      sessionSubmitButton.disabled = true;
      sessionSubmitButton.textContent = sessionEditingId.value ? 'Saving...' : 'Creating...';
      try {
        if (sessionEditingId.value && sessionEditingBackendId.value) {
          await api(
            '/api/sessions/' + encodeURIComponent(sessionEditingBackendId.value) + '/' + encodeURIComponent(sessionEditingId.value),
            {
              method: 'PUT',
              body: JSON.stringify({
                sessionName: sessionNameInput.value,
              }),
            },
          );
        } else {
          await api('/api/sessions', {
            method: 'POST',
            body: JSON.stringify({
              backendId: sessionBackendId.value,
              path: sessionPathInput.value,
              sessionName: sessionNameInput.value,
            }),
          });
        }
        resetSessionForm();
        closeModal();
        await loadState();
      } catch (error) {
        sessionFormError.textContent = String(error);
        sessionFormError.hidden = false;
      } finally {
        sessionSubmitButton.disabled = false;
        sessionSubmitButton.textContent = sessionEditingId.value ? 'Save Session' : 'Create Session';
      }
    });

    sessionResetButton.addEventListener('click', () => {
      resetSessionForm();
      closeModal();
    });

`;
