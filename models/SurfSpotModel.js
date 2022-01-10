const mongoose = require("mongoose");

const pointSchema = require("./PointModel");

const SurfSpot = mongoose.Schema(
    {
        name: { type: String, required: true },
        description: { type: String, required: true },
        address: { type: String, required: true },

        coords: {
            type: pointSchema,
            required: true,
        },
    },
    { timestamps: true }
);
SurfSpot.index({ coords: "2dsphere" });

module.exports = mongoose.model("SurfSpot", SurfSpot);
