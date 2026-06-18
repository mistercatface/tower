import { createSpherePrimitive } from "./spherePrimitive.js";
import { createPolygonPrimitive } from "./polygonPrimitive.js";
import { createFlipperPrimitive } from "../../Render/Props3D/flipperPaddle.js";
import { createPipeElbowPrimitive } from "../../Render/Props3D/pipeElbow.js";
/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_PRIMITIVE_BUILDERS = { sphere: createSpherePrimitive, polygon: createPolygonPrimitive, flipper: createFlipperPrimitive, pipeElbow: createPipeElbowPrimitive };
