import { projectVertical } from "./Projection3D.js";

export function createPropDrawContext(prop, viewerX, viewerY) {
    return {
        prop,
        x: prop.x,
        y: prop.y,
        facing: prop.facing ?? 0,
        px: viewerX,
        py: viewerY,
        project(height) {
            return projectVertical(this.x, this.y, this.px, this.py, height);
        },
    };
}

export function propAt(pc, x, y) {
    return {
        ...pc,
        x,
        y,
        project(height) {
            return projectVertical(x, y, pc.px, pc.py, height);
        },
    };
}
