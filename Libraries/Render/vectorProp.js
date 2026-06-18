/**
 * Vector prop overlay — radar / boids-style physics silhouettes.
 *
 * Facade contract: vector draw runs only when `resolveVectorPropPresentation` returns non-null.
 * `"default"` mode, unsupported spec, or null asset → null → default world prop draw via `drawWorldProp`.
 */
import { createBakedSpriteCache } from "../Canvas/BakedSpriteCache.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { traceCircle } from "../Canvas/CanvasPath.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { propFootprintHalfExtents } from "../Props/propStrategy.js";
import { resolveSandboxPropVisual, SANDBOX_PROP_VISUAL_DEFAULT, SANDBOX_PROP_VISUAL_VECTOR } from "../Sandbox/sandboxPropMeta.js";
import { prepModifiedBlit, resolveSpriteDrawModifier } from "./spriteDrawModifier.js";
/** @typedef {{ kind: "circle", radius: number }} VectorPropCircleBody */
/** @typedef {{ kind: "rect", halfExtents: { x: number, y: number }, facing?: number, rollAngle?: number }} VectorPropRectBody */
/** @typedef {{ kind: "polygon", vertices: { x: number, y: number }[], facing?: number }} VectorPropPolygonBody */
/** @typedef {{ body: VectorPropCircleBody | VectorPropRectBody | VectorPropPolygonBody, extras: [] }} VectorPropSpec */
/** @typedef {"default" | "vector"} PropVisualMode */
/** @typedef {import("./spriteDrawModifier.js").SpriteDrawModifier} SpriteDrawModifier */
/** @typedef {CanvasImageSource & { width: number, height: number, anchorX?: number, anchorY?: number }} VectorSprite */
export const PROP_VISUAL_DEFAULT = SANDBOX_PROP_VISUAL_DEFAULT;
export const PROP_VISUAL_VECTOR = SANDBOX_PROP_VISUAL_VECTOR;
const VECTOR_PROP_STROKE = "rgba(72, 220, 140, 0.9)";
const VECTOR_PROP_LINE_WIDTH = 1.25;
const VECTOR_PROP_BAKE_PADDING = 3;
const shapeCache = createBakedSpriteCache({ maxItems: 256 });
/** @param {number} value */
function quantizeVectorShapeSize(value) {
    return Math.max(0.5, Math.round(value * 2) / 2);
}
/** @param {CanvasRenderingContext2D} ctx */
function applyVectorStrokeStyle(ctx) {
    ctx.strokeStyle = VECTOR_PROP_STROKE;
    ctx.lineWidth = VECTOR_PROP_LINE_WIDTH;
    ctx.lineJoin = "round";
}
/**
 * @param {object | null | undefined} prop
 * @param {object | null | undefined} gameState
 * @returns {PropVisualMode}
 */
export function resolvePropVisualMode(prop, gameState) {
    if (gameState?.editor?.forceVectorPropsAll) return PROP_VISUAL_VECTOR;
    if (!prop) return PROP_VISUAL_DEFAULT;
    return resolveSandboxPropVisual(gameState, prop);
}
function hasCustomCollisionSync(prop) {
    return typeof prop.strategy?.syncCollisionShape === "function";
}
export function resolveVectorPropSpec(prop, asset) {
    if (!prop || !asset) return null;
    if (hasCustomCollisionSync(prop)) return null;
    const extras = [];
    const collisionShape = prop.strategy?.collisionShape ?? asset.physics?.collisionShape ?? "circle";
    const shape = prop.shape ?? prop.getShape?.();
    if (shape?.type === "Polygon" && prop.strategy?.localFootprint?.length >= 3) return { body: { kind: "polygon", vertices: shape.vertices, facing: prop.facing ?? 0 }, extras };
    if (collisionShape === "box") {
        const halfExtents = propFootprintHalfExtents(prop);
        return { body: { kind: "rect", halfExtents: { x: halfExtents.x, y: halfExtents.y }, facing: prop.facing ?? 0 }, extras };
    }
    return { body: { kind: "circle", radius: resolveBodyRadius(prop) }, extras };
}
/**
 * @param {object | null | undefined} prop
 * @param {object | null | undefined} gameState
 * @returns {VectorPropSpec | null}
 */
