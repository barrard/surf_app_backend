const mongoose = require("mongoose");

const SurfReport = mongoose.Schema(
    {
        additionalNotes: { type: String },
        dateTime: { type: String, required: true },
        crowd: { type: String, required: true },
        surfQuality: { type: String, required: true },
        weather: { type: String, required: true },
        wind: { type: String, required: true },
        rating: { type: Number },
        surfSpot: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SurfSpot",
            required: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("SurfReport", SurfReport);
