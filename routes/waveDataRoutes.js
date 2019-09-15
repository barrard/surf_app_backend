var express = require('express');
var router = express.Router();

const waveDataController = require('../controllers/waveDataController.js')

/* GET test. */
router.get('/', function(req, res, next) {
  logger.log(req.params)
  res.send('Dave the wave slave');
});

/* GET bouy data for given lat lng. */
router.get('/lat/:lat/lng/:lng', function(req, res, next) {
  logger.log(req.params)
  let {lat, lng} = req.params
  waveDataController.getWaveData(lat, lng)
  res.send('Dave the wave slave');
});

module.exports = router;
