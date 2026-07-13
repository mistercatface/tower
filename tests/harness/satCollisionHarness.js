import { circleCircleContact, satPolygonPolygonF32, satCirclePolygonF32, SAT_RESULT } from "../../Libraries/Physics/physics.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON } from "../../Core/engineEnums.js";

function satSwapCirclePolyContactFeatures() {
    SAT_RESULT[1] = -SAT_RESULT[1];
    SAT_RESULT[2] = -SAT_RESULT[2];
    const featA = SAT_RESULT[6];
    SAT_RESULT[6] = SAT_RESULT[7];
    SAT_RESULT[7] = featA;
    const pointCount = SAT_RESULT[8];
    for (let p = 0; p < pointCount; p++) {
        const offset = 9 + p * 4;
        const fA = SAT_RESULT[offset + 2];
        SAT_RESULT[offset + 2] = SAT_RESULT[offset + 3];
        SAT_RESULT[offset + 3] = fA;
    }
}

export function satCheckCollision(xA, yA, angleA, shapeA, xB, yB, angleB, shapeB) {
    if (!shapeA || !shapeB) return false;
    const cosA = Math.cos(angleA);
    const sinA = Math.sin(angleA);
    const cosB = Math.cos(angleB);
    const sinB = Math.sin(angleB);
    const kindA = shapeA.shapeTypeId;
    const kindB = shapeB.shapeTypeId;
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_CIRCLE) return circleCircleContact(xA, yA, shapeA.radius, xB, yB, shapeB.radius);
    if (kindA === SHAPE_TYPE_POLYGON && kindB === SHAPE_TYPE_POLYGON) {
        const voA = shapeA._vertOffset || 0;
        const nA = shapeA._floatCount != null ? shapeA._floatCount : shapeA.vertices.length;
        const voB = shapeB._vertOffset || 0;
        const nB = shapeB._floatCount != null ? shapeB._floatCount : shapeB.vertices.length;
        return satPolygonPolygonF32(xA, yA, cosA, sinA, shapeA.vertices, shapeA.normals, voA, nA, xB, yB, cosB, sinB, shapeB.vertices, shapeB.normals, voB, nB);
    }
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_POLYGON) {
        const voB = shapeB._vertOffset || 0;
        const nB = shapeB._floatCount != null ? shapeB._floatCount : shapeB.vertices.length;
        return satCirclePolygonF32(xA, yA, shapeA.radius, xB, yB, cosB, sinB, shapeB.vertices, shapeB.normals, voB, nB);
    }
    if (kindA === SHAPE_TYPE_POLYGON && kindB === SHAPE_TYPE_CIRCLE) {
        const voA = shapeA._vertOffset || 0;
        const nA = shapeA._floatCount != null ? shapeA._floatCount : shapeA.vertices.length;
        const hit = satCirclePolygonF32(xB, yB, shapeB.radius, xA, yA, cosA, sinA, shapeA.vertices, shapeA.normals, voA, nA);
        if (hit) satSwapCirclePolyContactFeatures();
        return hit;
    }
    return false;
}
