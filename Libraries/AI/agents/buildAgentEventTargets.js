/**
 * @typedef {string | {
 *   kind: string,
 *   visible?: (visible: object, remembered: object, visibleWorld: object) => unknown,
 *   remembered?: (visible: object, remembered: object, visibleWorld: object) => unknown,
 * }} AgentEventTargetSlot
 */
/**
 * @param {object} visible
 * @param {object} remembered
 * @param {object} visibleWorld
 * @param {AgentEventTargetSlot[]} slots
 */
export function buildAgentEventTargets(visible, remembered, visibleWorld, slots) {
    const targets = [];
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (typeof slot === "string") {
            targets.push({ kind: slot, visibleTarget: visible[slot] ?? visibleWorld[slot] ?? null, rememberedTarget: remembered[slot] ?? null });
            continue;
        }
        const { kind, visible: pickVisible, remembered: pickRemembered } = slot;
        targets.push({
            kind,
            visibleTarget: pickVisible ? pickVisible(visible, remembered, visibleWorld) : visibleWorld[kind],
            rememberedTarget: pickRemembered ? pickRemembered(visible, remembered, visibleWorld) : remembered[kind],
        });
    }
    return targets;
}
