/**
 * @param {ReturnType<import("./animState.js").createEntityAnimState>} state
 * @param {object} actor
 * @param {Record<string, object>} poses
 * @param {(actor: object) => string} resolveWeaponStaticPoseName
 * @param {(actor: object) => string} getWeaponLoadoutKey
 */
export function syncWeaponPose(state, actor, poses, resolveWeaponStaticPoseName, getWeaponLoadoutKey) {
    const weaponKey = getWeaponLoadoutKey(actor);
    if (weaponKey === state.weaponLoadoutKey) return;
    state.weaponLoadoutKey = weaponKey;
    const poseName = resolveWeaponStaticPoseName(actor);
    const nextPose = poses[poseName] ?? poses.IDLE;
    state.lastStaticPose = state.currentStaticPose;
    state.currentStaticPose = nextPose;
    state.staticBlendFactor = 0;
    state.lastStaticChange = 0;
}
