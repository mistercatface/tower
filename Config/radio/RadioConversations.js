/** Scripted radio conversations keyed by id. */
export const radioConversations = {
    run_start_barry_brock: {
        trigger: "run_start",
        oncePerRun: true,
        lines: [
            { speakerId: "barry", text: "Brock, you copy? Tower uplink is live." },
            { speakerId: "brock", text: "Loud and clear. Try not to trip the alarms this time." },
            { speakerId: "barry", text: "No promises. Let's move." },
        ],
    },
};
