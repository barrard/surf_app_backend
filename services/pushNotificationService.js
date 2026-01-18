const apn = require("apn");
const path = require("path");
const log = require("../utils/logger.js");
const DeviceToken = require("../models/DeviceTokenModel.js");

let apnProvider = null;

// Minimum time between notifications for the same station (in ms)
const NOTIFICATION_COOLDOWN = 60 * 60 * 1000; // 1 hour

function initialize() {
    if (apnProvider) {
        return apnProvider;
    }

    const keyPath = process.env.APNS_P8_PATH || "./config/AuthKey_D96XA5SNM2.p8";

    const options = {
        token: {
            key: path.resolve(keyPath),
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID,
        },
        production: process.env.APNS_PRODUCTION === "true",
    };

    apnProvider = new apn.Provider(options);
    log("APNs provider initialized");

    return apnProvider;
}

async function sendNotification(deviceToken, { title, body, data = {} }) {
    if (!apnProvider) {
        initialize();
    }

    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    notification.badge = 1;
    notification.sound = "default";
    notification.alert = { title, body };
    notification.payload = data;
    notification.topic = process.env.APNS_BUNDLE_ID;

    try {
        const result = await apnProvider.send(notification, deviceToken);

        if (result.failed.length > 0) {
            log({ apnError: result.failed });
            return { success: false, error: result.failed[0].response };
        }

        log({ apnSuccess: result.sent.length });
        return { success: true };
    } catch (error) {
        log({ apnException: error.message });
        return { success: false, error: error.message };
    }
}

async function notifySubscribers(stationId, waveData) {
    if (!apnProvider) {
        initialize();
    }

    // Find the most recent reading
    const timestamps = Object.keys(waveData).sort((a, b) => b - a);
    if (timestamps.length === 0) {
        return { notified: 0 };
    }

    const latestReading = waveData[timestamps[0]];

    // Get period value - check DPD (Dominant Period) or SwP (Swell Period)
    const period = parseFloat(latestReading.DPD) || parseFloat(latestReading.SwP) || 0;

    if (period === 0) {
        log(`No period data for station ${stationId}`);
        return { notified: 0 };
    }

    log(`Station ${stationId} period: ${period}s`);

    // Find devices subscribed to this station with period threshold met
    const devices = await DeviceToken.find({
        subscriptions: {
            $elemMatch: {
                stationId: stationId,
                minPeriod: { $lte: period },
                enabled: true,
            },
        },
    });

    const now = new Date();
    let notifiedCount = 0;

    for (const device of devices) {
        // Check cooldown
        const lastNotified = device.lastNotified.get(stationId);
        if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN) {
            log(`Skipping ${device.deviceToken.slice(0, 8)}... (cooldown)`);
            continue;
        }

        // Find the subscription to get the threshold
        const subscription = device.subscriptions.find(
            (sub) => sub.stationId === stationId && sub.enabled
        );

        const result = await sendNotification(device.deviceToken, {
            title: `Buoy ${stationId} Alert`,
            body: `${period}s period detected! (threshold: ${subscription.minPeriod}s)`,
            data: {
                stationId,
                period,
                timestamp: timestamps[0],
            },
        });

        if (result.success) {
            // Update last notified time
            device.lastNotified.set(stationId, now);
            await device.save();
            notifiedCount++;
        } else if (result.error?.reason === "BadDeviceToken") {
            // Remove invalid device tokens
            log(`Removing invalid device token: ${device.deviceToken.slice(0, 8)}...`);
            await DeviceToken.deleteOne({ _id: device._id });
        }
    }

    log(`Notified ${notifiedCount} devices for station ${stationId}`);
    return { notified: notifiedCount, period };
}

function shutdown() {
    if (apnProvider) {
        apnProvider.shutdown();
        apnProvider = null;
        log("APNs provider shutdown");
    }
}

module.exports = {
    initialize,
    sendNotification,
    notifySubscribers,
    shutdown,
};
