/**
 * Build a conversation/speaker lookup table from game content.
 *
 * @param {{ conversations: Record<string, object>, speakers: Record<string, object> }} content
 */
export function createRadioRegistry({ conversations, speakers }) {
    /** @type {Map<string, string[]>} */
    const conversationsByTrigger = new Map();

    for (const [conversationId, conversation] of Object.entries(conversations)) {
        const trigger = conversation.trigger;
        if (!trigger) continue;
        if (!conversationsByTrigger.has(trigger)) {
            conversationsByTrigger.set(trigger, []);
        }
        conversationsByTrigger.get(trigger).push(conversationId);
    }

    function getConversationIdsForTrigger(trigger) {
        return conversationsByTrigger.get(trigger) ?? [];
    }

    function getConversation(conversationId) {
        const conversation = conversations[conversationId];
        if (!conversation) {
            console.warn(`[Radio] Unknown conversation: ${conversationId}`);
            return null;
        }
        return conversation;
    }

    function getSpeaker(speakerId) {
        const speaker = speakers[speakerId];
        if (!speaker) {
            console.warn(`[Radio] Unknown speaker: ${speakerId}`);
            return null;
        }
        return speaker;
    }

    /** Unique speaker ids in line order (for portrait layout). */
    function getParticipantIds(conversation) {
        const ids = [];
        for (const line of conversation.lines) {
            if (!ids.includes(line.speakerId)) {
                ids.push(line.speakerId);
            }
        }
        return ids;
    }

    function resolveConversation(conversationId) {
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

    return {
        getConversationIdsForTrigger,
        getConversation,
        getSpeaker,
        getParticipantIds,
        resolveConversation,
    };
}
