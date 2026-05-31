import { events, Events, requestGamePause, requestGameResume } from "../Core/EventSystem.js";
import { resolveConversation } from "./RadioDialogRegistry.js";

const PAUSE_REASON = "radio";

let session = null;

function isActive() {
    return session != null;
}

function showCurrentLine() {
    const { resolved, lineIndex } = session;
    const line = resolved.lines[lineIndex];

    events.emit(Events.UI_SHOW_RADIO, {
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
    events.emit(Events.UI_HIDE_RADIO);
    requestGameResume(PAUSE_REASON);
    if (onComplete) onComplete();
}

function startSession(conversationId, onComplete, state) {
    if (isActive()) {
        console.warn("[Radio] Already in a conversation");
        return;
    }

    const resolved = resolveConversation(conversationId);
    if (!resolved) return;

    if (resolved.oncePerRun && state?.radioSeenThisRun?.[conversationId]) {
        if (onComplete) onComplete();
        return;
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

    requestGamePause(PAUSE_REASON);
    showCurrentLine();
}

function advanceSession() {
    if (!session) return;

    session.lineIndex++;
    if (session.lineIndex >= session.resolved.lines.length) {
        finishSession();
        return;
    }

    showCurrentLine();
}

export function registerRadioListeners(eventBus) {
    eventBus.on(Events.RADIO_START, ({ conversationId, onComplete, state }) => {
        startSession(conversationId, onComplete, state);
    });

    eventBus.on(Events.RADIO_ADVANCE, () => {
        advanceSession();
    });

    eventBus.on(Events.RADIO_END, () => {
        finishSession();
    });
}

export function isRadioDialogActive() {
    return isActive();
}
