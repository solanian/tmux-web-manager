export const PAGE_SCRIPT_RENDER_OPTIONS = `    function renderBackendOptions() {
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

`;
