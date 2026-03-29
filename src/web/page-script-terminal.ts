export const PAGE_SCRIPT_TERMINAL = `    function openTerminal(session) {
      closeTerminal(false);
      setSidebarTab('sessions');
      if (isMobileLayout()) {
        setSidebarOpen(false);
      }
      state.activeBackendId = session.backendId;
      state.activeSessionId = session.id;
      renderSessions();
      terminalTitle.textContent = session.tmuxSessionName;
      terminalStatus.textContent = session.backendName + ' · ' + session.requestedPath;
      setConnectionState(false, 'connecting');
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + location.host + '/ws/terminal?backendId=' + encodeURIComponent(session.backendId) + '&sessionId=' + encodeURIComponent(session.id);
      const socket = new WebSocket(url);
      state.socket = socket;
      term.clear();
      socket.addEventListener('open', () => {
        setConnectionState(true, 'connected');
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'data') {
          term.write(message.data || '');
        } else if (message.type === 'error') {
          terminalStatus.textContent = message.message || 'terminal error';
          setConnectionState(false, 'error');
        } else if (message.type === 'exit') {
          terminalStatus.textContent = 'Session detached';
          setConnectionState(false, 'disconnected');
        }
      });
      socket.addEventListener('close', () => {
        if (state.socket === socket) {
          setConnectionState(false, 'disconnected');
          state.socket = null;
        }
      });
    }

    function closeTerminal(clearSelection = true) {
      if (state.socket) {
        try { state.socket.close(); } catch {}
        state.socket = null;
      }
      if (clearSelection) {
        state.activeBackendId = '';
        state.activeSessionId = '';
      }
      renderSessions();
      setConnectionState(false, 'disconnected');
    }

`;
