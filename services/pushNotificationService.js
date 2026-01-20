const apn = require("apn");
const path = require("path");
const log = require("../utils/logger.js");
const DeviceToken = require("../models/DeviceTokenModel.js");

let apnProvider = null;

// Default time between notifications (in ms) - used as fallback
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

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

    // Get swell height - check SwH (Swell Height) or WVHT (Wave Height)
    const swellHeight = parseFloat(latestReading.SwH) || parseFloat(latestReading.WVHT) || 0;

    log(`Station ${stationId} period: ${period}s, swellHeight: ${swellHeight}ft`);

    // Find devices subscribed to this station
    const devices = await DeviceToken.find({
        subscriptions: {
            $elemMatch: {
                stationId: stationId,
                enabled: true,
            },
        },
    });

    const now = new Date();
    let notifiedCount = 0;

    for (const device of devices) {
        // Find the subscription to get the threshold and frequency
        const subscription = device.subscriptions.find(
            (sub) => sub.stationId === stationId && sub.enabled
        );

        // Evaluate alert conditions based on enabled flags
        let conditionsMet = [];
        let conditionsFailed = [];

        // Check period condition if enabled
        if (subscription.usePeriod) {
            if (subscription.minPeriod != null && period > 0) {
                if (period >= subscription.minPeriod) {
                    conditionsMet.push(`period ${period}s >= ${subscription.minPeriod}s`);
                } else {
                    conditionsFailed.push(`period ${period}s < ${subscription.minPeriod}s`);
                }
            }
            // If minPeriod not set but enabled, we skip this check (no threshold to evaluate)
        }

        // Check swell height condition if enabled
        if (subscription.useSwellHeight) {
            if (subscription.minSwellHeight != null && swellHeight > 0) {
                if (swellHeight >= subscription.minSwellHeight) {
                    conditionsMet.push(`swellHeight ${swellHeight}ft >= ${subscription.minSwellHeight}ft`);
                } else {
                    conditionsFailed.push(`swellHeight ${swellHeight}ft < ${subscription.minSwellHeight}ft`);
                }
            }
            // If minSwellHeight not set but enabled, we skip this check (no threshold to evaluate)
        }

        // Skip if no conditions are enabled or if any enabled condition failed
        if (conditionsMet.length === 0 && conditionsFailed.length === 0) {
            continue; // No conditions enabled with values
        }
        if (conditionsFailed.length > 0) {
            continue; // At least one condition not met
        }

        // Calculate cooldown based on subscription frequency (hours to ms)
        const cooldownMs = (subscription.notificationFrequencyHours || 1) * 60 * 60 * 1000;

        // Check cooldown
        const lastNotified = device.lastNotified.get(stationId);
        if (lastNotified && now - lastNotified < cooldownMs) {
            log(`Skipping ${device.deviceToken.slice(0, 8)}... (cooldown: ${subscription.notificationFrequencyHours || 1}h)`);
            continue;
        }

        // Build notification body
        const alertParts = [];
        if (subscription.usePeriod && subscription.minPeriod != null && period > 0) {
            alertParts.push(`${period}s period`);
        }
        if (subscription.useSwellHeight && subscription.minSwellHeight != null && swellHeight > 0) {
            alertParts.push(`${swellHeight}ft swell`);
        }
        const alertBody = alertParts.join(', ') + ' detected!';

        const result = await sendNotification(device.deviceToken, {
            title: `Buoy ${stationId} Alert`,
            body: alertBody,
            data: {
                stationId,
                period,
                swellHeight,
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
    return { notified: notifiedCount, period, swellHeight };
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
