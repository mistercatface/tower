/** @typedef {import("../Entities/Pickup.js").Pickup} Pickup */

import { InspectViewer } from "../Render/Inspect/InspectViewer.js";
import { getPickupInspectEntry } from "../Render/Inspect/InspectCatalog.js";
import { isRadioDialogActive } from "../Radio/RadioDialogController.js";
import {
    onPropInspectorPanelClosed,
    playGuidedInspectRadio,
    recordStartNodeInspection,
} from "./StartNodeInspection.js";
import { requestGamePause, requestGameResume, requestUiUpdate } from "../Core/EventSystem.js";

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
     * @param {import("../GameState/GameState.js").GameState|null} [state]
     */
    open(pickup, onClose = null, state = null) {
        const entry = getPickupInspectEntry(pickup);
        if (!entry) return;

        this.gameState = state;
        this.viewer.open(entry, pickup, onClose);
    }

    /** @param {Pickup} subject */
    handleOpen(subject) {
        const state = this.gameState;
        if (state) {
            state.propInspectorPanelOpen = true;
        }

        requestGamePause(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();

        const inspectKey = subject.strategy?.inspectKey;
        if (inspectKey && state?.startNodeInspectionSeen != null) {
            playGuidedInspectRadio(state, inspectKey, () => recordStartNodeInspection(state, inspectKey));
        }
    }

    /** @param {Pickup} subject */
    handleClose(subject) {
        const closedKey = subject?.strategy?.inspectKey;
        const state = this.gameState;
        this.gameState = null;

        requestGameResume(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();

        if (
            closedKey
            && state?.startNodeInspectionSeen
            && !state.startNodeInspectionSeen.has(closedKey)
            && !isRadioDialogActive()
        ) {
            recordStartNodeInspection(state, closedKey);
        }

        if (state) {
            onPropInspectorPanelClosed(state);
        }
    }
}

export const inspectBridge = new InspectBridge();
