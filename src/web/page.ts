import { PAGE_SCRIPT } from './page-script.js';
import { PAGE_STYLES } from './page-styles.js';

export function renderHtmlPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tmux fleet web</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
  <style>
${PAGE_STYLES}  </style>
</head>
<body data-sidebar-open="true">
  <button id="sidebarBackdrop" type="button" aria-label="Close sidebar" hidden></button>
  <button id="modalBackdrop" type="button" aria-label="Close modal" hidden></button>
  <div id="app">
    <aside id="sidebar">
      <div id="sidebarHeader">
        <h1 id="sidebarTitle">tmux fleet</h1>
        <button id="sidebarClose" class="iconButton" type="button" aria-label="Close sidebar">✕</button>
      </div>
      <div class="sidebarTabs" role="tablist" aria-label="Sidebar tabs">
        <button class="sidebarTab active" id="tabServers" type="button" role="tab" aria-selected="true" aria-controls="serversPanel" data-tab="servers">Servers</button>
        <button class="sidebarTab" id="tabSessions" type="button" role="tab" aria-selected="false" aria-controls="sessionsPanel" data-tab="sessions">Sessions</button>
      </div>
      <section id="serversPanel" class="tabPanel" role="tabpanel" aria-labelledby="tabServers">
        <div class="section sidebarScrollSection">
          <div class="sectionHeader">
            <h2>Backend Servers</h2>
            <button id="openBackendCreate" type="button">Add Server</button>
          </div>
          <div id="backendList" class="list cmuxList listScroll"></div>
        </div>
      </section>
      <section id="sessionsPanel" class="tabPanel" role="tabpanel" aria-labelledby="tabSessions" hidden>
        <div class="section sidebarScrollSection">
          <div class="sectionHeader">
            <h2>Sessions</h2>
            <button id="openSessionCreate" type="button">New Session</button>
          </div>
          <div id="sessionList" class="list cmuxList listScroll"></div>
        </div>
      </section>
    </aside>
    <main id="main">
      <div id="terminalBar">
        <div id="terminalBarLeft">
          <button id="sidebarToggle" class="iconButton" type="button" aria-label="Open sidebar">☰</button>
          <div>
            <div id="terminalTitle">No session selected</div>
            <div id="terminalStatus" class="muted">Select a session from the sidebar.</div>
          </div>
        </div>
        <div id="terminalBarRight">
          <div id="fontControls">
            <button id="fontSizeDecrease" class="iconButton" type="button" aria-label="Decrease terminal font size">−</button>
            <span id="fontSizeLabel">14px</span>
            <button id="fontSizeIncrease" class="iconButton" type="button" aria-label="Increase terminal font size">+</button>
          </div>
          <div><span id="connectionPill" class="pill offline">disconnected</span></div>
        </div>
      </div>
      <div id="terminalShell"><div id="terminal"></div></div>
      <div id="composer">
        <div id="composerKeys">
          <button class="composerKey" data-key="esc" type="button">Esc</button>
          <button class="composerKey" data-key="enter" type="button">Enter</button>
          <button class="composerKey" data-key="backspace" type="button">BS</button>
          <button class="composerKey" data-key="tab" type="button">Tab</button>
          <button class="composerKey" data-key="ctrl-c" type="button">Ctrl+C</button>
        </div>
        <div class="row">
          <input id="composerInput" type="text" placeholder="Send text to tmux and press Enter" autocomplete="off" />
          <button id="composerSend" type="button">Send</button>
        </div>
      </div>
    </main>
  </div>
  <div id="backendModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="backendModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="backendModalTitle">Add Server</h2>
        <button class="iconButton" id="backendModalClose" type="button" aria-label="Close server modal">✕</button>
      </div>
      <form id="backendForm">
        <input type="hidden" id="backendId" />
        <div id="backendFormError" class="formError" hidden></div>
        <div class="field"><label for="backendName">Name</label><input id="backendName" required /></div>
        <div class="field"><label for="backendBaseUrl">Base URL</label><input id="backendBaseUrl" placeholder="http://host:8788" required /></div>
        <div class="field">
          <label for="backendAuthToken">Agent Token</label>
          <input id="backendAuthToken" type="password" placeholder="paste the token from the agent host" required />
          <div class="fieldHint">Read this from the agent file: <code>$DATA_DIR/backend/agent-auth-token</code></div>
        </div>
        <div class="row">
          <button type="submit" id="backendSubmit">Save Server</button>
          <button type="button" id="backendReset">Cancel</button>
        </div>
      </form>
    </div>
  </div>
  <div id="sessionModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="sessionModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="sessionModalTitle">Create Session</h2>
        <button class="iconButton" id="sessionModalClose" type="button" aria-label="Close session modal">✕</button>
      </div>
      <form id="sessionForm">
        <input type="hidden" id="sessionEditingId" />
        <input type="hidden" id="sessionEditingBackendId" />
        <div id="sessionFormError" class="formError" hidden></div>
        <div class="field" id="sessionBackendField"><label for="sessionBackendId">Backend</label><select id="sessionBackendId" required></select></div>
        <div class="field" id="sessionPathField"><label for="sessionPath">Path</label><input id="sessionPath" placeholder="/absolute/path" required /></div>
        <div class="field"><label for="sessionName">Session Name</label><input id="sessionName" placeholder="optional" /></div>
        <div class="row">
          <button type="submit" id="sessionSubmit">Create Session</button>
          <button type="button" id="sessionReset">Cancel</button>
        </div>
      </form>
    </div>
  </div>
  <div id="confirmModal" class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle" hidden>
    <div class="modalPanel">
      <div class="modalHeader">
        <h2 id="confirmModalTitle">Confirm Delete</h2>
        <button class="iconButton" id="confirmModalClose" type="button" aria-label="Close confirmation modal">✕</button>
      </div>
      <div id="confirmModalMessage" class="cmuxSecondary">Are you sure?</div>
      <div class="row" style="margin-top: 16px;">
        <button type="button" id="confirmModalSubmit" class="danger">Delete</button>
        <button type="button" id="confirmModalCancel">Cancel</button>
      </div>
    </div>
  </div>
  <div id="hoverTooltip" hidden></div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script>
${PAGE_SCRIPT}  </script>
</body>
</html>`;
}
