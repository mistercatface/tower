import { createSpherePrimitive } from "./spherePrimitive.js";
import { createCylinderPrimitive } from "./cylinderPrimitive.js";
import { createBoxPrimitive } from "./boxPrimitive.js";
import { createRollingBoxPrimitive } from "./rollingBoxPrimitive.js";
import { createFlipperPrimitive } from "../../Render/Props3D/flipperPaddle.js";
/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_PRIMITIVE_BUILDERS = {
    sphere: createSpherePrimitive,
    cylinder: createCylinderPrimitive,
    box: createBoxPrimitive,
    rollingBox: createRollingBoxPrimitive,
    flipper: createFlipperPrimitive,
};
