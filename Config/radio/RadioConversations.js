/** Scripted radio conversations keyed by id. */
export const radioConversations = {
    run_start_barry_brock: {
        trigger: "run_start",
        oncePerRun: true,
        lines: [
            { speakerId: "barry", text: "This is the spot. Entrance through here." },
            { speakerId: "brock", text: "Okay, let's move." },
        ],
    },
    start_node_guards_chickpea_garbanzo: {
        trigger: "start_node_guards",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Are you going to let us pass?" },
            { speakerId: "garbanzo", text: "Nope." },
        ],
    },
    first_wave_clear_barry_brock: {
        trigger: "first_wave_clear",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "You said this place was deserted." },
            { speakerId: "barry", text: "Guess they thought so too." },
            { speakerId: "brock", text: "Let's look around." },
        ],
    },
    inspect_jacko_can_garbanzo: {
        trigger: "inspect:jacko_can",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "How would you feel about helping me drag one of these back to the ship?" },
            { speakerId: "barry", text: "Maybe we can find a dolly somewhere." },
        ],
    },
    start_node_inspection_complete_barry_brock: {
        trigger: "start_node_inspection_complete",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Well, we've made it this far. I'm not about to come back empty handed now." },
            { speakerId: "barry", text: "Let's just hope other humans are the worst things we run into." },
        ],
    },
    inspect_wood_crate_barry_brock: {
        trigger: "inspect:wood_crate",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Just some useless junk." },
            { speakerId: "barry", text: "We won't know for sure until we check them all." },
            { speakerId: "brock", text: "Have fun with that." },
        ],
    },
};
