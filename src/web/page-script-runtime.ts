export const PAGE_SCRIPT_RUNTIME = `    async function loadState() {
      const payload = await api('/api/state');
      state.backends = payload.backends;
      state.sessions = payload.sessions;
      renderBackends();
      renderBackendOptions();
      renderSessions();
    }

    backendForm.addEventListener('submit', async (event) => {
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

    sidebarToggle.addEventListener('click', () => {
      setSidebarOpen(!state.sidebarOpen);
    });

    sidebarClose.addEventListener('click', () => setSidebarOpen(false));
    sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));
    modalBackdrop.addEventListener('click', () => closeModal());
    backendModalClose.addEventListener('click', () => closeModal());
    sessionModalClose.addEventListener('click', () => {
      resetSessionForm();
      closeModal();
    });
    confirmModalClose.addEventListener('click', () => closeModal());
    confirmModalCancel.addEventListener('click', () => closeModal());
    confirmModalSubmit.addEventListener('click', async () => {
      const action = state.confirmAction;
      if (!action) {
        closeModal();
        return;
      }
      await action();
    });
    openBackendCreate.addEventListener('click', () => {
      setSidebarTab('servers');
      openBackendModal('create');
    });
    openSessionCreate.addEventListener('click', () => {
      setSidebarTab('sessions');
      openSessionModal('create');
    });
    sidebarTabs.forEach((button) => {
      button.addEventListener('click', () => {
        setSidebarTab(button.dataset.tab);
      });
    });

    term.onData((data) => {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    term.onResize(({ cols, rows }) => {
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    composerSend.addEventListener('click', () => {
      if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      const value = composerInput.value.trimEnd();
      if (!value) {
        return;
      }
      state.socket.send(JSON.stringify({ type: 'sendText', data: value }));
      composerInput.value = '';
    });

    composerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        composerSend.click();
      }
    });

    composerKeys.forEach((button) => {
      button.addEventListener('click', () => {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
          state.socket.send(JSON.stringify({ type: 'sendKey', data: button.dataset.key }));
        }
      });
    });

    fontSizeDecrease.addEventListener('click', () => {
      applyTerminalFontSize(state.terminalFontSize - 1);
    });

    fontSizeIncrease.addEventListener('click', () => {
      applyTerminalFontSize(state.terminalFontSize + 1);
    });

    window.addEventListener('resize', () => {
      syncResponsiveLayout();
      fitAddon.fit();
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        if (!backendModal.hidden || !sessionModal.hidden) {
          closeModal();
          return;
        }
        if (isMobileLayout() && document.body.dataset.sidebarOpen === 'true') {
          setSidebarOpen(false);
        }
      }
    });

    state.sidebarOpen = !isMobileLayout();
    setSidebarTab('servers');
    applyTerminalFontSize(state.terminalFontSize);
    syncResponsiveLayout();
    loadState().catch((error) => {
      terminalStatus.textContent = String(error);
    });
    setInterval(() => { void loadState(); }, 5000);
`;
