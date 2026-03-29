import { PAGE_SCRIPT_DOM } from './page-script-dom.js';
import { PAGE_SCRIPT_RENDER } from './page-script-render.js';
import { PAGE_SCRIPT_RUNTIME } from './page-script-runtime.js';
import { PAGE_SCRIPT_UI } from './page-script-ui.js';

export const PAGE_SCRIPT = `${PAGE_SCRIPT_DOM}${PAGE_SCRIPT_UI}${PAGE_SCRIPT_RENDER}${PAGE_SCRIPT_RUNTIME}`;
