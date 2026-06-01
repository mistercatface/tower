export function createKinematicsSpriteCache() {
    const rotationSteps = 32;
    const animFrames = 30;
    const tiltSteps = 5;
    const rotStep = (Math.PI * 2) / rotationSteps;
    const cycStep = (Math.PI * 2) / animFrames;

    function quantizeRotation(rotation) {
        let r = rotation % (Math.PI * 2);
        if (r < 0) r += Math.PI * 2;
        return Math.floor(r / rotStep) * rotStep;
    }

    function quantizeCycle(cycle) {
        let c = cycle % (Math.PI * 2);
        if (c < 0) c += Math.PI * 2;
        return Math.floor(c / cycStep) * cycStep;
    }

    function quantizeTilt(tiltFactor) {
        const bucket = Math.floor(tiltFactor * (tiltSteps - 1));
        return bucket / (tiltSteps - 1);
    }

    return {
        cache: new Map(),
        maxItems: 2000,
        rotationSteps,
        animFrames,
        tiltSteps,
        cachePadding: 40,

        quantize(rotation, cycle, tiltFactor) {
            return {
                rotation: quantizeRotation(rotation),
                cycle: quantizeCycle(cycle),
                tilt: quantizeTilt(tiltFactor),
            };
        },

        quantizeAimKey(actor) {
            const step = rotStep;
            const quantize = (angle) => {
                let r = (angle ?? 0) % (Math.PI * 2);
                if (r < 0) r += Math.PI * 2;
                return Math.floor(r / step);
            };
            const turrets = actor.turrets ?? [];
            return `${quantize(turrets[0]?.angle)}_${quantize(turrets[1]?.angle)}`;
        },

        getKey(id, pose, q, crouch, weaponKey = "", aimKey = "") {
            const qCrouch = crouch > 0.5 ? 1 : 0;
            const qTilt = Math.floor(q.tilt * (tiltSteps - 1));
            const qRot = Math.floor(q.rotation / rotStep);
            const qCyc = Math.floor(q.cycle / cycStep);
            return `${id}_${pose}_${weaponKey}_${aimKey}_${qRot}_${qCyc}_${qCrouch}_${qTilt}`;
        },

        get(key) {
            const item = this.cache.get(key);
            if (item) {
                item.lastUsed = Date.now();
                return item.canvas;
            }
            return null;
        },

        set(key, sourceCanvas) {
            if (this.cache.size >= this.maxItems) {
                const oldestKey = this.cache.keys().next().value;
                this.cache.delete(oldestKey);
            }
            const c = document.createElement("canvas");
            c.width = sourceCanvas.width;
            c.height = sourceCanvas.height;
            c.drawRatio = sourceCanvas.drawRatio;
            c.verticalShift = sourceCanvas.verticalShift;
            const ctx = c.getContext("2d");
            ctx.drawImage(sourceCanvas, 0, 0);
            this.cache.set(key, { canvas: c, lastUsed: Date.now() });
            return c;
        },
    };
}
