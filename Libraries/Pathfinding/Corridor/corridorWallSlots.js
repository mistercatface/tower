/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */
/** @typedef {{ c: number, r: number, side: number }} WallSlot */

/** @param {RoomRect} node */
export function listRoomWallEdgeSlots(node) {
    /** @type {WallSlot[]} */
    const slots = [];
    for (let c = node.c0; c <= node.c1; c++) {
        slots.push({ c, r: node.r0, side: 0 });
        slots.push({ c, r: node.r1, side: 2 });
    }
    for (let r = node.r0; r <= node.r1; r++) {
        slots.push({ c: node.c0, r, side: 3 });
        slots.push({ c: node.c1, r, side: 1 });
    }
    return slots;
}

/** @param {RoomRect} node @param {number} side */
export function listFacingWallSlots(node, side) {
    const slots = listRoomWallEdgeSlots(node);
    /** @type {WallSlot[]} */
    const facing = [];
    for (let i = 0; i < slots.length; i++) if (slots[i].side === side) facing.push(slots[i]);
    return facing;
}

/** @param {WallSlot[]} slots @param {number} start @param {number} width */
export function wallSlotsContiguous(slots, start, width) {
    if (start + width > slots.length) return false;
    for (let i = 1; i < width; i++) {
        const a = slots[start + i - 1];
        const b = slots[start + i];
        if (a.side !== b.side) return false;
        if (a.side === 0 || a.side === 2) {
            if (a.r !== b.r || b.c !== a.c + 1) return false;
        } else if (a.c !== b.c || b.r !== a.r + 1) return false;
    }
    return true;
}

/** @param {WallSlot} a @param {WallSlot} b */
function sameWallSlot(a, b) {
    return a.c === b.c && a.r === b.r && a.side === b.side;
}

/** @typedef {{ anchor: WallSlot, slots: WallSlot[] }} WallHoleGroup */

/** @param {WallSlot[]} facingSlots @param {number} corridorWidth */
export function listWallHoleGroups(facingSlots, corridorWidth) {
    if (corridorWidth === 1) {
        /** @type {WallHoleGroup[]} */
        const groups = [];
        for (let i = 0; i < facingSlots.length; i++) groups.push({ anchor: facingSlots[i], slots: [facingSlots[i]] });
        return groups;
    }
    /** @type {WallHoleGroup[]} */
    const groups = [];
    for (let s = 0; s <= facingSlots.length - corridorWidth; s++) {
        if (!wallSlotsContiguous(facingSlots, s, corridorWidth)) continue;
        const slice = facingSlots.slice(s, s + corridorWidth);
        groups.push({ anchor: slice[(corridorWidth - 1) >> 1], slots: slice });
    }
    return groups;
}

/** @param {WallHoleGroup} a @param {WallHoleGroup} b */
export function wallHoleGroupsOverlap(a, b) {
    for (let i = 0; i < a.slots.length; i++)
        for (let j = 0; j < b.slots.length; j++) if (sameWallSlot(a.slots[i], b.slots[j])) return true;
    return false;
}

/** @param {WallHoleGroup[]} groups */
export function maxDisjointWallHoleGroups(groups) {
    if (groups.length === 0) return 0;
    /** @type {WallHoleGroup[]} */
    const sorted = groups.slice();
    sorted.sort((a, b) => a.slots[0].c - b.slots[0].c || a.slots[0].r - b.slots[0].r);
    /** @type {WallHoleGroup[]} */
    const picked = [];
    for (let i = 0; i < sorted.length; i++) {
        const group = sorted[i];
        let ok = true;
        for (let j = 0; j < picked.length; j++) if (wallHoleGroupsOverlap(group, picked[j])) {
            ok = false;
            break;
        }
        if (ok) picked.push(group);
    }
    return picked.length;
}

/** @param {RoomRect} node @param {{ centerC: number, centerR: number }} target */
export function socketSideToward(node, target) {
    const dx = target.centerC - node.centerC;
    const dy = target.centerR - node.centerR;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
}

/** @param {RoomRect} nodeA @param {RoomRect} nodeB @param {number} corridorWidth */
export function maxCorridorLanesBetweenNodes(nodeA, nodeB, corridorWidth) {
    const parentSide = socketSideToward(nodeA, nodeB);
    const childSide = socketSideToward(nodeB, nodeA);
    const parentGroups = listWallHoleGroups(listFacingWallSlots(nodeA, parentSide), corridorWidth);
    const childGroups = listWallHoleGroups(listFacingWallSlots(nodeB, childSide), corridorWidth);
    return Math.min(maxDisjointWallHoleGroups(parentGroups), maxDisjointWallHoleGroups(childGroups));
}

/** @param {() => number} rng @param {number} length */
export function shuffleIndexOrder(rng, length) {
    /** @type {number[]} */
    const order = new Array(length);
    for (let i = 0; i < length; i++) order[i] = i;
    for (let i = length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    return order;
}
