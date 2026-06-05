import { spawnPods } from "../Config/Config.js";
import { getEnemyDefinition } from "../Entities/EntityRegistry.js";

const FALLBACK_POD = {
    id: "fallback_standard",
    members: [{ type: "standard", count: 1 }],
};

export function getEnemyType(typeName) {
    return getEnemyDefinition(typeName);
}

function isPodEligible(pod) {
    return pod.members.every((member) => getEnemyType(member.type) !== null);
}

function pickWeightedPod(candidates) {
    const totalWeight = candidates.reduce((sum, pod) => sum + (pod.weight ?? 1), 0);
    let rand = Math.random() * totalWeight;

    for (const pod of candidates) {
        const weight = pod.weight ?? 1;
        if (rand < weight) return pod;
        rand -= weight;
    }

    return candidates[candidates.length - 1];
}

export function selectSpawnPod() {
    const fittingPods = spawnPods.filter((pod) => isPodEligible(pod));
    if (fittingPods.length > 0) return pickWeightedPod(fittingPods);
    return FALLBACK_POD;
}
