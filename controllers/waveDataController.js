/* Import the model and the service */
const waveDataService = require('../services/waveDataService.js')
module.exports = {
  getWaveData
}

function getWaveData (lat, lng) {
  return waveDataService.getWaveData(lat, lng)
}
