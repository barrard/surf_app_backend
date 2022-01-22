const mongoose = require("mongoose");
const pointSchema = require("./PointModel");

const BuoyData = mongoose.Schema(
    {
        stationId: { type: String, required: true },
        GMT: { type: String, required: true },

        coords: {
            type: pointSchema,
            required: true,
        },
        period: { type: String },
        height: { type: String },
        swellDir: { type: String },
        windSpeed: { type: String },
        windGust: { type: String },
        windDir: { type: String },
        airTemp: { type: String },
        waterTemp: { type: String },
        tide: { type: String },
    },
    { timestamps: true }
);
BuoyData.index({ stationId: 1, GMT: 1, strike: 1 });
BuoyData.index({ coords: "2dsphere" });

module.exports = mongoose.model("BuoyData", BuoyData);
