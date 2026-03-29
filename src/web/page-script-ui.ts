export const PAGE_SCRIPT_UI = `    function applyTerminalFontSize(nextFontSize) {
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

`;
