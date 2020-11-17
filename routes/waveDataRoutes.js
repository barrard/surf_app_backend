/* eslint-disable no-undef */
const log = require('../utils/logger.js')
var express = require('express')
var router = express.Router()

const waveDataController = require('../controllers/waveDataController.js')

/* GET test. */
router.get('/', function (req, res, next) {
  log(req.params)
  res.send('Dave the wave slave')
})

/* GET bouy data for given lat lng. */
router.get('/lat/:lat/lng/:lng', async (req, res, next) => {
  // log(req.params)
  const { lat, lng } = req.params
  addUserHistory(req, res)
  const data = await waveDataController.getWaveData(lat, lng)
  res.send(data)
})

module.exports = router



function addUserHistory(req, res){
try {
  let { lat, lng } = req.params
  lat = parseFloat(lat).toFixed(3)
  lng = parseFloat(lng).toFixed(3)
    console.log(req.ip)
    console.log(req.headers)
    console.log(`cookies`)
    console.log(req.cookies)
    if(!req.cookies){
      console.log('this one no cookies')
      next()
    }
    // var userVisits = req.cookies.userVisits;
    var places = req.cookies.places;
    // console.log(req.cookies)
  
    console.log({ places})
    if(!places)places=JSON.stringify({})
    console.log({places})
    places=JSON.parse(places)

    console.log({places})
    if(!places[`${lat},${lng}`])places[`${lat},${lng}`]=0
    places[`${lat},${lng}`]++
    // if(!userVisits)userVisits = 0
    // userVisits++

    // places+=`| lat:${lat}, lng:${lng} | `
    res.cookie('places',JSON.stringify(places), { maxAge: new Date().getTime()+1000*60*60*24*7 , httpOnly: true, secure:true, SameSite:'None' });
    // res.cookie('userVisits',userVisits, { maxAge: new Date().getTime()*100000, httpOnly: true });

    
} catch (err) {
  console.log({err})
}
}
