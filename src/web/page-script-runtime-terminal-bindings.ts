export const PAGE_SCRIPT_RUNTIME_TERMINAL_BINDINGS = `    term.onData((data) => {
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

`;
