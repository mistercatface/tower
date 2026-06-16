/** @typedef {{ networkIdByKey: Map<number, number> }} PassageNetworkPolicyView */
/** @param {Int32Array} keys @param {Int32Array} ids */
export function createPassageNetworkPolicyView(keys, ids) {
    const networkIdByKey = new Map();
    for (let i = 0; i < keys.length; i++) networkIdByKey.set(keys[i], ids[i]);
    return { networkIdByKey };
}
/** @param {number} keyCount */
export function navPassagePolicySabByteLength(keyCount) {
    return Math.max(4 + keyCount * 8, 12);
}
/**
 * @param {Set<number> | undefined} poweredKeys
 * @param {Map<number, number> | undefined} networkIdByKey
 * @param {Uint8Array} bytes
 */
export function packPassagePolicyToSab(poweredKeys, networkIdByKey, bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (!poweredKeys || !networkIdByKey || poweredKeys.size === 0) {
        view.setInt32(0, 0, true);
        return 0;
    }
    const count = poweredKeys.size;
    view.setInt32(0, count, true);
    let i = 0;
    for (const key of poweredKeys) {
        view.setInt32(4 + i * 4, key, true);
        view.setInt32(4 + count * 4 + i * 4, networkIdByKey.get(key) ?? -1, true);
        i++;
    }
    return count;
}
/** @param {SharedArrayBuffer} sab @param {number} [keyCount] */
export function bindPassagePolicyFromSab(sab, keyCount) {
    const view = new DataView(sab);
    const count = keyCount ?? view.getInt32(0, true);
    if (count <= 0) return createPassageNetworkPolicyView(new Int32Array(0), new Int32Array(0));
    const keys = new Int32Array(sab, 4, count);
    const ids = new Int32Array(sab, 4 + count * 4, count);
    return createPassageNetworkPolicyView(keys, ids);
}
