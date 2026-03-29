export const PAGE_SCRIPT_RENDER = `    function renderBackendOptions() {
      const previousValue = sessionBackendId.value;
      sessionBackendId.replaceChildren();
      for (const backendState of state.backends) {
        const option = document.createElement('option');
        option.value = backendState.backend.id;
        option.textContent = backendState.backend.name + (backendState.online ? '' : ' (offline)');
        option.disabled = !backendState.online;
        option.selected = option.value === previousValue;
        sessionBackendId.appendChild(option);
      }
      if (!sessionBackendId.value) {
        const firstEnabled = Array.from(sessionBackendId.options).find((option) => !option.disabled);
        if (firstEnabled) {
          sessionBackendId.value = firstEnabled.value;
        }
      }
    }

    function renderBackends() {
      backendList.replaceChildren();
      for (const backendState of state.backends) {
        const item = document.createElement('div');
        item.className = 'item cmuxItem';
        const row = document.createElement('div');
        row.className = 'cmuxRow';
        const main = document.createElement('div');
        main.className = 'cmuxMain';
        const primary = document.createElement('div');
        primary.className = 'cmuxPrimary';
        const statusDot = document.createElement('span');
        statusDot.className = 'statusDot ' + (backendState.online ? 'online' : 'offline');
        const title = document.createElement('span');
        title.textContent = backendState.backend.name;
        const tag = document.createElement('span');
        tag.className = 'inlineTag';
        tag.textContent = backendState.online ? 'online' : 'offline';
        primary.append(statusDot, title, tag);
        const secondary = document.createElement('div');
        secondary.className = 'cmuxSecondary';
        secondary.textContent = backendState.backend.baseUrl;
        const tertiary = document.createElement('div');
        tertiary.className = 'cmuxTertiary';
        tertiary.textContent = backendState.error
          ? backendState.error
          : (backendState.health?.serverName || 'reachable backend') + ' · socket ' + (backendState.health?.tmuxSocketName || '-');
        main.append(primary, secondary, tertiary);
        const actions = document.createElement('div');
        actions.className = 'cmuxActions';
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => {
          setSidebarTab('servers');
          if (isMobileLayout()) {
            setSidebarOpen(true);
          }
          openBackendModal('edit', backendState);
        });
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openConfirmModal('Delete server "' + backendState.backend.name + '"?', async () => {
            await api('/api/backends/' + encodeURIComponent(backendState.backend.id), { method: 'DELETE' });
            if (state.activeBackendId === backendState.backend.id) {
              closeTerminal();
            }
            closeModal();
            await loadState();
          });
        });
        actions.append(editButton, deleteButton);
        row.append(main, actions);
        item.append(row);
        backendList.appendChild(item);
      }
    }

    function openTerminal(session) {
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

    function renderSessions() {
      sessionList.replaceChildren();
      for (const session of state.sessions) {
        const item = document.createElement('div');
        item.className = 'item cmuxItem' + (state.activeSessionId === session.id ? ' active' : '');
        item.addEventListener('click', () => openTerminal(session));
        const row = document.createElement('div');
        row.className = 'cmuxRow';
        const main = document.createElement('div');
        main.className = 'cmuxMain';
        const primary = document.createElement('div');
        primary.className = 'cmuxPrimary';
        const statusDot = document.createElement('span');
        statusDot.className = 'statusDot ' + (session.status === 'running' ? 'online' : 'warning');
        const title = document.createElement('span');
        title.textContent = session.tmuxSessionName;
        primary.append(statusDot, title);
        const serverTagRow = document.createElement('div');
        serverTagRow.className = 'cmuxBadgeRow';
        const serverTag = document.createElement('span');
        serverTag.className = 'inlineTag';
        serverTag.textContent = session.backendName;
        const activityTag = document.createElement('span');
        activityTag.className = 'inlineTag';
        activityTag.textContent = formatRelativeTime(session.lastActivityAt || session.createdAt);
        serverTagRow.append(serverTag, activityTag);
        const tertiary = document.createElement('div');
        tertiary.className = 'cmuxTertiary';
        const fullPathSummary = buildSessionPathSummary(session);
        tertiary.textContent = fullPathSummary;
        attachHoverTooltip(tertiary, fullPathSummary);
        main.append(primary, serverTagRow, tertiary);
        const actions = document.createElement('div');
        actions.className = 'cmuxActions';
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openSessionModal('edit', session);
        });
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'danger';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          openConfirmModal('Delete session "' + session.tmuxSessionName + '"?', async () => {
            await api('/api/sessions/' + encodeURIComponent(session.backendId) + '/' + encodeURIComponent(session.id), { method: 'DELETE' });
            if (state.activeSessionId === session.id) {
              closeTerminal();
            }
            closeModal();
            await loadState();
          });
        });
        actions.append(editButton, deleteButton);
        row.append(main, actions);
        item.append(row);
        sessionList.appendChild(item);
      }
    }

`;
