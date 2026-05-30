import {
    transformPoint,
    triangleNormal,
    faceVisible,
    projectPoint,
    averageDepth,
    dot,
    normalize,
} from "./Mesh3D.js";

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

function drawTexturedTriangle(ctx, img, s0, s1, s2, d0, d1, d2) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();

    const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(denom) < 0.001) {
        ctx.restore();
        return;
    }

    const m11 = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom;
    const m12 = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom;
    const m21 = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom;
    const m22 = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom;
    const dx = d0.x - m11 * s0.x - m21 * s0.y;
    const dy = d0.y - m12 * s0.x - m22 * s0.y;

    ctx.transform(m11, m12, m21, m22, dx, dy);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
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
    const textureMap = opts.textureMap ?? {};
    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = opts.imageSmoothing ?? false;

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

        queue.push({
            sa, sb, sc,
            uvA: tri.uvA,
            uvB: tri.uvB,
            uvC: tri.uvC,
            material: tri.material,
            depth: averageDepth(a, b, c),
            normal: viewNormal,
        });
    }

    queue.sort((x, y) => y.depth - x.depth);

    for (const tri of queue) {
        const mat = mesh.materials[tri.material];
        if (!mat) continue;

        if (mat.type === "texture") {
            const img = mat.image ?? textureMap[mat.source] ?? textureMap[tri.material];
            if (!img || !tri.uvA || !tri.uvB || !tri.uvC) continue;
            const iw = img.width;
            const ih = img.height;
            drawTexturedTriangle(
                ctx, img,
                { x: tri.uvA.u * iw, y: tri.uvA.v * ih },
                { x: tri.uvB.u * iw, y: tri.uvB.v * ih },
                { x: tri.uvC.u * iw, y: tri.uvC.v * ih },
                tri.sa, tri.sb, tri.sc,
            );
            continue;
        }

        const shade = computeSolidShade(tri.normal, lightDir);
        drawSolidTriangle(
            ctx,
            tri.sa,
            tri.sb,
            tri.sc,
            shadeColor(mat.color, shade),
            mat.stroke ?? "rgba(70, 78, 86, 0.25)",
            mat.lineWidth ?? 0.35,
        );
    }

    ctx.imageSmoothingEnabled = prevSmooth;
}

export function renderInspectMesh(ctx, mesh, cx, cy, scale, yaw, pitch, opts = {}) {
    const camera = {
        cx,
        cy,
        referenceDepth: opts.referenceDepth ?? 420,
        screenScale: (opts.screenScale ?? scale * 88),
        yaw,
        pitch,
    };
    renderMesh(ctx, mesh, camera, opts);
}
