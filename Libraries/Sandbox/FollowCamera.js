import { setSandboxCameraTarget } from "./sandboxCameraTarget.js";

/**
 * Handles camera focus targeting, viewport snapping, and cycling
 * without any game-specific (e.g. Snake) logic.
 */
export class FollowCamera {
    /**
     * @param {object} state Global game state
     * @param {object} [options]
     * @param {string} [options.triggerKey] Keyboard key code to cycle target (defaults to "Tab")
     */
    constructor(state, { triggerKey = "Tab" } = {}) {
        this.state = state;
        this.triggerKey = triggerKey;
        this.targetProp = null;
        this._candidateListFn = null;
        this._pickResolverFn = null;
        this._onTargetChangedCallbacks = new Set();
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    /**
     * Registers a callback that returns candidate props for cycling.
     * @param {() => object[]} fn
     */
    registerCandidateList(fn) {
        this._candidateListFn = fn;
    }

    /**
     * Registers a custom resolver to map a clicked prop ID to a focus target prop.
     * @param {(propId: string) => object | null} fn
     */
    registerPickResolver(fn) {
        this._pickResolverFn = fn;
    }

    /** @param {(prop: object|null) => void} cb */
    addOnTargetChanged(cb) {
        this._onTargetChangedCallbacks.add(cb);
    }

    /** @param {(prop: object|null) => void} cb */
    removeOnTargetChanged(cb) {
        this._onTargetChangedCallbacks.delete(cb);
    }

    /**
     * Focuses a target prop, snapping the viewport to it if requested.
     * @param {object|null} prop
     * @param {boolean} [snap=true]
     */
    focus(prop, snap = true) {
        const oldTarget = this.targetProp;
        if (oldTarget === prop) {
            if (prop && snap) this.state.viewport?.snapTo?.(prop.x, prop.y);

            return;
        }
        if (oldTarget) setSandboxCameraTarget(this.state, oldTarget, false);

        this.targetProp = prop;
        if (prop) {
            setSandboxCameraTarget(this.state, prop, true);
            if (snap) this.state.viewport?.snapTo?.(prop.x, prop.y);
        }
        for (const cb of this._onTargetChangedCallbacks) cb(prop);
    }

    /** Clears the focus target. */
    clear() {
        this.focus(null);
    }

    /**
     * Cycles through candidate props.
     * @param {() => object[]} [getProps] Override candidate getter
     * @returns {object|null} The newly focused target prop
     */
    cycle(getProps) {
        const fn = getProps || this._candidateListFn;
        const props = fn ? fn() : [];
        const validProps = props.filter((p) => p && !p.isDead);
        if (validProps.length === 0) {
            this.clear();
            return null;
        }
        const currentIndex = this.targetProp ? validProps.findIndex((p) => p.id === this.targetProp.id) : -1;
        const nextIndex = (currentIndex + 1) % validProps.length;
        const nextProp = validProps[nextIndex];
        this.focus(nextProp, true);
        return nextProp;
    }

    focusFromPropId(propId) {
        if (!this._candidateListFn && !this._pickResolverFn) return false;

        let prop = this.state.entityRegistry.getLive(propId);
        if (!prop) return false;
        if (this._pickResolverFn) {
            const resolved = this._pickResolverFn(propId);
            if (resolved) {
                this.focus(resolved, true);
                return true;
            }
        }
        if (this._candidateListFn) {
            const candidates = this._candidateListFn();
            const isCandidate = candidates.some((c) => c && c.id === prop.id);
            if (isCandidate) {
                this.focus(prop, true);
                return true;
            }
        }
        return false;
    }

    _handleKeyDown(e) {
        if (e.target instanceof HTMLElement && (e.target.isContentEditable || e.target.matches("textarea, select, input"))) return;
        if (e.code === this.triggerKey) {
            e.preventDefault();
            this.cycle();
        }
    }

    bindInput() {
        window.addEventListener("keydown", this._handleKeyDown);
    }

    unbindInput() {
        window.removeEventListener("keydown", this._handleKeyDown);
    }

    destroy() {
        this.unbindInput();
        this.reset();
    }

    reset() {
        this.clear();
        this._candidateListFn = null;
        this._pickResolverFn = null;
    }
}
