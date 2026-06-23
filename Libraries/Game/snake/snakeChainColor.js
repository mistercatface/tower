import { getPropVisualTint, randomVisualTintHex, setPropVisualTint } from "../../Color/visualOverride.js";
import { hueToPickerHex } from "../../Color/hex.js";
export function applySnakeChainTint(members, tintHex) {
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function copySnakeChainTintFromHead(state, headId, prop) {
    const head = state.entityRegistry.getLive(headId);
    const tint = getPropVisualTint(head);
    if (tint != null) setPropVisualTint(prop, tint);
}
export function pickSnakeChainTintHex(faction = null, rng = Math.random) {
    let resolvedFaction = faction;
    let resolvedRng = rng;
    if (typeof faction === "function") {
        resolvedRng = faction;
        resolvedFaction = null;
    }
    if (resolvedFaction === "red") {
        const hue = (350 + resolvedRng() * 30) % 360;
        const sat = 70 + resolvedRng() * 15;
        const light = 45 + resolvedRng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    if (resolvedFaction === "blue") {
        const hue = 205 + resolvedRng() * 40;
        const sat = 70 + resolvedRng() * 15;
        const light = 45 + resolvedRng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    return randomVisualTintHex(resolvedRng);
}
