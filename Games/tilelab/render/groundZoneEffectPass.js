/** @type {import("../../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const groundZoneEffectPass = {
    zIndex: 12,
    draw(state, _viewport, ctx) {
        const zones = state.groundZones;
        if (!zones?.length) return;
        ctx.save();
        for (let z = 0; z < zones.length; z++) {
            const zone = zones[z];
            const verts = zone.shape.vertices;
            ctx.beginPath();
            ctx.moveTo(zone.x + verts[0].x, zone.y + verts[0].y);
            for (let i = 1; i < verts.length; i++) ctx.lineTo(zone.x + verts[i].x, zone.y + verts[i].y);
            ctx.closePath();
            ctx.fillStyle = "rgba(120, 200, 255, 0.18)";
            ctx.fill();
            ctx.strokeStyle = "rgba(120, 200, 255, 0.65)";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    },
};
