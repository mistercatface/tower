import { enemyTypes, spawnPods } from "../Config/Config.js";

const FALLBACK_POD = {
    id: "fallback_standard",
    members: [{ type: "standard", count: 1 }],
};

export function getPodSize(pod) {
    return pod.members.reduce((sum, member) => sum + member.count, 0);
}

export function getEnemyType(typeName) {
    return enemyTypes.find((entry) => entry.type === typeName) ?? null;
}

function isPodEligible(pod, state, maxSize) {
    if (pod.minLevel !== undefined && state.level < pod.minLevel) {
        return false;
    }
    const size = getPodSize(pod);
    if (maxSize !== undefined && size > maxSize) {
        return false;
    }
    return pod.members.every((member) => getEnemyType(member.type) !== null);
}

function pickWeightedPod(candidates) {
    const totalWeight = candidates.reduce((sum, pod) => sum + (pod.weight ?? 1), 0);
    let rand = Math.random() * totalWeight;

    for (const pod of candidates) {
        const weight = pod.weight ?? 1;
        if (rand < weight) {
            return pod;
        }
        rand -= weight;
    }

    return candidates[candidates.length - 1];
}

function buildRemainderPod(remaining) {
    return {
        id: "remainder",
        members: [{ type: "standard", count: remaining }],
    };
}

export function selectSpawnPod(state, remainingEnemies) {
    if (remainingEnemies <= 0) {
        return FALLBACK_POD;
    }

    const fittingPods = spawnPods.filter((pod) => isPodEligible(pod, state, remainingEnemies));
    if (fittingPods.length > 0) {
        return pickWeightedPod(fittingPods);
    }

    return buildRemainderPod(remainingEnemies);
}

export function getBossPod() {
    return {
        id: "boss",
        members: [{ type: "boss", count: 1 }],
    };
}
