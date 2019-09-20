/* eslint-disable no-undef */
require('../utils/logger.js')
var express = require('express')
var router = express.Router()

const waveDataController = require('../controllers/waveDataController.js')

/* GET test. */
router.get('/', function (req, res, next) {
  logger.log(req.params)
  res.send('Dave the wave slave')
})

/* GET bouy data for given lat lng. */
router.get('/lat/:lat/lng/:lng', async (req, res, next) => {
  logger.log(req.params)
  const { lat, lng } = req.params
  const data = await waveDataController.getWaveData(lat, lng)
  res.send(data)
})

module.exports = router
