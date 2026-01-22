const mongoose = require('mongoose')

const subscriptionSchema = new mongoose.Schema({
	stationId: { type: String, required: true },
	deviceToken: { type: String, required: true }, // ownership verification
	minPeriod: { type: Number }, // threshold in seconds
	minSwellHeight: { type: Number }, // threshold in feet
	minWindSpeed: { type: Number }, // threshold in knots
	maxWindSpeed: { type: Number }, // threshold in knots
	minWindGust: { type: Number }, // threshold in knots
	maxWindGust: { type: Number }, // threshold in knots
	usePeriod: { type: Boolean, default: false },
	useSwellHeight: { type: Boolean, default: false },
	useWindSpeed: { type: Boolean, default: false },
	useWindGust: { type: Boolean, default: false },
	notificationFrequencyHours: { type: Number, default: 1 }, // hours between notifications
	enabled: { type: Boolean, default: true }
})

const DeviceTokenSchema = new mongoose.Schema(
	{
		deviceToken: { type: String, required: true, unique: true },
		subscriptions: [subscriptionSchema],
		lastNotified: {
			type: Map,
			of: Date,
			default: {}
		}
	},
	{ timestamps: true }
)

// Index for efficient lookups by station
DeviceTokenSchema.index({ 'subscriptions.stationId': 1 })

module.exports = mongoose.model('DeviceToken', DeviceTokenSchema)
