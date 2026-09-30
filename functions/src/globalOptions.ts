/**
 * Options for every function. Imported first in index.ts: modules run in import order, and a
 * function takes the global options that are set when its module runs, so functions defined in
 * other modules (e.g. appointments/*) would otherwise get the defaults (us-central1, 256MiB).
 */

import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "me-west1", memory: "512MiB" });
