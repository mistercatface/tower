import { LruMap } from "../../Libraries/DataStructures/LruMap.js";

export function createKinematicsSpriteCache() {
    const maxItems = 2000;
    return {
        maxItems,
        cache: new LruMap(maxItems),
        rotationSteps: 32,
        animFrames: 30,
        tiltSteps: 5,
        cachePadding: 40,

        getKey(id, pose, rotation, cycle, crouch, tiltFactor, weaponKey = "", aimKey = "", dx = 0, dy = 0) {
            const rotStep = (Math.PI * 2) / this.rotationSteps;
            let r = rotation % (Math.PI * 2);
            if (r < 0) r += Math.PI * 2;
            const qRot = Math.floor(r / rotStep);

            const cycStep = (Math.PI * 2) / this.animFrames;
            let c = cycle % (Math.PI * 2);
            if (c < 0) c += Math.PI * 2;
            const qCyc = Math.floor(c / cycStep);

            const qCrouch = crouch > 0.5 ? 1 : 0;
            const qTilt = Math.floor(tiltFactor * (this.tiltSteps - 1));

            const qDx = Math.round(Math.max(-120, Math.min(120, dx)) / 30);
            const qDy = Math.round(Math.max(-120, Math.min(120, dy)) / 30);

            return `${id}_${pose}_${weaponKey}_${aimKey}_${qRot}_${qCyc}_${qCrouch}_${qTilt}_${qDx}_${qDy}`;
        },

        get(key) {
            const canvas = this.cache.get(key);
            return canvas ?? null;
        },

        set(key, sourceCanvas) {
            const c = new OffscreenCanvas(sourceCanvas.width, sourceCanvas.height);
            c.drawRatio = sourceCanvas.drawRatio;
            c.verticalShift = sourceCanvas.verticalShift;
            const ctx = c.getContext("2d");
            ctx.drawImage(sourceCanvas, 0, 0);
            this.cache.set(key, c);
            return c;
        },

        getQuantizedValues(rotation, cycle, tiltFactor, dx = 0, dy = 0) {
            const rotStep = (Math.PI * 2) / this.rotationSteps;
            let r = rotation % (Math.PI * 2);
            if (r < 0) r += Math.PI * 2;
            const qRot = Math.floor(r / rotStep) * rotStep;

            const cycStep = (Math.PI * 2) / this.animFrames;
            let c = cycle % (Math.PI * 2);
            if (c < 0) c += Math.PI * 2;
            const qCyc = Math.floor(c / cycStep) * cycStep;

            const bucket = Math.floor(tiltFactor * (this.tiltSteps - 1));
            const qTilt = bucket / (this.tiltSteps - 1);

            const qDx = Math.round(Math.max(-120, Math.min(120, dx)) / 30) * 30;
            const qDy = Math.round(Math.max(-120, Math.min(120, dy)) / 30) * 30;

            return { rotation: qRot, cycle: qCyc, tilt: qTilt, dx: qDx, dy: qDy };
        },
    };
}
