export const PAGE_SCRIPT = `    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const sidebarTabs = document.querySelectorAll('.sidebarTab');
    const serversPanel = document.getElementById('serversPanel');
    const sessionsPanel = document.getElementById('sessionsPanel');
    const openBackendCreate = document.getElementById('openBackendCreate');
    const openSessionCreate = document.getElementById('openSessionCreate');
    const backendModal = document.getElementById('backendModal');
    const backendModalTitle = document.getElementById('backendModalTitle');
    const backendModalClose = document.getElementById('backendModalClose');
    const sessionModal = document.getElementById('sessionModal');
    const sessionModalTitle = document.getElementById('sessionModalTitle');
    const sessionModalClose = document.getElementById('sessionModalClose');
    const confirmModal = document.getElementById('confirmModal');
    const confirmModalMessage = document.getElementById('confirmModalMessage');
    const confirmModalClose = document.getElementById('confirmModalClose');
    const confirmModalSubmit = document.getElementById('confirmModalSubmit');
    const confirmModalCancel = document.getElementById('confirmModalCancel');
    const hoverTooltip = document.getElementById('hoverTooltip');
    const backendForm = document.getElementById('backendForm');
    const backendFormError = document.getElementById('backendFormError');
    const backendIdInput = document.getElementById('backendId');
    const backendNameInput = document.getElementById('backendName');
    const backendBaseUrlInput = document.getElementById('backendBaseUrl');
    const backendAuthTokenInput = document.getElementById('backendAuthToken');
    const backendSubmit = document.getElementById('backendSubmit');
    const backendResetButton = document.getElementById('backendReset');
    const backendList = document.getElementById('backendList');
    const sessionForm = document.getElementById('sessionForm');
    const sessionFormError = document.getElementById('sessionFormError');
    const sessionEditingId = document.getElementById('sessionEditingId');
    const sessionEditingBackendId = document.getElementById('sessionEditingBackendId');
    const sessionBackendField = document.getElementById('sessionBackendField');
    const sessionBackendId = document.getElementById('sessionBackendId');
    const sessionPathField = document.getElementById('sessionPathField');
    const sessionPathInput = document.getElementById('sessionPath');
    const sessionNameInput = document.getElementById('sessionName');
    const sessionSubmitButton = document.getElementById('sessionSubmit');
    const sessionResetButton = document.getElementById('sessionReset');
    const sessionList = document.getElementById('sessionList');
    const terminalTitle = document.getElementById('terminalTitle');
    const terminalStatus = document.getElementById('terminalStatus');
    const fontSizeDecrease = document.getElementById('fontSizeDecrease');
    const fontSizeIncrease = document.getElementById('fontSizeIncrease');
    const fontSizeLabel = document.getElementById('fontSizeLabel');
    const connectionPill = document.getElementById('connectionPill');
    const composerInput = document.getElementById('composerInput');
    const composerSend = document.getElementById('composerSend');
    const composerKeys = document.querySelectorAll('.composerKey');
    const state = { backends: [], sessions: [], activeBackendId: '', activeSessionId: '', activeSidebarTab: 'servers', sidebarOpen: true, terminalFontSize: 14, socket: null, confirmAction: null };

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: { background: '#091018', foreground: '#e5edf7' }
    });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();
    protectSensitiveInput(backendAuthTokenInput);

    function applyTerminalFontSize(nextFontSize) {
      state.terminalFontSize = Math.max(10, Math.min(24, nextFontSize));
      term.options.fontSize = state.terminalFontSize;
      fontSizeLabel.textContent = state.terminalFontSize + 'px';
      fitAddon.fit();
      if (state.socket && state.socket.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    }

    function isMobileLayout() {
      return window.matchMedia('(max-width: 980px)').matches;
    }

    function setSidebarOpen(open) {
      state.sidebarOpen = open;
      document.body.dataset.sidebarOpen = open ? 'true' : 'false';
      sidebarBackdrop.hidden = !(open && isMobileLayout());
    }

    function closeModal() {
      resetSessionForm();
      backendModal.hidden = true;
      sessionModal.hidden = true;
      confirmModal.hidden = true;
      modalBackdrop.hidden = true;
      state.confirmAction = null;
    }

    function openBackendModal(mode, backendState) {
      resetBackendForm();
      const isEdit = mode === 'edit';
      backendModalTitle.textContent = isEdit ? 'Edit Server' : 'Add Server';
      backendAuthTokenInput.required = !isEdit;
      if (backendState) {
        backendIdInput.value = backendState.backend.id;
        backendNameInput.value = backendState.backend.name;
        backendBaseUrlInput.value = backendState.backend.baseUrl;
        backendAuthTokenInput.value = backendState.backend.authToken || '';
        backendAuthTokenInput.placeholder = 'agent token';
      } else {
        backendAuthTokenInput.placeholder = 'paste the token from the agent host';
      }
      backendModal.hidden = false;
      sessionModal.hidden = true;
      modalBackdrop.hidden = false;
      backendNameInput.focus();
    }

    function openSessionModal(mode, session) {
      const isEdit = mode === 'edit';
      resetSessionForm();
      sessionEditingId.value = session ? session.id : '';
      sessionEditingBackendId.value = session ? session.backendId : '';
      sessionModalTitle.textContent = isEdit ? 'Edit Session' : 'Create Session';
      sessionSubmitButton.textContent = isEdit ? 'Save Session' : 'Create Session';
      sessionBackendField.hidden = isEdit;
      sessionPathField.hidden = isEdit;
      sessionBackendId.disabled = isEdit;
      sessionPathInput.disabled = isEdit;
      sessionNameInput.required = isEdit;
      sessionPathInput.value = '';
      sessionNameInput.value = session ? session.tmuxSessionName : '';
      renderBackendOptions();
      if (session) {
        sessionBackendId.value = session.backendId;
        sessionPathInput.value = session.requestedPath;
      }
      sessionModal.hidden = false;
      backendModal.hidden = true;
      confirmModal.hidden = true;
      modalBackdrop.hidden = false;
      sessionNameInput.focus();
    }

    function openConfirmModal(message, onConfirm) {
      backendModal.hidden = true;
      sessionModal.hidden = true;
      confirmModal.hidden = false;
      modalBackdrop.hidden = false;
      confirmModalMessage.textContent = message;
      state.confirmAction = onConfirm;
    }

    function setSidebarTab(tab) {
      state.activeSidebarTab = tab === 'sessions' ? 'sessions' : 'servers';
      sidebarTabs.forEach((button) => {
        const active = button.dataset.tab === state.activeSidebarTab;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      serversPanel.hidden = state.activeSidebarTab !== 'servers';
      sessionsPanel.hidden = state.activeSidebarTab !== 'sessions';
    }

    function syncResponsiveLayout() {
      setSidebarOpen(state.sidebarOpen);
    }

    function showHoverTooltip(text, clientX, clientY) {
      if (!text) {
        return;
      }
      hoverTooltip.textContent = text;
      hoverTooltip.hidden = false;
      moveHoverTooltip(clientX, clientY);
    }

    function moveHoverTooltip(clientX, clientY) {
      if (hoverTooltip.hidden) {
        return;
      }
      const offset = 14;
      const maxLeft = window.innerWidth - hoverTooltip.offsetWidth - 12;
      const maxTop = window.innerHeight - hoverTooltip.offsetHeight - 12;
      const left = Math.max(12, Math.min(clientX + offset, maxLeft));
      const top = Math.max(12, Math.min(clientY + offset, maxTop));
      hoverTooltip.style.left = left + 'px';
      hoverTooltip.style.top = top + 'px';
    }

    function hideHoverTooltip() {
      hoverTooltip.hidden = true;
      hoverTooltip.textContent = '';
    }

    function attachHoverTooltip(element, text) {
      if (!text) {
        return;
      }
      element.classList.add('tooltipTarget');
      element.addEventListener('mouseenter', (event) => {
        showHoverTooltip(text, event.clientX, event.clientY);
      });
      element.addEventListener('mousemove', (event) => {
        moveHoverTooltip(event.clientX, event.clientY);
      });
      element.addEventListener('mouseleave', () => {
        hideHoverTooltip();
      });
    }

    function formatRelativeTime(input) {
      if (!input) {
        return 'unknown';
      }
      const target = Date.parse(input);
      if (!Number.isFinite(target)) {
        return 'unknown';
      }
      const diffMs = Math.max(0, Date.now() - target);
      const diffSeconds = Math.floor(diffMs / 1000);
      if (diffSeconds < 10) {
        return 'just now';
      }
      if (diffSeconds < 60) {
        return diffSeconds + 's ago';
      }
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) {
        return diffMinutes + 'm ago';
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return diffHours + 'h ago';
      }
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) {
        return diffDays + 'd ago';
      }
      const diffWeeks = Math.floor(diffDays / 7);
      if (diffWeeks < 5) {
        return diffWeeks + 'w ago';
      }
      const diffMonths = Math.floor(diffDays / 30);
      if (diffMonths < 12) {
        return diffMonths + 'mo ago';
      }
      return Math.floor(diffDays / 365) + 'y ago';
    }

    function buildSessionPathSummary(session) {
      const requestedPath = (session.requestedPath || '').trim();
      const currentPath = (session.currentPath || '').trim();
      if (!currentPath || currentPath === requestedPath) {
        return requestedPath;
      }
      return requestedPath + ' · cwd ' + currentPath;
    }

    function setConnectionState(connected, text) {
      connectionPill.textContent = text;
      connectionPill.className = 'pill ' + (connected ? 'online' : 'offline');
    }

    async function api(path, init) {
      const response = await fetch(path, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init && init.headers ? init.headers : {}),
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(payload.error || response.statusText);
      }
      if (response.status === 204) {
        return null;
      }
      return response.json();
    }

    function resetBackendForm() {
      backendIdInput.value = '';
      backendNameInput.value = '';
      backendBaseUrlInput.value = '';
      backendAuthTokenInput.value = '';
      backendAuthTokenInput.required = true;
      backendAuthTokenInput.placeholder = 'paste the token from the agent host';
      backendFormError.hidden = true;
      backendFormError.textContent = '';
      backendSubmit.textContent = 'Save Server';
      backendSubmit.disabled = false;
    }

    function protectSensitiveInput(input) {
      const blockedClipboardEvents = ['copy', 'cut', 'dragstart', 'contextmenu'];
      blockedClipboardEvents.forEach((eventName) => {
        input.addEventListener(eventName, (event) => {
          event.preventDefault();
        });
      });
      input.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) {
          event.preventDefault();
        }
      });
    }

    function resetSessionForm() {
      sessionEditingId.value = '';
      sessionEditingBackendId.value = '';
      sessionBackendField.hidden = false;
      sessionPathField.hidden = false;
      sessionBackendId.disabled = false;
      sessionPathInput.disabled = false;
      sessionPathInput.value = '';
      sessionNameInput.value = '';
      sessionNameInput.required = false;
      sessionSubmitButton.textContent = 'Create Session';
      sessionModalTitle.textContent = 'Create Session';
      sessionFormError.hidden = true;
      sessionFormError.textContent = '';
      sessionSubmitButton.disabled = false;
    }

    function renderBackendOptions() {
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

    async function loadState() {
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
