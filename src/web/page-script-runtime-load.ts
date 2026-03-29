export const PAGE_SCRIPT_RUNTIME_LOAD = `    async function loadState() {
      const payload = await api('/api/state');
      state.backends = payload.backends;
      state.sessions = payload.sessions;
      renderBackends();
      renderBackendOptions();
      renderSessions();
    }

`;
