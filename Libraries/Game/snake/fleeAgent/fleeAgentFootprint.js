import { polygonSignedArea2D } from "../../../Math/Poly2D.js";
import { syncKineticRigidBody } from "../../../Motion/bodyMass.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
import { invalidateBroadphaseBounds } from "../../../Spatial/collision/entityBroadphase.js";
import { CircleShape, PolygonShape } from "../../../Spatial/collision/Shapes.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
const FLEE_WEDGE_LOCAL_FOOTPRINT = [
    { x: -1.75, y: -0.97 },
    { x: 1.75, y: -0.97 },
    { x: 0, y: 1.94 },
];
const FLEE_WEDGE_LOCAL_EXTENT = 1.94;
export function resolveFleeAgentWedgeRadius(bodyRadius, config = getSnakeGameConfig()) {
    return bodyRadius * (config.fleeAgent?.wedgeRadiusScale ?? 1);
}
function wedgeVerticesInBallLocal(bodyRadius, wedgeRadius, linkSlack) {
    const scale = wedgeRadius / FLEE_WEDGE_LOCAL_EXTENT;
    const wedgeCenterX = (bodyRadius + wedgeRadius) * linkSlack;
    const verts = [];
    for (let i = 0; i < FLEE_WEDGE_LOCAL_FOOTPRINT.length; i++) {
        const wx = FLEE_WEDGE_LOCAL_FOOTPRINT[i].x * scale;
        const wy = FLEE_WEDGE_LOCAL_FOOTPRINT[i].y * scale;
        verts.push({ x: wedgeCenterX + wy, y: -wx });
    }
    return verts;
}
function boundingRadiusFromParts(circle, wedgeVertices) {
    let maxSq = circle.radius * circle.radius;
    for (let i = 0; i < wedgeVertices.length; i++) {
        const sq = wedgeVertices[i].x * wedgeVertices[i].x + wedgeVertices[i].y * wedgeVertices[i].y;
        if (sq > maxSq) maxSq = sq;
    }
    return Math.sqrt(maxSq);
}
export function buildFleeAgentCompoundGeometry(bodyRadius, options = {}) {
    const config = getSnakeGameConfig();
    const linkSlack = options.linkSlack ?? config.linkSlack;
    const wedgeRadius = options.wedgeRadius ?? resolveFleeAgentWedgeRadius(bodyRadius, config);
    const circle = new CircleShape(bodyRadius);
    const wedgeVertices = wedgeVerticesInBallLocal(bodyRadius, wedgeRadius, linkSlack);
    const wedge = new PolygonShape(wedgeVertices);
    const collisionParts = [circle, wedge];
    const footprintArea = Math.PI * bodyRadius * bodyRadius + Math.abs(polygonSignedArea2D(wedgeVertices));
    const boundingRadius = boundingRadiusFromParts(circle, wedgeVertices);
    return { collisionParts, wedgeVertices, footprintArea, boundingRadius, bodyRadius, wedgeRadius, linkSlack };
}
export function applyFleeAgentCompoundGeometry(prop, bodyRadius, options = {}) {
    const geometry = buildFleeAgentCompoundGeometry(bodyRadius, options);
    prop.collisionParts = geometry.collisionParts;
    prop.shape = geometry.collisionParts[0];
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    if (prop.strategy) prop.strategy.radius = geometry.bodyRadius;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        syncKineticRigidBody(prop);
        wakeKineticBody(prop);
    }
    return geometry;
}
