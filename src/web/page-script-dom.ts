export const PAGE_SCRIPT_DOM = `    const sidebarToggle = document.getElementById('sidebarToggle');
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
    const authScreen = document.getElementById('authScreen');
    const authForm = document.getElementById('authForm');
    const authFormError = document.getElementById('authFormError');
    const authModeInput = document.getElementById('authMode');
    const authUsernameInput = document.getElementById('authUsername');
    const authPasswordInput = document.getElementById('authPassword');
    const authPasswordConfirmField = document.getElementById('authPasswordConfirmField');
    const authPasswordConfirmInput = document.getElementById('authPasswordConfirm');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const authSubmit = document.getElementById('authSubmit');
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
    const logoutButton = document.getElementById('logoutButton');
    const composerInput = document.getElementById('composerInput');
    const composerSend = document.getElementById('composerSend');
    const composerKeys = document.querySelectorAll('.composerKey');
    const state = { backends: [], sessions: [], activeBackendId: '', activeSessionId: '', activeSidebarTab: 'servers', sidebarOpen: true, terminalFontSize: 14, socket: null, confirmAction: null, authEnabled: Boolean(window.__TWM_AUTH_ENABLED__), authenticated: false, authMode: null, csrfToken: '' };

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

`;
