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
    start_game_guards_chickpea_garbanzo: {
        trigger: "start_game_guards",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "Are you going to let us pass?" },
            { speakerId: "garbanzo", text: "Nope." },
        ],
    },
    intro_guards_cleared_barry_brock: {
        trigger: "intro_guards_cleared",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "You said this place was deserted." },
            { speakerId: "barry", text: "Guess they thought so too." },
            { speakerId: "brock", text: "Let's look around." },
        ],
    },
    inspect_fuel_barrel_garbanzo: {
        trigger: "inspect:fuel_barrel",
        oncePerRun: true,
        lines: [
            { speakerId: "brock", text: "How would you feel about helping me drag one of these back to the ship?" },
            { speakerId: "barry", text: "Maybe we can find a dolly somewhere." },
        ],
    },
    clue_search_complete_barry_brock: {
        trigger: "clue_search_complete",
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
