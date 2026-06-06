/**
 * Generic run-scene progression: ordered story beats with skip/enter/advance hooks.
 * Games supply scene definitions; FSM phase transitions stay explicit per scene.
 */
export class RunSceneController {
    /**
     * @param {{
     *   scenes: object[],
     *   markRadiosSeen?: (state: object, triggers: string[]) => void,
     *   runStartRadios?: string[],
     *   fireRadioTrigger?: (trigger: string, onComplete: (() => void) | null, state: object) => void,
     * }} config
     */
    constructor({ scenes, markRadiosSeen = null, runStartRadios = ["run_start"], fireRadioTrigger = null }) {
        this.scenes = scenes;
        this.markRadiosSeen = markRadiosSeen;
        this.runStartRadios = runStartRadios;
        this.fireRadioTrigger = fireRadioTrigger;
        this.sceneIndex = 0;
        this.entered = false;
    }

    reset() {
        this.sceneIndex = 0;
        this.entered = false;
    }

    getCurrentScene() {
        return this.scenes[this.sceneIndex] ?? null;
    }

    getCurrentSceneId() {
        return this.getCurrentScene()?.id ?? null;
    }

    getCurrentCapabilities() {
        return this.getCurrentScene()?.capabilities ?? {};
    }

    resolveIndex(sceneId) {
        if (!sceneId) return 0;
        const idx = this.scenes.findIndex((scene) => scene.id === sceneId);
        return idx >= 0 ? idx : 0;
    }

    /**
     * Skip all scenes before the target, then mark the target as pending enter.
     * @param {string | null | undefined} sceneId
     */
    startAt(sceneId, state, ctx) {
        const targetIndex = this.resolveIndex(sceneId);
        if (targetIndex > 0 && this.markRadiosSeen && this.runStartRadios.length > 0) this.markRadiosSeen(state, this.runStartRadios);
        for (let i = 0; i < targetIndex; i++) {
            const scene = this.scenes[i];
            if (scene.radios?.length && this.markRadiosSeen) this.markRadiosSeen(state, scene.radios);
            scene.onSkip?.(state, ctx);
        }
        this.sceneIndex = targetIndex;
        this.entered = false;
    }

    /**
     * @param {object} state
     * @param {object} ctx
     * @param {{ applySpawn?: boolean }} [enterOpts] — spawn only on load/skip, not natural advance
     */
    enterCurrentScene(state, ctx, enterOpts = {}) {
        if (this.entered) return;
        const scene = this.getCurrentScene();
        if (!scene) return;
        scene.onEnter?.(state, ctx, enterOpts);
        this.entered = true;
        this.syncPhase(scene, ctx);
    }

    syncPhase(scene, ctx) {
        if (!scene.phase || !ctx.fsm || ctx.fsm.currentStateName === scene.phase) return;
        if (scene.phase === "inspector") {
            requestAnimationFrame(() => {
                if (ctx.fsm?.currentStateName !== "inspector") {
                    ctx.fsm?.transition("inspector");
                }
            });
            return;
        }
        ctx.fsm.transition(scene.phase);
    }

    tick(state, ctx) {
        const scene = this.getCurrentScene();
        if (!scene) return;
        scene.onTick?.(state, ctx);
        if (scene.isComplete?.(state, ctx)) this.advance(state, ctx);
    }

    onEnemyKilled(payload) {
        const scene = this.getCurrentScene();
        scene?.onEnemyKilled?.(payload);
        const ctx = { state: payload.state, fsm: payload.fsm };
        if (scene?.isComplete?.(payload.state, ctx)) this.advance(payload.state, ctx);
    }

    advance(state, ctx) {
        const scene = this.getCurrentScene();
        if (!scene) return;
        const transitionRadio = scene.transition?.radio;
        const doAdvance = () => {
            scene.onComplete?.(state, ctx);
            if (this.sceneIndex >= this.scenes.length - 1) return;
            this.sceneIndex++;
            this.entered = false;
            this.enterCurrentScene(state, ctx, { applySpawn: false });
        };
        if (transitionRadio && this.fireRadioTrigger) {
            this.fireRadioTrigger(transitionRadio, doAdvance, state);
            return;
        }
        doAdvance();
    }
}
