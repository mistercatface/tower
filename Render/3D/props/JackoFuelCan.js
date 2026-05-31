import { buildSodaCanMesh } from "../CylinderMesh.js";
import { vec3, pushTriangle } from "../Mesh3D.js";

export const JACKO_LABEL_SRC = "Images/jacko_fuel_barrel.png";

/** Shared Jacko Fuel can dimensions, label band, and colors. */
export const JACKO_CAN = {
    halfHeight: 1.05,
    bodyRadius: 0.5,
    label: {
        y0: 0.21,
        y1: 0.79,
        angleCenter: -Math.PI / 2,
        angleSpan: Math.PI * 1.15,
        radialSegments: 10,
        verticalSegments: 18,
    },
    combat: {
        height: 22,
        /** Frustum-normalized band; combat isometric projection uses a different scale than inspect y0/y1. */
        bandT0: 0.28,
        bandT1: 0.72,
        arcHalf: 0.92,
    },
    colors: {
        body: { shadow: "#7A8088", mid: "#B4BAC2", highlight: "#E2E6EC" },
        bodyFire: { shadow: "#4A2018", mid: "#8A3020", highlight: "#C04828" },
        bodyInspect: "#B4BAC2",
        lip: "#9AA0A8",
        top: "#C8CDD4",
        stroke: "#505860",
        tab: "#D8DCE2",
    },
};

function appendPullTab(mesh) {
    const { halfHeight, bodyRadius, colors } = JACKO_CAN;
    const y = halfHeight + 0.035;
    mesh.materials.tab = { type: "solid", color: colors.tab, stroke: null, lineWidth: 0 };

    const a = vec3(bodyRadius * 0.14, y, -bodyRadius * 0.04);
    const b = vec3(bodyRadius * 0.32, y + 0.005, -bodyRadius * 0.18);
    const c = vec3(bodyRadius * 0.08, y - 0.015, -bodyRadius * 0.01);
    const d = vec3(-bodyRadius * 0.06, y + 0.005, bodyRadius * 0.1);
    pushTriangle(mesh.triangles, a, b, c, "tab");
    pushTriangle(mesh.triangles, a, c, d, "tab");
}

export function buildJackoInspectMesh() {
    const mesh = buildSodaCanMesh({ onFire: false });
    appendPullTab(mesh);
    return mesh;
}
