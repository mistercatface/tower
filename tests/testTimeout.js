/** Default per-test timeout (ms). Enforced by `scripts/run-tests.mjs` via `--test-timeout`. */
export const TEST_TIMEOUT_MS = 5000;

/**
 * Fail fast when async work (teardown, worker sync) exceeds the budget.
 *
 * @template T
 * @param {string} label
 * @param {() => Promise<T>} fn
 * @param {number} [ms]
 */
export async function withTestTimeout(label, fn, ms = TEST_TIMEOUT_MS) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([fn(), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
