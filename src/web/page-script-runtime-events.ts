export const PAGE_SCRIPT_RUNTIME_EVENTS = `    logoutButton.addEventListener('click', async () => {
      try {
        await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
      } catch {}
      state.authEnabled = Boolean(window.__TWM_AUTH_ENABLED__);
      setAuthenticatedState(false, null, { onboardingRequired: false, configuredUsername: authUsernameInput.value });
      authPasswordInput.focus();
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

`;
