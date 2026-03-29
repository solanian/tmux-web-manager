export const PAGE_SCRIPT_RENDER_BACKENDS = `    function renderBackends() {
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

`;
