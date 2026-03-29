export const PAGE_SCRIPT_RUNTIME_BOOT = `    state.sidebarOpen = !isMobileLayout();
    setSidebarTab('servers');
    applyTerminalFontSize(state.terminalFontSize);
    syncResponsiveLayout();
    loadState().catch((error) => {
      terminalStatus.textContent = String(error);
    });
    setInterval(() => { void loadState(); }, 5000);
`;
