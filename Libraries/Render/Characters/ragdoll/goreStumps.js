import { RAGDOLL_CONFIG } from "../../../Kinematics/ragdoll/config.js";
import { absRagdollPoint } from "../../../Kinematics/ragdoll/physics.js";
import { SEVER_STUMP_BONES } from "../../../Kinematics/core/bones.js";

/** Blood stumps at severed joints — rig-local, same projection as live characters. */
export function drawRagdollGoreStumps(ragdoll, sceneRenderer, rig) {
    const severed = ragdoll.severed ?? {};
    if (Object.keys(severed).length === 0) return;
    if (!ragdoll.points) return;

    const bPalette = RAGDOLL_CONFIG.BLOOD.PALETTE;
    const stumpPalette = { base: bPalette.VENOUS, light: bPalette.VENOUS, dark: bPalette.VENOUS };

    for (const [limbId, stumps] of Object.entries(SEVER_STUMP_BONES)) {
        if (!severed[limbId]) continue;
        for (const { bone, radius } of stumps) {
            const p = absRagdollPoint(ragdoll, bone);
            if (!p) continue;
            sceneRenderer.addSphere(p, rig.torsoHalfWidth * radius, stumpPalette);
        }
    }
}
