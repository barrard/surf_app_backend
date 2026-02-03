const express = require('express')
const router = express.Router()
const log = require('../utils/logger.js')
const DeviceToken = require('../models/DeviceTokenModel.js')
const pushService = require('../services/pushNotificationService.js')

// Register a device token
router.post('/register', async (req, res) => {
	try {
		const { deviceToken } = req.body

		if (!deviceToken) {
			return res.status(400).json({ error: 'deviceToken is required' })
		}

		// Upsert - create if doesn't exist, otherwise just return existing
		let device = await DeviceToken.findOne({ deviceToken })

		if (!device) {
			device = await DeviceToken.create({ deviceToken, subscriptions: [] })
			log(`Registered new device: ${deviceToken.slice(0, 8)}...`)
		}

		res.json({
			success: true,
			device: {
				deviceToken: device.deviceToken,
				subscriptions: device.subscriptions
			}
		})
	} catch (error) {
		log({ registerError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Subscribe to a station
router.post('/subscribe', async (req, res) => {
	try {
		const {
			deviceToken,
			stationId,
			minPeriod,
			minSwellHeight,
			usePeriod = false,
			useSwellHeight = false,
			minWindSpeed, // jake was here
			maxWindSpeed,
			useWindSpeed = false,
			minWindGust,
			maxWindGust,
			useWindGust = false,
			notificationFrequencyHours = 1
		} = req.body

		if (!deviceToken || !stationId) {
			return res.status(400).json({ error: 'deviceToken and stationId are required' })
		}

		let device = await DeviceToken.findOne({ deviceToken })

		if (!device) {
			// Auto-register if not exists
			device = await DeviceToken.create({ deviceToken, subscriptions: [] })
		}

		const subscriptionData = {
			stationId,
			deviceToken,
			minPeriod,
			minSwellHeight,
			usePeriod,
			useSwellHeight,
			minWindSpeed,
			maxWindSpeed,
			useWindSpeed,
			minWindGust,
			maxWindGust,
			useWindGust,
			notificationFrequencyHours,
			enabled: true
		}

		device.subscriptions.push(subscriptionData)

		await device.save()
		log(`Device ${deviceToken.slice(0, 8)}... subscribed to station ${stationId}`)

		res.json({
			success: true,
			subscriptions: device.subscriptions
		})
	} catch (error) {
		log({ subscribeError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Unsubscribe from a station
router.delete('/unsubscribe', async (req, res) => {
	try {
		const { deviceToken, stationId } = req.body

		if (!deviceToken || !stationId) {
			return res.status(400).json({ error: 'deviceToken and stationId are required' })
		}

		const device = await DeviceToken.findOne({ deviceToken })

		if (!device) {
			return res.status(404).json({ error: 'Device not found' })
		}

		const removedSubscriptions = device.subscriptions.filter(
			(sub) => sub.stationId === stationId
		)

		// Remove the subscription(s)
		device.subscriptions = device.subscriptions.filter((sub) => sub.stationId !== stationId)

		if (removedSubscriptions.length && device.lastNotified && typeof device.lastNotified.delete === 'function') {
			// Remove cooldown entries tied to these subscriptions (by ID and by legacy station key)
			for (const sub of removedSubscriptions) {
				if (sub._id) {
					device.lastNotified.delete(sub._id.toString())
				}
			}
			device.lastNotified.delete(stationId)
		}

		await device.save()
		log(`Device ${deviceToken.slice(0, 8)}... unsubscribed from station ${stationId}`)

		res.json({
			success: true,
			subscriptions: device.subscriptions
		})
	} catch (error) {
		log({ unsubscribeError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Get device subscriptions
router.get('/subscriptions/:deviceToken', async (req, res) => {
	try {
		const { deviceToken } = req.params

		const device = await DeviceToken.findOne({ deviceToken })

		if (!device) {
			return res.status(404).json({ error: 'Device not found' })
		}

		res.json({
			success: true,
			subscriptions: device.subscriptions
		})
	} catch (error) {
		log({ getSubscriptionsError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Update a subscription by ID
router.put('/subscription/:subscriptionId', async (req, res) => {
	try {
		const { subscriptionId } = req.params
		const { deviceToken, ...updateData } = req.body

		if (!deviceToken) {
			return res.status(400).json({ error: 'deviceToken is required' })
		}

		// Prevent stationId and deviceToken from being modified
		delete updateData.stationId
		delete updateData.deviceToken

		// Find the device that has this subscription
		const device = await DeviceToken.findOne({ 'subscriptions._id': subscriptionId })

		if (!device) {
			return res.status(404).json({ error: 'Subscription not found' })
		}

		// Find the subscription by ID
		const subscription = device.subscriptions.id(subscriptionId)

		// Verify ownership
		if (subscription.deviceToken !== deviceToken) {
			return res.status(403).json({ error: 'Not authorized to modify this subscription' })
		}

		// Merge existing subscription data with user update
		Object.assign(subscription, updateData)
		await device.save()

		log(`Updated subscription ${subscriptionId} for device ${deviceToken.slice(0, 8)}...`)

		res.json({
			success: true,
			subscription
		})
	} catch (error) {
		log({ updateSubscriptionError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Delete a subscription by ID
router.delete('/subscription/:subscriptionId', async (req, res) => {
	try {
		const { subscriptionId } = req.params
		const { deviceToken } = req.body

		if (!deviceToken) {
			return res.status(400).json({ error: 'deviceToken is required' })
		}

		// Find the device that has this subscription
		const device = await DeviceToken.findOne({ 'subscriptions._id': subscriptionId })

		if (!device) {
			return res.status(404).json({ error: 'Subscription not found' })
		}

		// Find the subscription by ID
		const subscription = device.subscriptions.id(subscriptionId)

		// Verify ownership
		if (subscription.deviceToken !== deviceToken) {
			return res.status(403).json({ error: 'Not authorized to delete this subscription' })
		}

		// Remove the subscription
		device.subscriptions.pull(subscriptionId)

		if (device.lastNotified && typeof device.lastNotified.delete === 'function') {
			device.lastNotified.delete(subscriptionId)
			if (subscription.stationId) {
				device.lastNotified.delete(subscription.stationId)
			}
		}

		await device.save()

		log(`Deleted subscription ${subscriptionId} for device ${deviceToken.slice(0, 8)}...`)

		res.json({
			success: true,
			subscriptions: device.subscriptions
		})
	} catch (error) {
		log({ deleteSubscriptionError: error.message })
		res.status(500).json({ error: error.message })
	}
})

// Test notification endpoint (useful for debugging)
router.post('/test-notification', async (req, res) => {
	try {
		const { deviceToken, title = 'Test', body = 'This is a test notification' } = req.body

		if (!deviceToken) {
			return res.status(400).json({ error: 'deviceToken is required' })
		}

		const result = await pushService.sendNotification(deviceToken, { title, body })

		res.json(result)
	} catch (error) {
		log({ testNotificationError: error.message })
		res.status(500).json({ error: error.message })
	}
})

module.exports = router