export function resolveVectorPropPresentation(prop, gameState) {
    if (!prop || resolvePropVisualMode(prop, gameState) !== PROP_VISUAL_VECTOR) return null;
    return resolveVectorPropSpec(prop, getPropAsset(prop.type));
}
/** @param {number} radius */
function bakeVectorCircle(radius) {
    const r = quantizeVectorShapeSize(radius);
    const pad = VECTOR_PROP_BAKE_PADDING + VECTOR_PROP_LINE_WIDTH;
    const span = Math.ceil((r + pad) * 2);
    const anchorX = span * 0.5;
    const anchorY = span * 0.5;
    const canvas = createOffscreenCanvas(span, span);
    const ctx = canvas.getContext("2d");
    applyVectorStrokeStyle(ctx);
    ctx.beginPath();
    traceCircle(ctx, anchorX, anchorY, r);
    ctx.stroke();
    return { canvas, anchorX, anchorY };
}
/** @param {{ x: number, y: number }[]} vertices */
function bakeVectorPolygon(vertices) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < vertices.length; i++) {
        const vx = vertices[i].x;
        const vy = vertices[i].y;
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
    }
    const pad = VECTOR_PROP_BAKE_PADDING + VECTOR_PROP_LINE_WIDTH;
    const spanW = Math.ceil(maxX - minX + pad * 2);
    const spanH = Math.ceil(maxY - minY + pad * 2);
    const anchorX = -minX + pad;
    const anchorY = -minY + pad;
    const canvas = createOffscreenCanvas(spanW, spanH);
    const ctx = canvas.getContext("2d");
    applyVectorStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(vertices[0].x + anchorX, vertices[0].y + anchorY);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x + anchorX, vertices[i].y + anchorY);
    ctx.closePath();
    ctx.stroke();
    return { canvas, anchorX, anchorY };
}
/** @param {{ x: number, y: number }[]} vertices */
function getVectorPolygonSprite(vertices) {
    const key = "poly:" + vertices.map((v) => `${quantizeVectorShapeSize(v.x)},${quantizeVectorShapeSize(v.y)}`).join("|");
    return getOrBakeVectorShape(key, () => bakeVectorPolygon(vertices));
}
/** @param {number} halfX @param {number} halfY */
function bakeVectorRect(halfX, halfY) {
    const hx = quantizeVectorShapeSize(halfX);
    const hy = quantizeVectorShapeSize(halfY);
    const pad = VECTOR_PROP_BAKE_PADDING + VECTOR_PROP_LINE_WIDTH;
    const spanW = Math.ceil((hx + pad) * 2);
    const spanH = Math.ceil((hy + pad) * 2);
    const anchorX = spanW * 0.5;
    const anchorY = spanH * 0.5;
    const canvas = createOffscreenCanvas(spanW, spanH);
    const ctx = canvas.getContext("2d");
    applyVectorStrokeStyle(ctx);
    ctx.strokeRect(anchorX - hx, anchorY - hy, hx * 2, hy * 2);
    return { canvas, anchorX, anchorY };
}
/** @param {string} key @param {() => { canvas: OffscreenCanvas, anchorX: number, anchorY: number }} bakeFn */
function getOrBakeVectorShape(key, bakeFn) {
    const cached = shapeCache.get(key);
    if (cached) return cached;
    const { canvas, anchorX, anchorY } = bakeFn();
    return shapeCache.set(key, canvas, { anchorX, anchorY });
}
/** @param {number} radius */
function getVectorCircleSprite(radius) {
    const r = quantizeVectorShapeSize(radius);
    return getOrBakeVectorShape(`circle:${r}`, () => bakeVectorCircle(r));
}
/** @param {number} halfX @param {number} halfY */
function getVectorRectSprite(halfX, halfY) {
    const hx = quantizeVectorShapeSize(halfX);
    const hy = quantizeVectorShapeSize(halfY);
    return getOrBakeVectorShape(`rect:${hx}x${hy}`, () => bakeVectorRect(hx, hy));
}
export function clearVectorShapeCache() {
    shapeCache.clear();
}
/** @param {CanvasRenderingContext2D} ctx @param {VectorSprite} sprite @param {number} x @param {number} y @param {{ rotation?: number, modifier?: SpriteDrawModifier | null }} [options] */
function blitVectorSprite(ctx, sprite, x, y, { rotation = 0, modifier = null } = {}) {
    const anchorX = sprite.anchorX ?? sprite.width * 0.5;
    const anchorY = sprite.anchorY ?? sprite.height * 0.5;
    const drawX = modifier?.drawX ?? x;
    const drawY = modifier?.drawY ?? y;
    const scale = modifier?.scale ?? 1;
    if (!rotation && !modifier?.clipCircle) {
        const destW = sprite.width * scale;
        const destH = sprite.height * scale;
        if (modifier?.alpha != null) {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = prevAlpha * modifier.alpha;
            ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, destW, destH);
            ctx.globalAlpha = prevAlpha;
            return;
        }
        ctx.drawImage(sprite, drawX - anchorX * scale, drawY - anchorY * scale, destW, destH);
        return;
    }
    ctx.save();
    prepModifiedBlit(ctx, modifier);
    ctx.translate(drawX, drawY);
    if (scale !== 1) ctx.scale(scale, scale);
    if (rotation) ctx.rotate(rotation);
    ctx.drawImage(sprite, -anchorX, -anchorY);
    ctx.restore();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {VectorPropSpec} spec
 * @param {{ camera?: object, gameState?: object }} [options]
 */
export function drawVectorProp(ctx, prop, spec, options = {}) {
    const camera = options.camera ?? options.gameState?.viewport;
    const modifier = resolveSpriteDrawModifier(prop, camera);
    const body = spec.body;
    if (body.kind === "circle") blitVectorSprite(ctx, getVectorCircleSprite(body.radius), prop.x, prop.y, { modifier });
    else if (body.kind === "polygon") blitVectorSprite(ctx, getVectorPolygonSprite(body.vertices), prop.x, prop.y, { rotation: body.facing ?? 0, modifier });
    else blitVectorSprite(ctx, getVectorRectSprite(body.halfExtents.x, body.halfExtents.y), prop.x, prop.y, { rotation: body.facing ?? 0, modifier });
}
