import { transformPoint, projectPoint, averageDepth } from "../camera/InspectCamera.js";
import { triangleNormal, faceVisible } from "../geometry/MeshBuilder.js";
import { dot, normalize } from "../../Math/Vec3.js";
function drawSolidTriangle(ctx, sa, sb, sc, color, stroke, lineWidth) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.lineTo(sc.x, sc.y);
    ctx.closePath();
    ctx.fill();
    if (stroke && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }
}
function shadeColor(hex, shade) {
    const r = Math.floor(parseInt(hex.slice(1, 3), 16) * shade);
    const g = Math.floor(parseInt(hex.slice(3, 5), 16) * shade);
    const b = Math.floor(parseInt(hex.slice(5, 7), 16) * shade);
    return `rgb(${r}, ${g}, ${b})`;
}
function computeSolidShade(normal, lightDir) {
    const n = normalize(normal);
    const intensity = Math.max(0.15, -dot(n, lightDir));
    return 0.45 + intensity * 0.55;
}
export function renderMesh(ctx, mesh, camera, opts = {}) {
    const lightDir = normalize(opts.lightDir ?? { x: -0.35, y: 0.45, z: -0.85 });
    const flatShading = opts.flatShading ?? false;
    const queue = [];
    for (const tri of mesh.triangles) {
        const a = transformPoint(tri.a, camera.yaw, camera.pitch);
        const b = transformPoint(tri.b, camera.yaw, camera.pitch);
        const c = transformPoint(tri.c, camera.yaw, camera.pitch);
        const viewNormal = triangleNormal(a, b, c);
        if (!faceVisible(viewNormal)) continue;
        const sa = projectPoint(a, camera);
        const sb = projectPoint(b, camera);
        const sc = projectPoint(c, camera);
        if (!sa || !sb || !sc) continue;
        queue.push({ sa, sb, sc, material: tri.material, depth: averageDepth(a, b, c), normal: viewNormal });
    }
    queue.sort((x, y) => y.depth - x.depth);
    for (const tri of queue) {
        const mat = mesh.materials[tri.material];
        if (!mat) continue;
        const shade = flatShading ? 1 : computeSolidShade(tri.normal, lightDir);
        drawSolidTriangle(ctx, tri.sa, tri.sb, tri.sc, shadeColor(mat.color, shade), mat.stroke, mat.lineWidth ?? 0);
    }
}
export function renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, opts = {}) {
    const camera = { cx, cy, referenceDepth: opts.referenceDepth ?? 420, screenScale: opts.screenScale ?? scale * 88, yaw, pitch };
    renderMesh(ctx, mesh, camera, opts);
}
