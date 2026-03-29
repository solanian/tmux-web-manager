import { PAGE_SCRIPT_RUNTIME_BOOT } from './page-script-runtime-boot.js';
import { PAGE_SCRIPT_RUNTIME_EVENTS } from './page-script-runtime-events.js';
import { PAGE_SCRIPT_RUNTIME_FORMS } from './page-script-runtime-forms.js';
import { PAGE_SCRIPT_RUNTIME_LOAD } from './page-script-runtime-load.js';
import { PAGE_SCRIPT_RUNTIME_TERMINAL_BINDINGS } from './page-script-runtime-terminal-bindings.js';

export const PAGE_SCRIPT_RUNTIME = `${PAGE_SCRIPT_RUNTIME_LOAD}${PAGE_SCRIPT_RUNTIME_FORMS}${PAGE_SCRIPT_RUNTIME_EVENTS}${PAGE_SCRIPT_RUNTIME_TERMINAL_BINDINGS}${PAGE_SCRIPT_RUNTIME_BOOT}`;
