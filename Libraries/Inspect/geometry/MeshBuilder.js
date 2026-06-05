import { vec3, cross, sub, normalize } from "../../Math/Vec3.js";

export function triangleNormal(a, b, c) {
    return cross(sub(b, a), sub(c, a));
}

export function faceVisible(normal, epsilon = 1e-4) {
    return normal.z < -epsilon;
}

export function pushTriangle(triangles, a, b, c, material, {
    uvA = null,
    uvB = null,
    uvC = null,
    normal = null,
} = {}) {
    triangles.push({
        a, b, c,
        uvA, uvB, uvC,
        material,
        normal: normal ?? normalize(triangleNormal(a, b, c)),
    });
}

export function pushQuad(triangles, a, b, c, d, material, {
    uvA = null,
    uvB = null,
    uvC = null,
    uvD = null,
    normal = null,
} = {}) {
    const n = normal ?? normalize(cross(sub(b, a), sub(c, a)));
    pushTriangle(triangles, a, b, c, material, { uvA, uvB, uvC, normal: n });
    pushTriangle(triangles, a, c, d, material, { uvA, uvC, uvD, normal: n });
}

export { vec3 };
