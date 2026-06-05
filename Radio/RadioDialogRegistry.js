import { radioSpeakers } from "../Config/content/radio/RadioSpeakers.js";
import { radioConversations } from "../Config/content/radio/RadioConversations.js";

/** @type {Map<string, string[]>} */
const conversationsByTrigger = new Map();

for (const [conversationId, conversation] of Object.entries(radioConversations)) {
    const trigger = conversation.trigger;
    if (!trigger) continue;
    if (!conversationsByTrigger.has(trigger)) {
        conversationsByTrigger.set(trigger, []);
    }
    conversationsByTrigger.get(trigger).push(conversationId);
}

export function getConversationIdsForTrigger(trigger) {
    return conversationsByTrigger.get(trigger) ?? [];
}

export function getConversation(conversationId) {
    const conversation = radioConversations[conversationId];
    if (!conversation) {
        console.warn(`[Radio] Unknown conversation: ${conversationId}`);
        return null;
    }
    return conversation;
}

export function getSpeaker(speakerId) {
    const speaker = radioSpeakers[speakerId];
    if (!speaker) {
        console.warn(`[Radio] Unknown speaker: ${speakerId}`);
        return null;
    }
    return speaker;
}

/** Unique speaker ids in line order (for portrait layout). */
export function getParticipantIds(conversation) {
    const ids = [];
    for (const line of conversation.lines) {
        if (!ids.includes(line.speakerId)) {
            ids.push(line.speakerId);
        }
    }
    return ids;
}

export function resolveConversation(conversationId) {
    const conversation = getConversation(conversationId);
    if (!conversation || !conversation.lines?.length) return null;

    const participantIds = getParticipantIds(conversation);
    const participants = participantIds.map((id) => {
        const speaker = getSpeaker(id);
        if (!speaker) return null;
        return { id, ...speaker };
    });

    if (participants.some((p) => p == null)) return null;

    const lines = conversation.lines.map((line) => {
        const speaker = getSpeaker(line.speakerId);
        if (!speaker) return null;
        return {
            speakerId: line.speakerId,
            speakerName: speaker.name,
            portrait: speaker.portrait,
            text: line.text,
        };
    });

    if (lines.some((l) => l == null)) return null;

    return {
        id: conversationId,
        trigger: conversation.trigger,
        oncePerRun: conversation.oncePerRun ?? false,
        participants,
        lines,
    };
}
