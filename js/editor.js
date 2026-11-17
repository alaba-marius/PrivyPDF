import { initSite } from "./site.js";
import { takeFiles } from "./file-manager.js";

// Bootstrap the shared navbar and footer on the editor placeholder.
// site.js only exports initSite and the page's CSP blocks inline scripts,
// so this small shim makes the call. It contains no editor logic.
initSite({ showCta: false });

// Pick-up point: the landing page stashes chosen files in IndexedDB
// (folio-local / handoff / "pending") and redirects here. The rebuilt
// editor will consume them; this placeholder just deletes the leftover
// entry so nothing lingers in the browser. A storage error never breaks
// the page, and we never log file names or contents.
void takeFiles().catch(() => {});
