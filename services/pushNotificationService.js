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
// TODO (jake) we may want to change the name waveData to weatherData or something to accomodate wind as well?
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

    // Get wind data - check WSPD/GST or normalized fields if present... TODO: (jake) I don't remember exactly what the data looks like, so we may have to adjust this @barrard
    const windSpeed = parseFloat(latestReading.WSPD) || parseFloat(latestReading.windSpeed) || 0;
    const windGust = parseFloat(latestReading.GST) || parseFloat(latestReading.windGust) || 0;

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
        const stationSubscriptions = device.subscriptions.filter(
            (sub) => sub.stationId === stationId && sub.enabled
        );

        if (!stationSubscriptions.length) {
            continue;
        }

        let deviceModified = false;
        let deviceRemoved = false;

        for (const subscription of stationSubscriptions) {
            // Evaluate alert conditions based on enabled flags
            let conditionsMet = [];
            let conditionsFailed = [];

            // TODO (jake) It would be nice to wring this all out and make it metric agnostic and OOP to keep it DRY and extensible for future data sources, leaving for now
            // (Define each notification metric in a single config/rule table and run one generic evaluator over it so thresholds, alert text, and payload building are all central, then adding new conditions becomes data-only (like river levels and rain! :).)
            const evaluateRange = ({ enabled, value, min, max, label, unit }) => {
                if (!enabled || value == null || value <= 0) {
                    return;
                }
                let hasThreshold = false;
                if (min != null) {
                    hasThreshold = true;
                    if (value >= min) {
                        conditionsMet.push(`${label} ${value}${unit} >= ${min}${unit}`);
                    } else {
                        conditionsFailed.push(`${label} ${value}${unit} < ${min}${unit}`);
                    }
                }
                if (max != null) {
                    hasThreshold = true;
                    if (value <= max) {
                        conditionsMet.push(`${label} ${value}${unit} <= ${max}${unit}`);
                    } else {
                        conditionsFailed.push(`${label} ${value}${unit} > ${max}${unit}`);
                    }
                }
                if (!hasThreshold) {
                    return;
                }
            };

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
            evaluateRange({
                enabled: subscription.useWindSpeed,
                value: windSpeed,
                min: subscription.minWindSpeed,
                max: subscription.maxWindSpeed,
                label: 'windSpeed',
                unit: 'kts',
            });

            evaluateRange({
                enabled: subscription.useWindGust,
                value: windGust,
                min: subscription.minWindGust,
                max: subscription.maxWindGust,
                label: 'windGust',
                unit: 'kts',
            });

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
            const cooldownKey = (subscription._id && subscription._id.toString()) || stationId;
            let lastNotified = null;
            if (device.lastNotified && typeof device.lastNotified.get === 'function') {
                lastNotified =
                    device.lastNotified.get(cooldownKey) ||
                    device.lastNotified.get(stationId);
            }
            if (lastNotified && now - lastNotified < cooldownMs) {
                log(
                    `Skipping ${device.deviceToken.slice(0, 8)}... subscription ${cooldownKey} (cooldown: ${
                        subscription.notificationFrequencyHours || 1
                    }h)`
                );
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
            const hasWindSpeedThreshold =
                subscription.minWindSpeed != null || subscription.maxWindSpeed != null;
            if (subscription.useWindSpeed && hasWindSpeedThreshold && windSpeed > 0) {
                alertParts.push(`${windSpeed}kts wind`);
            }
            const hasWindGustThreshold =
                subscription.minWindGust != null || subscription.maxWindGust != null;
            if (subscription.useWindGust && hasWindGustThreshold && windGust > 0) {
                alertParts.push(`${windGust}kts gust`);
            }
            const alertBody = alertParts.join(', ') + ' detected!';

            const result = await sendNotification(device.deviceToken, {
                title: `Buoy ${stationId} Alert`,
                body: alertBody,
                data: {
                    stationId,
                    subscriptionId: subscription._id?.toString(),
                    period,
                    swellHeight,
                    windSpeed,
                    windGust,
                    timestamp: timestamps[0],
                },
            });

            if (result.success) {
                // Update last notified time for this specific subscription
                if (!device.lastNotified || typeof device.lastNotified.set !== 'function') {
                    const entries = device.lastNotified ? Object.entries(device.lastNotified) : [];
                    device.lastNotified = new Map(entries);
                }
                device.lastNotified.set(cooldownKey, now);
                if (cooldownKey !== stationId && device.lastNotified.has(stationId)) {
                    device.lastNotified.delete(stationId);
                }
                deviceModified = true;
                notifiedCount++;
            } else if (result.error?.reason === "BadDeviceToken") {
                // Remove invalid device tokens
                log(`Removing invalid device token: ${device.deviceToken.slice(0, 8)}...`);
                await DeviceToken.deleteOne({ _id: device._id });
                deviceRemoved = true;
                break;
            }
        }

        if (deviceRemoved) {
            continue;
        }

        if (deviceModified) {
            await device.save();
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
