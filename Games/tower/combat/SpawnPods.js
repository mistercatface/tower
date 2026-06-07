import { spawnPods } from "../config/towerConfig.js";
import { getEnemyDefinition } from "../entities/EntityRegistry.js";
import { weightedPick } from "../../../Libraries/Random/weightedPick.js";
const FALLBACK_POD = { id: "fallback_standard", members: [{ type: "standard", count: 1 }] };
export function getEnemyType(typeName) {
    return getEnemyDefinition(typeName);
}
function isPodEligible(pod) {
    return pod.members.every((member) => getEnemyType(member.type) !== null);
}
export function selectSpawnPod() {
    const fittingPods = spawnPods.filter((pod) => isPodEligible(pod));
    if (fittingPods.length > 0) return weightedPick(fittingPods, (pod) => pod.weight ?? 1) ?? fittingPods[fittingPods.length - 1];
    return FALLBACK_POD;
}
