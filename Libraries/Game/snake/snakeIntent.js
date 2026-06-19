export function perceiveSnakeIntentWorld(seeker, state, resolveVisibleFood) {
    return { food: resolveVisibleFood(seeker, state) };
}
export function pickSnakeIntentPolicy(world) {
    const food = world.food;
    if (!food) return { mode: "explore", targetId: null };
    return { mode: "seek_food", targetId: food.id };
}
function policyToIntentChoice(state, policy) {
    if (policy.mode === "explore") return { mode: policy.mode, target: null };
    const target = state.entityRegistry.getLive(policy.targetId);
    if (!target || target.isDead) return { mode: "explore", target: null };
    return { mode: policy.mode, target };
}
export function pickSnakeIntentTarget(seeker, state, resolveVisibleFood) {
    const world = perceiveSnakeIntentWorld(seeker, state, resolveVisibleFood);
    return policyToIntentChoice(state, pickSnakeIntentPolicy(world));
}
