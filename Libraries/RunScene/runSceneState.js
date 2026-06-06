export function createDefaultRunScene() {
    return { opening: { completed: false }, intro: { active: false, triggered: false, completed: false, dialogUnlocked: false }, mission: null };
}
/** @param {object} state */
export function ensureRunScene(state) {
    if (!state.runScene) state.runScene = createDefaultRunScene();
    return state.runScene;
}
/** @param {object} state */
export function getRunSceneIntro(state) {
    return ensureRunScene(state).intro;
}
/** @param {object} state */
export function getRunSceneMission(state) {
    return ensureRunScene(state).mission;
}
/** @param {object} state @param {object | null} mission */
export function setRunSceneMission(state, mission) {
    ensureRunScene(state).mission = mission;
}
/**
 * @param {object} state
 * @param {string} path — e.g. "intro.completed"
 */
export function resolveRunSceneFlag(state, path) {
    const runScene = ensureRunScene(state);
    const parts = path.split(".");
    let value = runScene;
    for (const part of parts) {
        if (value == null) return false;
        value = value[part];
    }
    return Boolean(value);
}
