export const PAGE_SCRIPT_RENDER_SESSIONS = `    function renderSessions() {
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
