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
    let ts0 = s0, ts1 = s1, ts2 = s2;
    let td0 = d0, td1 = d1, td2 = d2;

    let denom = ts0.x * (ts1.y - ts2.y) + ts1.x * (ts2.y - ts0.y) + ts2.x * (ts0.y - ts1.y);
    if (Math.abs(denom) < 0.001) return;

    if (denom < 0) {
        ts1 = s2; ts2 = s1;
        td1 = d2; td2 = d1;
        denom = -denom;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(td0.x, td0.y);
    ctx.lineTo(td1.x, td1.y);
    ctx.lineTo(td2.x, td2.y);
    ctx.closePath();
    ctx.clip();

    const m11 = (td0.x * (ts1.y - ts2.y) + td1.x * (ts2.y - ts0.y) + td2.x * (ts0.y - ts1.y)) / denom;
    const m12 = (td0.y * (ts1.y - ts2.y) + td1.y * (ts2.y - ts0.y) + td2.y * (ts0.y - ts1.y)) / denom;
    const m21 = (td0.x * (ts2.x - ts1.x) + td1.x * (ts0.x - ts2.x) + td2.x * (ts1.x - ts0.x)) / denom;
    const m22 = (td0.y * (ts2.x - ts1.x) + td1.y * (ts0.x - ts2.x) + td2.y * (ts1.x - ts0.x)) / denom;
    const dx = td0.x - m11 * ts0.x - m21 * ts0.y;
    const dy = td0.y - m12 * ts0.x - m22 * ts0.y;

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
