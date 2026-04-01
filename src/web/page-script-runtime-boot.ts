export const PAGE_SCRIPT_RUNTIME_BOOT = `    state.sidebarOpen = !isMobileLayout();
    setSidebarTab('servers');
    applyTerminalFontSize(state.terminalFontSize);
    syncResponsiveLayout();
    syncAuthSession()
      .then((authState) => {
        if (authState.authEnabled && !authState.authenticated) {
          if (authState.onboardingRequired) {
            authUsernameInput.focus();
          } else {
            authPasswordInput.focus();
          }
          return;
        }
        return loadState();
      })
      .catch((error) => {
        terminalStatus.textContent = String(error);
      });
    setInterval(() => {
      if (state.authEnabled && !state.authenticated) {
        return;
      }
      void loadState();
    }, 5000);
`;
