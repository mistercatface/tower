import { registerPropInspect } from "../InspectRegistry.js";
import {
    drawJackoFuelBarrelInspect,
    preloadJackoFuelLabel,
    onJackoFuelLabelReady,
} from "../3D/JackoFuelBarrel.js";

/** Wire all props that support tap-to-inspect. Add new registrations here. */
export function registerInspectableProps() {
    registerPropInspect("barrel", {
        title: "JACKO FUEL",
        preload: preloadJackoFuelLabel,
        onReady: onJackoFuelLabelReady,
        getInitialYaw: (pickup) => pickup.facing ?? 0,
        draw(ctx, cx, cy, scale, yaw, pitch) {
            drawJackoFuelBarrelInspect(ctx, cx, cy, scale, yaw, pitch);
        },
    });
}
