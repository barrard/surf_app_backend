const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
    stationId: { type: String, required: true },
    minPeriod: { type: Number, default: 20 }, // threshold in seconds
    enabled: { type: Boolean, default: true },
});

const DeviceTokenSchema = new mongoose.Schema(
    {
        deviceToken: { type: String, required: true, unique: true },
        subscriptions: [subscriptionSchema],
        lastNotified: {
            type: Map,
            of: Date,
            default: {},
        },
    },
    { timestamps: true }
);

// Index for efficient lookups by station
DeviceTokenSchema.index({ "subscriptions.stationId": 1 });

module.exports = mongoose.model("DeviceToken", DeviceTokenSchema);
