/** @deprecated Import from Render/3D/math/InspectCamera.js and Render/3D/geometry/MeshBuilder.js */
export {
    vec3,
    add,
    sub,
    scale,
    dot,
    cross,
    length,
    normalize,
    rotateY,
    rotateX,
    transformPoint,
    transformNormal,
    projectPoint,
    averageDepth,
    createInspectCamera,
} from "../math/InspectCamera.js";

export {
    triangleNormal,
    faceVisible,
    pushTriangle,
    pushQuad,
} from "../geometry/MeshBuilder.js";

export function vec2(u, v) {
    return { u, v };
}
