import { runCollisionPipeline, satPolygonPolygonF32, satCirclePolygonF32, SAT_RESULT } from "../../Libraries/Physics/physics.js";
import { kineticDynamicSlab, kineticContactBuffer } from "../../Core/engineMemory.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON } from "../../Core/engineEnums.js";

const COINCIDENT_CIRCLE_EPS = 1e-10;

function circleCircleOverlapAtPose(xA, yA, rA, xB, yB, rB) {
    const dx = xB - xA;
    const dy = yB - yA;
    const distSq = dx * dx + dy * dy;
    const radii = rA + rB;
    if (distSq >= radii * radii) return false;
    if (distSq <= COINCIDENT_CIRCLE_EPS * COINCIDENT_CIRCLE_EPS) {
        SAT_RESULT[0] = radii;
        SAT_RESULT[1] = 0;
        SAT_RESULT[2] = 0;
        SAT_RESULT[3] = xA;
        SAT_RESULT[4] = yA;
        SAT_RESULT[5] = 1;
        SAT_RESULT[6] = 0;
        SAT_RESULT[7] = 0;
        SAT_RESULT[8] = 0;
        return true;
    }
    const dist = Math.sqrt(distSq);
    const overlap = radii - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    SAT_RESULT[0] = overlap;
    SAT_RESULT[1] = nx;
    SAT_RESULT[2] = ny;
    SAT_RESULT[3] = xA + nx * (rA - overlap / 2);
    SAT_RESULT[4] = yA + ny * (rA - overlap / 2);
    SAT_RESULT[5] = 0;
    SAT_RESULT[6] = 0;
    SAT_RESULT[7] = 0;
    SAT_RESULT[8] = 0;
    return true;
}

function satCheckPartRowsAtPose(partRowA, partRowB, xA, yA, cosA, sinA, xB, yB, cosB, sinB) {
    const slab = kineticDynamicSlab;
    const kindA = slab.partShapeKind[partRowA];
    const kindB = slab.partShapeKind[partRowB];
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_CIRCLE) {
        return circleCircleOverlapAtPose(xA, yA, slab.partRadius[partRowA], xB, yB, slab.partRadius[partRowB]);
    }
    if (kindA === SHAPE_TYPE_POLYGON && kindB === SHAPE_TYPE_POLYGON) {
        return satPolygonPolygonF32(
            xA, yA, cosA, sinA, slab.shapeVertPool, slab.shapeNormPool, slab.partVertOffset[partRowA], slab.partVertFloatCount[partRowA],
            xB, yB, cosB, sinB, slab.shapeVertPool, slab.shapeNormPool, slab.partVertOffset[partRowB], slab.partVertFloatCount[partRowB],
        );
    }
    if (kindA === SHAPE_TYPE_CIRCLE && kindB === SHAPE_TYPE_POLYGON) {
        return satCirclePolygonF32(xA, yA, slab.partRadius[partRowA], xB, yB, cosB, sinB, slab.shapeVertPool, slab.shapeNormPool, slab.partVertOffset[partRowB], slab.partVertFloatCount[partRowB]);
    }
    if (kindA === SHAPE_TYPE_POLYGON && kindB === SHAPE_TYPE_CIRCLE) {
        return satCirclePolygonF32(xB, yB, slab.partRadius[partRowB], xA, yA, cosA, sinA, slab.shapeVertPool, slab.shapeNormPool, slab.partVertOffset[partRowA], slab.partVertFloatCount[partRowA]);
    }
    return false;
}

export function checkPairAtSlabPose(bodyA, bodyB) {
    const slab = kineticDynamicSlab;
    const physIdA = bodyA._physId;
    const physIdB = bodyB._physId;
    const geomA = slab.partGeomOffset[physIdA];
    const geomB = slab.partGeomOffset[physIdB];
    const kindA = slab.shapeKind[physIdA];
    const kindB = slab.shapeKind[physIdB];
    const countA = slab.partCount[physIdA];
    const countB = slab.partCount[physIdB];
    if (geomA < 0 || geomB < 0) throw new Error(`checkPairAtSlabPose: missing shape CSR for physId ${geomA < 0 ? physIdA : physIdB}`);
    const xA = slab.x[physIdA];
    const yA = slab.y[physIdA];
    const xB = slab.x[physIdB];
    const yB = slab.y[physIdB];
    const cosA = slab.cos[physIdA];
    const sinA = slab.sin[physIdA];
    const cosB = slab.cos[physIdB];
    const sinB = slab.sin[physIdB];
    for (let i = 0; i < countA; i++) for (let j = 0; j < countB; j++) if (satCheckPartRowsAtPose(geomA + i, geomB + j, xA, yA, cosA, sinA, xB, yB, cosB, sinB)) return true;
    return false;
}

export function resolveKineticContactPass(tick) {
    runCollisionPipeline(tick.frame, tick.world, () => {}, undefined, 1);
    return kineticContactBuffer;
}

export function resolveKineticContactPassWithEffects(tick) {
    runCollisionPipeline(tick.frame, tick.world, () => {}, (frame, world, contacts) => world.fractureEngine.processKineticContactFractures(frame, world, contacts), 1);
}
