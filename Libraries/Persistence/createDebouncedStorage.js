import { createDebouncedAction } from "../Scheduler/createDebouncedAction.js";

/**
 * @typedef {object} StorageBackend
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

const defaultBackend =
    typeof localStorage !== "undefined"
        ? /** @type {StorageBackend} */ (localStorage)
        : null;

/**
 * Debounced JSON persistence — dirty flag, coalesced flush, optional autosave loop,
 * and page-lifecycle flush. Game layers supply key + serialize only.
 *
 * @param {{
 *   scheduler: import("../Scheduler/Scheduler.js").Scheduler | null | undefined,
 *   key: string,
 *   debounceMs: number,
 *   serialize: () => object,
 *   autosaveMs?: number,
 *   backend?: StorageBackend | null,
 * }} config
 */
export function createDebouncedStorage({
    scheduler,
    key,
    debounceMs,
    serialize,
    autosaveMs = 0,
    backend = defaultBackend,
}) {
    let dirty = false;
    /** @type {ReturnType<typeof createDebouncedAction> | null} */
    let debouncedFlush = null;
    let autosaveEventId = null;
    let lifecycleBound = false;

    function ensureDebouncedFlush() {
        if (!scheduler) {
            debouncedFlush = null;
            return;
        }
        if (!debouncedFlush) {
            debouncedFlush = createDebouncedAction(scheduler, debounceMs, () => {
                if (dirty) flush();
            });
        }
    }

    function flush() {
        if (!backend || !dirty) return;
        try {
            backend.setItem(key, JSON.stringify(serialize()));
            dirty = false;
        } catch (_error) {
            // Quota / private mode — game remains playable.
        }
    }

    function cancelAutosave() {
        if (!scheduler || autosaveEventId === null) return;
        scheduler.cancel(autosaveEventId);
        autosaveEventId = null;
    }

    function bindLifecycle() {
        if (lifecycleBound || typeof window === "undefined") return;

        const flushIfDirty = () => {
            if (dirty) flush();
        };

        window.addEventListener("beforeunload", flushIfDirty);
        window.addEventListener("pagehide", flushIfDirty);
        lifecycleBound = true;
    }

    function startAutosave() {
        if (!scheduler || autosaveMs <= 0) return;
        cancelAutosave();
        autosaveEventId = scheduler.schedule(
            autosaveMs,
            () => {
                if (dirty) flush();
            },
            true,
        );
    }

    return {
        isDirty() {
            return dirty;
        },

        markDirty() {
            dirty = true;
            ensureDebouncedFlush();
            debouncedFlush?.queue();
        },

        saveNow() {
            dirty = true;
            ensureDebouncedFlush();
            debouncedFlush?.cancel();
            flush();
        },

        flush,

        /** @returns {object | null} */
        read() {
            if (!backend) return null;
            const raw = backend.getItem(key);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (_error) {
                backend.removeItem(key);
                return null;
            }
        },

        remove() {
            debouncedFlush?.cancel();
            cancelAutosave();
            dirty = false;
            backend?.removeItem(key);
        },

        init() {
            ensureDebouncedFlush();
            bindLifecycle();
            startAutosave();
        },

        shutdown() {
            debouncedFlush?.cancel();
            cancelAutosave();
        },
    };
}
