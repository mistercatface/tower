/** Scripted radio conversations keyed by id. */
export const radioConversations = {
    run_start_barry_brock: {
        trigger: "run_start",
        oncePerRun: true,
        lines: [
            { speakerId: "barry", text: "Okay Brock, I'm letting you take the lead on this one." },
            { speakerId: "brock", text: "Okay, I'm ready." },
        ],
    },
};
