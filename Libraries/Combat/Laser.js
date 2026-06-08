import { drawLaserBeam } from "../Render/LaserBeam.js";
export class Laser {
    constructor(x1, y1, x2, y2, color = "#ff0000", isSight = false) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.color = color;
        this.isSight = isSight;
    }
    isVisible(viewport) {
        if (!viewport) return true;
        const minX = Math.min(this.x1, this.x2);
        const maxX = Math.max(this.x1, this.x2);
        const minY = Math.min(this.y1, this.y2);
        const maxY = Math.max(this.y1, this.y2);
        const halfW = viewport.cx / viewport.zoom;
        const halfH = viewport.cy / viewport.zoom;
        const vpMinX = viewport.x - halfW;
        const vpMaxX = viewport.x + halfW;
        const vpMinY = viewport.y - halfH;
        const vpMaxY = viewport.y + halfH;
        return minX <= vpMaxX && maxX >= vpMinX && minY <= vpMaxY && maxY >= vpMinY;
    }
    render(ctx) {
        drawLaserBeam(ctx, this.x1, this.y1, this.x2, this.y2, this.color, this.isSight);
    }
}
