/**
 * Vector prop overlay — radar / boids-style physics silhouettes from body.shape.
 *
 * Facade contract: vector draw runs only when `resolveVectorPropPresentation` returns non-null.
 * `"default"` mode, unsupported spec, or null asset → null → default world prop draw via `drawWorldProp`.
 */
import { createBakedSpriteCache } from "../Canvas/BakedSpriteCache.js";
import { createOffscreenCanvas } from "../Canvas/offscreenCanvas.js";
import { traceCircle } from "../Canvas/CanvasPath.js";
import { resolveBodyRadius } from "../Motion/bodyDefaults.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { resolveSandboxPropVisual, SANDBOX_PROP_VISUAL_DEFAULT, SANDBOX_PROP_VISUAL_VECTOR } from "../Sandbox/sandboxPropMeta.js";
import { prepModifiedBlit, resolveSpriteDrawModifier } from "./spriteDrawModifier.js";
/** @typedef {{ kind: "circle", radius: number }} VectorPropCircleBody */
/** @typedef {{ kind: "polygon", vertices: { x: number, y: number }[], facing: number }} VectorPropPolygonBody */
/** @typedef {{ body: VectorPropCircleBody | VectorPropPolygonBody, extras: [] }} VectorPropSpec */
/** @typedef {"default" | "vector"} PropVisualMode */
/** @typedef {import("./spriteDrawModifier.js").SpriteDrawModifier} SpriteDrawModifier */
/** @typedef {CanvasImageSource & { width: number, height: number, anchorX?: number, anchorY?: number }} VectorSprite */
export const PROP_VISUAL_DEFAULT = SANDBOX_PROP_VISUAL_DEFAULT;
export const PROP_VISUAL_VECTOR = SANDBOX_PROP_VISUAL_VECTOR;
const VECTOR_PROP_STROKE = "rgba(72, 220, 140, 0.9)";
const VECTOR_PROP_LINE_WIDTH = 1.25;
const VECTOR_PROP_BAKE_PADDING = 3;
const shapeCache = createBakedSpriteCache({ maxItems: 256 });
function quantizeVectorShapeSize(value) {
    return Math.max(0.5, Math.round(value * 2) / 2);
}
function applyVectorStrokeStyle(ctx) {
    ctx.strokeStyle = VECTOR_PROP_STROKE;
    ctx.lineWidth = VECTOR_PROP_LINE_WIDTH;
    ctx.lineJoin = "round";
}
export function resolvePropVisualMode(prop, gameState) {
    if (gameState?.editor?.forceVectorPropsAll) return PROP_VISUAL_VECTOR;
    if (!prop) return PROP_VISUAL_DEFAULT;
    return resolveSandboxPropVisual(gameState, prop);
}
function vectorPropFacing(prop) {
    if (prop._collisionFacing != null) return prop._collisionFacing;
    return prop.facing ?? 0;
}
function snapshotVertices(vertices) {
    const out = [];
    for (let i = 0; i < vertices.length; i++) out.push({ x: vertices[i].x, y: vertices[i].y });
    return out;
}
function polygonVectorCacheKey(vertices) {
    return vertices.map((v) => `${quantizeVectorShapeSize(v.x)},${quantizeVectorShapeSize(v.y)}`).join("|");
}
export function resolveVectorPropSpec(prop, asset) {
    if (!prop || !asset) return null;
    const shape = prop.getShape?.() ?? prop.shape;
    if (shape?.type === "Polygon") {
        const vertices = snapshotVertices(shape.vertices);
        return { body: { kind: "polygon", vertices, facing: vectorPropFacing(prop) }, extras: [] };
    }
    if (shape?.type === "Circle") return { body: { kind: "circle", radius: shape.radius }, extras: [] };
    return { body: { kind: "circle", radius: resolveBodyRadius(prop) }, extras: [] };
}
export function resolveVectorPropPresentation(prop, gameState) {
    if (!prop || resolvePropVisualMode(prop, gameState) !== PROP_VISUAL_VECTOR) return null;
    return resolveVectorPropSpec(prop, getPropAsset(prop.type));
}
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
function bakeVectorPolygon(vertices) {
    let maxR = 0;
    for (let i = 0; i < vertices.length; i++) maxR = Math.max(maxR, Math.hypot(vertices[i].x, vertices[i].y));
    const pad = VECTOR_PROP_BAKE_PADDING + VECTOR_PROP_LINE_WIDTH;
    const span = Math.ceil((maxR + pad) * 2);
    const anchorX = span * 0.5;
    const anchorY = span * 0.5;
    const canvas = createOffscreenCanvas(span, span);
    const ctx = canvas.getContext("2d");
    applyVectorStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(anchorX + vertices[0].x, anchorY + vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(anchorX + vertices[i].x, anchorY + vertices[i].y);
    ctx.closePath();
    ctx.stroke();
    return { canvas, anchorX, anchorY };
}
function getOrBakeVectorShape(key, bakeFn) {
    const cached = shapeCache.get(key);
    if (cached) return cached;
    const { canvas, anchorX, anchorY } = bakeFn();
    return shapeCache.set(key, canvas, { anchorX, anchorY });
}
function getVectorCircleSprite(radius) {
    const r = quantizeVectorShapeSize(radius);
    return getOrBakeVectorShape(`circle:${r}`, () => bakeVectorCircle(r));
}
function getVectorPolygonSprite(vertices) {
    const key = `poly:${polygonVectorCacheKey(vertices)}`;
    return getOrBakeVectorShape(key, () => bakeVectorPolygon(vertices));
}
export function clearVectorShapeCache() {
    shapeCache.clear();
}
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
export function drawVectorProp(ctx, prop, spec, options = {}) {
    const camera = options.camera ?? options.gameState?.viewport;
    const modifier = resolveSpriteDrawModifier(prop, camera);
    const body = spec.body;
    if (body.kind === "circle") blitVectorSprite(ctx, getVectorCircleSprite(body.radius), prop.x, prop.y, { modifier });
    else blitVectorSprite(ctx, getVectorPolygonSprite(body.vertices), prop.x, prop.y, { rotation: body.facing, modifier });
}
