export default {
    "warp": {
        "frequency": 0.008,
        "amplitude": 20,
        "octaves": 3,
        "sampleOffset": [
            500,
            500
        ]
    },
    "palette": {
        "base": [
            10,
            25,
            5
        ],
        "floorBase": [
            24,
            42,
            24
        ],
        "wallBase": [
            41,
            24,
            24
        ]
    },
    "motifs": [
        {
            "type": "fractalCracks",
            "coordinateSpace": "eval",
            "frequency": 0.05,
            "octaves": 5,
            "threshold": 0.54,
            "peak": 3,
            "offset": [
                0,
                0
            ],
            "tint": [
                -3,
                -3,
                -3.4
            ],
            "opacity": 1,
            "blendMode": "multiply",
            "surfaceMask": "all"
        },
        {
            "type": "baseMetal",
            "structure": {
                "frequency": 0.005,
                "octaves": 3,
                "rgbDelta": [
                    2,
                    8,
                    2
                ]
            },
            "grain": {
                "frequency": 0.5,
                "octaves": 2,
                "amplitude": 1
            },
            "surfaceMask": "all",
            "blendMode": "add",
            "opacity": 1
        },
        {
            "type": "voronoiCell",
            "coordinateSpace": "warped",
            "density": 0.08,
            "edgeWidth": 0.06,
            "peak": 1,
            "tint": [
                2,
                8,
                1
            ],
            "surfaceMask": "all",
            "blendMode": "add",
            "opacity": 0.8
        }
    ],
    "animation": {
        "stages": [
            {
                "frames": 30,
                "durationMs": 4000,
                "tracks": [
                    {
                        "targetPath": "motifs[0].tint.0",
                        "startValue": -3,
                        "endValue": 0.8,
                        "easing": "easeInQuad"
                    }
                ]
            },
            {
                "frames": 30,
                "durationMs": 4000,
                "tracks": [
                    {
                        "targetPath": "motifs[0].tint.0",
                        "startValue": 0.8,
                        "endValue": -3,
                        "easing": "easeOutQuad"
                    }
                ]
            }
        ]
    }
};