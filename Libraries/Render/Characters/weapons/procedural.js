const GUN_COLORS = {
    dark: "#111111",
    mid: "#970000",
    highlight: "#fbff00",
};

function drawPistol(ctx, hand, scale, aimAngle, config, barrelRatio) {
    const S = (r) => config.SIZE * r;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(aimAngle);
    ctx.scale(scale, scale);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    ctx.translate(S(0.01), -S(0.03));
    const barrelLen = S(barrelRatio);
    const barrelHeight = S(0.04);
    const gripHeight = S(0.08);

    const grad = ctx.createLinearGradient(0, -S(0.04), 0, 0);
    grad.addColorStop(0, GUN_COLORS.highlight);
    grad.addColorStop(0.5, GUN_COLORS.mid);
    grad.addColorStop(1, GUN_COLORS.dark);
    ctx.fillStyle = grad;
    if (gripHeight > S(0.01)) ctx.fillRect(-S(0.02), 0, S(0.045), gripHeight);
    ctx.fillRect(0, -S(0.02), barrelLen, barrelHeight);
    ctx.fillStyle = "#666666";
    ctx.fillRect(0, -S(0.02), barrelLen, S(0.01));
    ctx.fillStyle = "#000000";
    ctx.fillRect(barrelLen - S(0.005), -S(0.02), S(0.015), barrelHeight);
    ctx.restore();
}

function drawLongGun(ctx, hand, scale, aimAngle, config, style, barrelRatio) {
    const S = (r) => config.SIZE * r;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(aimAngle);
    ctx.scale(scale, scale);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    ctx.translate(S(0.01), -S(0.03));
    const isSmg = style === "smg";
    const barrelLen = S(barrelRatio);
    const barrelHeight = S(isSmg ? 0.035 : 0.045);
    const stockLen = S(0.1);

    ctx.fillStyle = isSmg ? "#222222" : "#5c3a21";
    ctx.fillRect(-stockLen, -S(0.012), stockLen, S(0.024));
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-S(0.02), -S(0.025), S(0.05), S(0.05));
    ctx.fillStyle = "#333333";
    ctx.fillRect(0, -barrelHeight / 2, barrelLen, barrelHeight);
    ctx.fillStyle = "#888888";
    ctx.fillRect(0, -barrelHeight / 2, barrelLen, S(0.01));
    if (!isSmg) {
        ctx.fillStyle = "#4a3828";
        ctx.fillRect(S(0.08), -S(0.025), S(0.08), S(0.05));
    } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(S(0.01), S(0.01), S(0.02), S(0.04));
    }
    ctx.fillStyle = "#000000";
    ctx.fillRect(barrelLen - S(0.005), -barrelHeight / 2, S(0.015), barrelHeight);
    ctx.restore();
}

function createWeaponVisual({ poseName, barrelRatio, draw }) {
    return { poseName, barrelRatio, draw };
}

export const WEAPON_VISUALS = {
    pistol: createWeaponVisual({
        poseName: "PISTOL",
        barrelRatio: 0.2,
        draw: (ctx, hand, scale, aim, config, visual) => drawPistol(ctx, hand, scale, aim, config, visual.barrelRatio),
    }),
    longGun: createWeaponVisual({
        poseName: "SHOTGUN",
        barrelRatio: 0.32,
        draw: (ctx, hand, scale, aim, config, visual) => drawLongGun(ctx, hand, scale, aim, config, "shotgun", visual.barrelRatio),
    }),
    smg: createWeaponVisual({
        poseName: "SHOTGUN",
        barrelRatio: 0.28,
        draw: (ctx, hand, scale, aim, config, visual) => drawLongGun(ctx, hand, scale, aim, config, "smg", visual.barrelRatio),
    }),
};
