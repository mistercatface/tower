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
    inspect_jacko_can_garbanzo: {
        trigger: "inspect:jacko_can",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Hey Barry, don't you drink this stuff?" },
            { speakerId: "barry", text: "Uh, yeah. The horchata flavor is actually pretty good. But it was me who phoned in the tip on this one." },
            { speakerId: "brock", text: "Really? Why? Was this what was making you have to go to the bathroom all the time?" },
            { speakerId: "barry", text: "We better keep moving." },
        ],
    },
};
