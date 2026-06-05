/**
 * @typedef {ReturnType<import("./createRadioRegistry.js").createRadioRegistry>} RadioRegistry
 *
 * @typedef {object} RadioControllerOptions
 * @property {RadioRegistry} registry
 * @property {() => void} requestPause
 * @property {() => void} requestResume
 * @property {(payload: object) => void} onShowLine
 * @property {() => void} onHide
 */

/**
 * @param {RadioControllerOptions} options
 */
export function createRadioController({ registry, requestPause, requestResume, onShowLine, onHide }) {
    /** @type {{ conversationId: string, resolved: object, lineIndex: number, onComplete: (() => void) | null } | null} */
    let session = null;

    function isActive() {
        return session != null;
    }

    function showCurrentLine() {
        const { resolved, lineIndex } = session;
        const line = resolved.lines[lineIndex];
        onShowLine({
            participants: resolved.participants,
            line,
            lineIndex,
            lineCount: resolved.lines.length,
        });
    }

    function finishSession() {
        if (!session) return;

        const onComplete = session.onComplete;
        session = null;
        onHide();
        requestResume();
        if (onComplete) onComplete();
    }

    function shouldSkipConversation(conversationId, state) {
        const resolved = registry.resolveConversation(conversationId);
        if (!resolved) return true;
        return resolved.oncePerRun && state?.radioSeenThisRun?.[conversationId];
    }

    function startSession(conversationId, onComplete, state, { force = false } = {}) {
        if (isActive()) {
            console.warn("[Radio] Already in a conversation");
            return false;
        }

        const resolved = registry.resolveConversation(conversationId);
        if (!resolved) return false;

        if (!force && shouldSkipConversation(conversationId, state)) {
            return false;
        }

        session = {
            conversationId,
            resolved,
            lineIndex: 0,
            onComplete: onComplete ?? null,
        };

        if (state) {
            if (!state.radioSeenThisRun) state.radioSeenThisRun = {};
            state.radioSeenThisRun[conversationId] = true;
        }

        requestPause();
        showCurrentLine();
        return true;
    }

    function fireTrigger(trigger, onComplete, state) {
        for (const conversationId of registry.getConversationIdsForTrigger(trigger)) {
            if (shouldSkipConversation(conversationId, state)) continue;
            if (startSession(conversationId, onComplete, state)) return true;
        }

        if (onComplete) onComplete();
        return false;
    }

    function advance() {
        if (!session) return;

        session.lineIndex++;
        if (session.lineIndex >= session.resolved.lines.length) {
            finishSession();
            return;
        }

        showCurrentLine();
    }

    function end() {
        finishSession();
    }

    return {
        startSession,
        fireTrigger,
        advance,
        end,
        isActive,
    };
}
