import { setSandboxCameraTarget } from "./sandboxCameraTarget.js";
/**
 * Reusable utility to handle camera focus targeting, cycling, validation,
 * and keyboard input bindings (e.g., Tab key) across a set of entity/prop IDs.
 */
export class CameraTargetCycler {
    /**
     * @param {object} state Global game state
     * @param {object} options
     * @param {() => string[]} options.getTargetIds Callback returning all candidate IDs
     * @param {(id: string|null, prop: object|null) => void} [options.onTargetChanged] Callback fired when target focus shifts
     * @param {string} [options.triggerKey] Keyboard key code to trigger cycle (defaults to "Tab")
     */
    constructor(state, { getTargetIds, onTargetChanged = null, triggerKey = "Tab" } = {}) {
        this.state = state;
        this.getTargetIds = getTargetIds;
        this.onTargetChanged = onTargetChanged;
        this.triggerKey = triggerKey;
        this.focusedId = null;
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }
    /**
     * Filters target IDs to only those that exist in the registry and are not dead.
     * @returns {string[]} array of valid target IDs
     */
    getValidTargetIds() {
        if (!this.getTargetIds) return [];
        return this.getTargetIds().filter((id) => {
            const prop = this.state.entityRegistry.getLive(id);
            return prop && !prop.isDead;
        });
    }
    /**
     * Cycles to the next valid target in sequence.
     * @returns {string|null} the newly focused target ID
     */
    cycle() {
        const ids = this.getValidTargetIds();
        if (ids.length === 0) {
            this.setFocusedId(null);
            return null;
        }
        const currentIndex = ids.indexOf(this.focusedId);
        const nextIndex = (currentIndex + 1) % ids.length;
        const nextId = ids[nextIndex];
        this.setFocusedId(nextId);
        return nextId;
    }
    /**
     * Retargets to a fallback target if the current one dies or is removed.
     * @param {string} [skipId] target ID to explicitly avoid
     */
    retarget(skipId = null) {
        const ids = this.getValidTargetIds().filter((id) => id !== skipId);
        const oldId = this.focusedId;
        if (ids.length === 0) {
            this.setFocusedId(null);
            return;
        }
        // If the current target is still valid and not the skipId, keep it. Otherwise, pick the first fallback.
        if (oldId && oldId !== skipId && ids.includes(oldId)) return;
        this.setFocusedId(ids[0]);
    }
    /**
     * Sets target focus, updates camera target states, viewport snapping, and fires callbacks.
     * @param {string|null} targetId
     */
    setFocusedId(targetId) {
        const oldId = this.focusedId;
        if (oldId === targetId) return;
        this.focusedId = targetId;
        const oldProp = oldId ? this.state.entityRegistry.getLive(oldId) : null;
        const newProp = targetId ? this.state.entityRegistry.getLive(targetId) : null;
        if (oldProp) setSandboxCameraTarget(this.state, oldProp, false);
        if (newProp) {
            setSandboxCameraTarget(this.state, newProp, true);
            this.state.viewport.snapTo(newProp.x, newProp.y);
        }
        if (this.onTargetChanged) this.onTargetChanged(targetId, newProp);
    }
    /**
     * Returns the currently focused prop object.
     * @returns {object|null}
     */
    getFocusedProp() {
        if (!this.focusedId) return null;
        return this.state.entityRegistry.getLive(this.focusedId);
    }
    /**
     * Keydown handler to intercept key events.
     * @param {KeyboardEvent} e
     * @private
     */
    _handleKeyDown(e) {
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
        if (e.code === this.triggerKey) {
            e.preventDefault();
            this.cycle();
        }
    }
    /**
     * Binds keyboard input listener.
     */
    bindInput() {
        window.addEventListener("keydown", this._handleKeyDown);
    }
    /**
     * Unbinds keyboard input listener.
     */
    unbindInput() {
        window.removeEventListener("keydown", this._handleKeyDown);
    }
    /**
     * Cleans up all listeners and camera focus states.
     */
    destroy() {
        this.unbindInput();
        if (this.focusedId) {
            const prop = this.getFocusedProp();
            if (prop) setSandboxCameraTarget(this.state, prop, false);
        }
    }
}
