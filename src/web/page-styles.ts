export const PAGE_STYLES = `    :root {
      --bg: #091018;
      --panel: #101926;
      --panel-alt: #152233;
      --border: #223349;
      --text: #e5edf7;
      --muted: #8ea1b8;
      --accent: #4ade80;
      --danger: #f87171;
      --warning: #fbbf24;
    }
    * { box-sizing: border-box; }
    * {
      scrollbar-width: thin;
      scrollbar-color: #3b82f6 rgba(21, 34, 51, 0.55);
    }
    *::-webkit-scrollbar {
      width: 12px;
      height: 12px;
    }
    *::-webkit-scrollbar-track {
      background: rgba(11, 21, 33, 0.82);
      border-radius: 999px;
    }
    *::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(96, 165, 250, 0.92), rgba(59, 130, 246, 0.82));
      border: 2px solid rgba(11, 21, 33, 0.82);
      border-radius: 999px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    *::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, rgba(125, 185, 255, 0.96), rgba(59, 130, 246, 0.9));
    }
    *::-webkit-scrollbar-corner {
      background: rgba(11, 21, 33, 0.82);
    }
    html, body { margin: 0; height: 100%; min-height: 100dvh; background: radial-gradient(circle at top, #10233d, var(--bg)); color: var(--text); font-family: ui-sans-serif, system-ui, sans-serif; }
    #app { display: grid; grid-template-columns: 360px 1fr; height: 100dvh; min-height: 100vh; overflow: hidden; transition: grid-template-columns 160ms ease; }
    body[data-sidebar-open="false"] #app { grid-template-columns: 0 minmax(0, 1fr); }
    #sidebar { display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); background: rgba(8, 16, 24, 0.96); padding: 16px; min-width: 0; min-height: 0; transform: translateX(0); opacity: 1; transition: transform 160ms ease, opacity 160ms ease, padding 160ms ease, border-color 160ms ease; }
    body[data-sidebar-open="false"] #sidebar { transform: translateX(-100%); opacity: 0; pointer-events: none; padding-left: 0; padding-right: 0; border-right-color: transparent; }
    #sidebarBackdrop { display: none; }
    #sidebarHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    #sidebarTitle { margin: 0; font-size: 18px; }
    #sidebarToggle { display: inline-flex; align-items: center; justify-content: center; }
    #sidebarClose { display: inline-flex; align-items: center; justify-content: center; }
    body[data-sidebar-open="true"] #sidebarToggle { display: none; }
    body[data-sidebar-open="false"] #sidebarClose { display: none; }
    #sidebarToggle { min-width: 84px; }
    .iconButton { min-height: 38px; min-width: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-alt); color: var(--text); cursor: pointer; }
    .sidebarTabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .sidebarTab { min-height: 40px; border-radius: 12px; border: 1px solid var(--border); background: #0d1520; color: var(--muted); font-weight: 600; cursor: pointer; }
    .sidebarTab.active { color: var(--text); background: var(--panel-alt); border-color: #2563eb; box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.25) inset; }
    .tabPanel { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow: hidden; }
    .tabPanel[hidden] { display: none !important; }
    #main { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100%; overflow: hidden; }
    #terminalBar { flex-shrink: 0; padding: 14px 16px; border-bottom: 1px solid var(--border); background: rgba(16, 25, 38, 0.9); display: flex; justify-content: space-between; gap: 12px; align-items: center; }
    #terminalBarLeft { display: flex; align-items: center; gap: 12px; min-width: 0; }
    #terminalBarRight { display: flex; align-items: center; gap: 10px; }
    #fontControls { display: inline-flex; align-items: center; gap: 6px; }
    #logoutButton { min-width: 88px; }
    #authScreen { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 24px; background: rgba(2, 6, 23, 0.78); backdrop-filter: blur(6px); }
    #authScreen[hidden] { display: none !important; }
    #authPanel { width: min(100%, 420px); border-radius: 22px; border: 1px solid var(--border); background: linear-gradient(180deg, rgba(16, 25, 38, 0.98), rgba(8, 16, 24, 0.98)); box-shadow: 0 28px 72px rgba(2, 6, 23, 0.46); padding: 22px; }
    #authEyebrow { margin-bottom: 10px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 2px; }
    #authTitle { margin: 0 0 8px; font-size: 28px; }
    #authSubtitle { margin-bottom: 16px; line-height: 1.5; }
    #fontSizeLabel { min-width: 48px; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: var(--muted); }
    #terminalShell { display: flex; min-height: 0; padding: 8px 8px 0; overflow: hidden; }
    #terminal { flex: 1; min-width: 0; min-height: 0; width: 100%; height: auto; }
    #composer { display: none; position: relative; flex-direction: column; gap: 8px; padding: 12px 16px max(16px, calc(12px + env(safe-area-inset-bottom))); border-top: 1px solid var(--border); background: rgba(16, 25, 38, 0.94); }
    #composerKeys { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
    .composerKey, button, select, input { font: inherit; }
    .composerKey, .actionButton, button { min-height: 38px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-alt); color: var(--text); padding: 8px 10px; cursor: pointer; }
    .danger { border-color: #7f1d1d; color: #fecaca; }
    .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px; font-size: 12px; border: 1px solid var(--border); }
    .online { color: #bbf7d0; border-color: #166534; }
    .offline { color: #fecaca; border-color: #7f1d1d; }
    .section { margin-bottom: 20px; }
    .sidebarScrollSection { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; margin-bottom: 0; }
    .sectionHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .section h2, .sectionHeader h2 { margin: 0; font-size: 15px; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .field input, .field select { width: 100%; min-height: 38px; border-radius: 10px; border: 1px solid var(--border); background: #0d1520; color: var(--text); padding: 8px 10px; }
    .fieldHint { font-size: 12px; color: var(--muted); line-height: 1.4; }
    .formError { margin-bottom: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid #7f1d1d; background: rgba(127, 29, 29, 0.18); color: #fecaca; font-size: 13px; }
    .formError[hidden] { display: none !important; }
    .row { display: flex; gap: 8px; }
    .row > * { flex: 1; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .cmuxList { gap: 6px; }
    .listScroll { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; overflow-x: hidden; overflow-y: auto; padding-right: 4px; overscroll-behavior: contain; }
    .item { border: 1px solid var(--border); border-radius: 14px; padding: 10px; background: rgba(21, 34, 51, 0.64); }
    .cmuxItem { border-radius: 12px; padding: 9px 10px; background: linear-gradient(180deg, rgba(14, 23, 36, 0.96), rgba(10, 17, 28, 0.96)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.02); cursor: pointer; transition: border-color 90ms ease, box-shadow 90ms ease, transform 90ms ease, background 90ms ease; }
    .cmuxItem:hover { border-color: #36506e; background: linear-gradient(180deg, rgba(17, 29, 45, 0.98), rgba(11, 21, 33, 0.98)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 18px rgba(2, 6, 23, 0.18); }
    .cmuxItem:active { transform: translateY(1px); }
    .item.active { border-color: #3b82f6; background: linear-gradient(180deg, rgba(22, 38, 60, 0.98), rgba(13, 25, 40, 0.98)); box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.42) inset, 0 10px 24px rgba(37, 99, 235, 0.16); }
    .item.active .cmuxPrimary { color: #f8fbff; }
    .item.active .cmuxSecondary, .item.active .cmuxTertiary { color: #d6e4f5; }
    .itemHeader { display: flex; justify-content: space-between; gap: 8px; }
    .itemTitle { font-weight: 600; }
    .itemMeta { margin-top: 6px; font-size: 12px; color: var(--muted); word-break: break-all; }
    .itemActions { display: flex; gap: 8px; margin-top: 10px; }
    .itemActions button { flex: 1; }
    .cmuxRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .cmuxMain { min-width: 0; flex: 1; }
    .cmuxPrimary, .cmuxSecondary, .cmuxTertiary { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cmuxPrimary { display: flex; align-items: center; gap: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; font-weight: 700; }
    .cmuxSecondary, .cmuxTertiary { margin-top: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 11px; color: var(--muted); }
    .cmuxSecondary { color: #bfd0e6; }
    .tooltipTarget { cursor: help; }
    .cmuxBadgeRow { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
    .cmuxActions { display: flex; gap: 6px; flex-shrink: 0; }
    .cmuxActions button { min-height: 30px; padding: 5px 8px; font-size: 12px; border-radius: 8px; }
    .statusDot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; background: #ef4444; box-shadow: 0 0 0 1px rgba(255,255,255,0.08); }
    .statusDot.online { background: #22c55e; }
    .statusDot.offline { background: #ef4444; }
    .statusDot.warning { background: #f59e0b; }
    .inlineTag { display: inline-flex; align-items: center; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--border); font-size: 10px; color: var(--muted); }
    #modalBackdrop { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.68); border: 0; padding: 0; z-index: 70; }
    .modal { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 80; }
    .modal[hidden], #modalBackdrop[hidden] { display: none !important; }
    .modalPanel { width: min(100%, 520px); max-height: min(90vh, 720px); overflow: auto; background: rgba(8, 16, 24, 0.98); border: 1px solid var(--border); border-radius: 20px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.45); padding: 18px; }
    .modalHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .modalHeader h2 { margin: 0; font-size: 18px; }
    #hoverTooltip { position: fixed; z-index: 120; max-width: min(72vw, 640px); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(96, 165, 250, 0.35); background: rgba(8, 16, 24, 0.96); color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; box-shadow: 0 14px 32px rgba(2, 6, 23, 0.42); pointer-events: none; }
    #hoverTooltip[hidden] { display: none !important; }
    @media (max-width: 980px) {
      #app { grid-template-columns: 1fr; transition: none; }
      body[data-sidebar-open="false"] #app { grid-template-columns: 1fr; }
      #sidebarClose { display: inline-flex; align-items: center; justify-content: center; }
      #sidebarBackdrop { display: block; position: fixed; inset: 0; background: rgba(2, 6, 23, 0.62); border: 0; padding: 0; opacity: 0; pointer-events: none; transition: opacity 160ms ease; z-index: 30; }
      body[data-sidebar-open="true"] #sidebarBackdrop { opacity: 1; pointer-events: auto; }
      #sidebar { position: fixed; top: 0; left: 0; bottom: 0; width: min(88vw, 360px); z-index: 40; border-right: 1px solid var(--border); transform: translateX(-100%); transition: transform 160ms ease; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.38); opacity: 1; padding-left: 16px; padding-right: 16px; }
      body[data-sidebar-open="true"] #sidebar { transform: translateX(0); }
      #composer { display: flex; }
      #composerKeys { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .modal { padding: 16px; align-items: flex-end; }
      .modalPanel { width: 100%; max-height: 86vh; border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    }
`;
