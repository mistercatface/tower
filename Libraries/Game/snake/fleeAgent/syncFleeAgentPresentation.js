import { clearPropVisualOverride, getPropVisualTint, setPropVisualTint } from "../../../Color/visualOverride.js";
export function syncFleeAgentPresentation(prop, { sprinting, baseTint, sprintTint }) {
    const wantTint = sprinting ? sprintTint : baseTint;
    const current = getPropVisualTint(prop);
    if (wantTint) {
        if (current === wantTint) return;
        setPropVisualTint(prop, wantTint);
        return;
    }
    if (!prop.visualOverride?.tint) return;
    clearPropVisualOverride(prop);
}
