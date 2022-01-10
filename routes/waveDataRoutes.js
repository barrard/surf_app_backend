/* eslint-disable no-undef */
const log = require("../utils/logger.js");
var express = require("express");
var router = express.Router();

const waveDataController = require("../controllers/waveDataController.js");

router.use((req, res, next) => {
    console.log("wave");
    next();
});
/* GET test. */
router.get("/", function (req, res, next) {
    log(req.params);
    res.send("Dave the wave slave");
});

const DATA_CACHE = {};
let devData = null;
/* GET bouy data for given lat lng. */
router.get("/lat/:lat/lng/:lng", async (req, res, next) => {
    // log(req.params)
    const { lat, lng } = req.params;
    addUserHistory(req, res);
    let data;
    if (hasData(lat, lng, DATA_CACHE)) {
        // if(devData){
        data = getData(lat, lng, DATA_CACHE);
        // data = devData
    } else {
        console.log("need to fetch");
        data = await waveDataController.getWaveData(lat, lng);
        //  devData = data
        setData(lat, lng, DATA_CACHE, data);
    }
    //  setTimeout(()=>res.send(data), 4000)
    res.send(data);
});

module.exports = router;

function addUserHistory(req, res) {
    try {
        let { lat, lng } = req.params;
        lat = parseFloat(lat).toFixed(3);
        lng = parseFloat(lng).toFixed(3);
        console.log(req.ip);

        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");

        if (!req.cookies) {
            console.log("this one no cookies");
            return;
        }
        var places = req.cookies.places;

        if (!places) places = JSON.stringify({});

        places = JSON.parse(places);
        console.log(" ---------   Cookies    ---------");
        console.log(req.cookies);
        if (!places[`${lat},${lng}`]) places[`${lat},${lng}`] = 0;
        places[`${lat},${lng}`]++;
        console.log(places);
        res.cookie("places", JSON.stringify(places), {
            maxAge: new Date().getTime() + 1000 * 60 * 60 * 24 * 700,
            httpOnly: true,
            secure: true,
            // sameSite: "None",
        });
    } catch (err) {
        console.log({ err });
    }
}

function hasData(lat, lng, DATA_CACHE) {
    console.log("has data");
    lat = lat.split(".")[0];
    lng = lng.split(".")[0];
    console.log({ lat, lng });
    let data = DATA_CACHE[`${lat}${lng}`];
    return data;
}

function getData(lat, lng, DATA_CACHE) {
    lat = lat.split(".")[0];
    lng = lng.split(".")[0];
    console.log({ lat, lng });
    let data = DATA_CACHE[`${lat}${lng}`];
    return data;
}

function setData(lat, lng, DATA_CACHE, data) {
    lat = lat.split(".")[0];
    lng = lng.split(".")[0];
    console.log({ lat, lng });
    DATA_CACHE[`${lat}${lng}`] = data;
    setTimeout(() => {
        DATA_CACHE[`${lat}${lng}`] = false;
    }, 1000 * 60 * 200); //20 min cache
    return data;
}
