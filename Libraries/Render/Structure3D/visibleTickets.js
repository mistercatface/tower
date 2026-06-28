const sTicketPool = [];
let sTicketCount = 0;
export function resetTicketPool() {
    sTicketCount = 0;
}
export function borrowTicket(kind, baseIndex, ref, distSq) {
    let t = sTicketPool[sTicketCount];
    if (!t) {
        t = { kind: "", baseIndex: 0, ref: null, _distSq: 0 };
        sTicketPool[sTicketCount] = t;
    }
    t.kind = kind;
    t.baseIndex = baseIndex;
    t.ref = ref;
    t._distSq = distSq;
    sTicketCount++;
    return t;
}
