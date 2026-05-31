import { JACKO_CAN } from "../../../../Config/props/JackoCan.js";
import { buildSodaCanMesh } from "../../CylinderMesh.js";
import { vec3, pushTriangle } from "../../Mesh3D.js";

function appendPullTab(mesh, halfHeight, bodyRadius, tabColor) {
    const y = halfHeight + 0.035;
    mesh.materials.tab = { type: "solid", color: tabColor, stroke: null, lineWidth: 0 };

    const a = vec3(bodyRadius * 0.14, y, -bodyRadius * 0.04);
    const b = vec3(bodyRadius * 0.32, y + 0.005, -bodyRadius * 0.18);
    const c = vec3(bodyRadius * 0.08, y - 0.015, -bodyRadius * 0.01);
    const d = vec3(-bodyRadius * 0.06, y + 0.005, bodyRadius * 0.1);
    pushTriangle(mesh.triangles, a, b, c, "tab");
    pushTriangle(mesh.triangles, a, c, d, "tab");
}

export function buildJackoInspectMesh() {
    const { halfHeight, bodyRadius, colors } = JACKO_CAN;
    const mesh = buildSodaCanMesh({ halfHeight, bodyRadius, onFire: false });
    appendPullTab(mesh, halfHeight, bodyRadius, colors.tab);
    return mesh;
}
