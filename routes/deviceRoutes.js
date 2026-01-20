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
		const { deviceToken, stationId, minPeriod = 20, notificationFrequency = 1 } = req.body

		if (!deviceToken || !stationId) {
			return res.status(400).json({ error: 'deviceToken and stationId are required' })
		}

		let device = await DeviceToken.findOne({ deviceToken })

		if (!device) {
			// Auto-register if not exists
			device = await DeviceToken.create({ deviceToken, subscriptions: [] })
		}

		// Check if already subscribed to this station
		const existingSubscription = device.subscriptions.find(
			(sub) => sub.stationId === stationId
		)

		if (existingSubscription) {
			// Update existing subscription
			existingSubscription.minPeriod = minPeriod
			existingSubscription.notificationFrequency = notificationFrequency
			existingSubscription.enabled = true
		} else {
			// Add new subscription
			device.subscriptions.push({
				stationId,
				minPeriod,
				notificationFrequency,
				enabled: true
			})
		}

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

		// Remove the subscription
		device.subscriptions = device.subscriptions.filter(
			(sub) => sub.stationId !== stationId
		)

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
