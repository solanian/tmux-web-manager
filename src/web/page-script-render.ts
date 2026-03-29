import { PAGE_SCRIPT_RENDER_BACKENDS } from './page-script-render-backends.js';
import { PAGE_SCRIPT_RENDER_OPTIONS } from './page-script-render-options.js';
import { PAGE_SCRIPT_RENDER_SESSIONS } from './page-script-render-sessions.js';
import { PAGE_SCRIPT_TERMINAL } from './page-script-terminal.js';

export const PAGE_SCRIPT_RENDER = `${PAGE_SCRIPT_RENDER_OPTIONS}${PAGE_SCRIPT_RENDER_BACKENDS}${PAGE_SCRIPT_TERMINAL}${PAGE_SCRIPT_RENDER_SESSIONS}`;
