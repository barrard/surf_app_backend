const mongoose = require("mongoose");
// const pointSchema = require("./PointModel");

const StationModel = mongoose.Schema(
    {
        stationId: { type: String, required: true },
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model("StationModel", StationModel);
