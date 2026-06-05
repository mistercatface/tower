/** @typedef {import("../../Entities/Pickup.js").Pickup} Pickup */

import { InspectViewer } from "../../Libraries/Inspect/InspectViewer.js";
import { getInspectEntry } from "../../Libraries/Inspect/InspectCatalog.js";
import { toInspectSubject } from "./inspectTargeting.js";
import { isRadioDialogActive } from "../../Games/tower/wireRadio.js";
import {
    onInspectPanelClosed,
    playGuidedInspectRadio,
    recordClueFound,
} from "./ClueSearch.js";
import { requestGamePause, requestGameResume, requestUiUpdate } from "../../Core/EventSystem.js";

const INSPECTOR_PAUSE_REASON = "inspector";

class InspectBridge {
    constructor() {
        this.gameState = null;
        this.viewer = new InspectViewer({
            hooks: {
                onOpen: ({ subject }) => this.handleOpen(subject),
                onClose: ({ subject }) => this.handleClose(subject),
                isSubjectValid: (subject) => !subject?.isDead,
            },
        });
    }

    mount() {
        this.viewer.mount();
    }

    resize() {
        this.viewer.resize();
    }

    isOpen() {
        return this.viewer.isOpen();
    }

    /**
     * @param {Pickup} pickup
     * @param {(() => void)|null} [onClose]
     * @param {import("../../GameState/GameState.js").GameState|null} [state]
     */
    open(pickup, onClose = null, state = null) {
        const subject = toInspectSubject(pickup);
        const entry = getInspectEntry(subject.inspectKey);
        if (!entry) return;

        this.gameState = state;
        this.viewer.open(entry, subject, onClose);
    }

    /** @param {import("../../Libraries/Inspect/InspectCatalog.js").InspectSubject} subject */
    handleOpen(subject) {
        const state = this.gameState;
        if (state) {
            state.inspectPanelOpen = true;
        }

        requestGamePause(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();

        const inspectKey = subject.inspectKey;
        if (inspectKey && state?.clueSearchSeen != null) {
            playGuidedInspectRadio(state, inspectKey, () => recordClueFound(state, inspectKey));
        }
    }

    /** @param {import("../../Libraries/Inspect/InspectCatalog.js").InspectSubject} subject */
    handleClose(subject) {
        const closedKey = subject.inspectKey;
        const state = this.gameState;
        this.gameState = null;

        requestGameResume(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();

        if (
            closedKey
            && state?.clueSearchSeen
            && !state.clueSearchSeen.has(closedKey)
            && !isRadioDialogActive()
        ) {
            recordClueFound(state, closedKey);
        }

        if (state) {
            onInspectPanelClosed(state);
        }
    }
}

export const inspectBridge = new InspectBridge();
