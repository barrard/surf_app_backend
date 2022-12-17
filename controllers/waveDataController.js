/* Import the model and the service */
const waveDataService = require("../services/waveDataService.js");
const BuoyModel = require("../models/BuoyModel.js");

const { HAWAII, PNW, LA, AK, USER_LOC } = require("../utils/locs");

let recentlyFetched = {};

let cacheData = false;
setInterval(() => {
    cacheData = false;
}, 1000 * 60 * 10);

module.exports = {
    getWaveData,
    trackHawaii,
    getHawaiiBuoys,
    getGroupLocations,
    getNearByBuoys,
    getBuoyData,
};

const _1Min = 1000 * 60;
const _5Min = _1Min * 5;
const _20Mins = _1Min * 20;
const _20Min = _1Min * 20;

const MIN_6_Timeout = _1Min * 6;
const MIN_16_Timeout = _1Min * 16;
const ZERO_Timeout = 0; //_1Min * 5;

setInterval(() => {
    recentlyFetched = {};
}, _20Min);
// Calls the method to watch a spot, e.i. hawaii
// trackLA();
setTimeout(() => {
    trackLA();
    setInterval(() => {
        trackLA();
    }, _20Mins);
}, MIN_16_Timeout); //call every 15 mins

setTimeout(() => {
    trackHawaii();
    setInterval(() => {
        trackHawaii();
    }, _20Mins);
}, ZERO_Timeout); //call every 15 mins

//wait 5 minutes and call pnw
setTimeout(() => {
    trackPacificNorthWest();
    setInterval(() => {
        trackPacificNorthWest();
    }, _20Mins);
}, MIN_6_Timeout);

setInterval(() => {
    trackAK();
}, _20Mins);

async function insertBuoyData(data) {
    try {
        const {
            stationId,
            airTemp,
            GMT,
            height,
            period,
            swellDir,
            tide,
            waterTemp,
            windDir,
            windGust,
            windSpeed,
            LAT,
            LON,
        } = data;

        await BuoyModel.findOneAndUpdate(
            {
                stationId,
                GMT,
            },
            {
                stationId,
                GMT,
                airTemp,
                height,
                period,
                swellDir,
                tide,
                waterTemp,
                windDir,
                windGust,
                windSpeed,
                coords: { type: "Point", coordinates: [LON, LAT] },
            },
            { upsert: true }
        );
    } catch (err) {
        console.log(err);
    }
}

async function getBuoyData(stationId) {
    const TIME = 1000 * 60 * 60 * 24 * 2;

    let data = await BuoyModel.find({
        stationId,
        GMT: {
            $gt: new Date(new Date().getTime() - TIME),
        },
    });

    data = cleanBuoyData(data);
    return data;
}
async function findBuoysNear({ lat, lng }) {
    console.time("getBouysByDistance");
    //TIME
    const TIME = 1000 * 60 * 60 * 2;
    //check cache
    if (cacheData) {
        return cacheData;
    }
    let buoys = await BuoyModel.find(
        {
            // coords: {
            //     $near: {
            //         $geometry: { type: "Point", coordinates: [lng, lat] },
            //         $minDistance: 0,
            //         $maxDistance: 2000000,
            //     },
            // },
            // const TIME = //1 hours

            GMT: {
                $gt: new Date(new Date().getTime() - TIME),
            },
        },
        {},
        { lean: true }
    );
    console.timeEnd("getBouysByDistance");
    cacheData = buoys;
    return buoys;
}

async function getGroupLocations(req, res) {
    res.json({ HAWAII, PNW, LA, AK, USER_LOC });
}

async function getNearByBuoys(req, res) {
    const { lat, lng } = req.params;

    const RANGE = USER_LOC.radius;
    let buoys;

    //is hawaii
    const isHAWAII =
        calcCrow({
            lat1: HAWAII.lat,
            lon1: HAWAII.lng,
            lat2: lat,
            lon2: lng,
        }) < RANGE;

    // is PNW
    const isPNW =
        calcCrow({
            lat1: PNW.lat,
            lon1: PNW.lng,
            lat2: lat,
            lon2: lng,
        }) < RANGE;

    // is LA
    const isLA =
        calcCrow({
            lat1: LA.lat,
            lon1: LA.lng,
            lat2: lat,
            lon2: lng,
        }) < RANGE;

    if (isHAWAII) {
        buoys = await getHawaiiBuoys();
    } else if (isPNW) {
        buoys = await getNearPNW();
    } else if (isLA) {
        buoys = await getNearLA();
    }

    console.log({ isHAWAII, isPNW, isLA });

    return res.json(buoys);
}

//This function takes in latitude and longitude of two location and returns the distance between them as the crow flies (in km)
function calcCrow({ lat1, lon1, lat2, lon2 }) {
    var R = 6371; // km
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var lat1 = toRad(lat1);
    var lat2 = toRad(lat2);

    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) *
            Math.sin(dLon / 2) *
            Math.cos(lat1) *
            Math.cos(lat2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

// Converts numeric degrees to radians
function toRad(Value) {
    return (Value * Math.PI) / 180;
}

function cleanBuoyData(buoys) {
    buoys = buoys.reduce((allSpots, spot) => {
        if (!allSpots[spot.stationId]) {
            allSpots[spot.stationId] = [];
        }
        allSpots[spot.stationId].push(spot);
        return allSpots;
    }, {});

    for (let stationId in buoys) {
        buoys[stationId] = buoys[stationId].sort(
            (a, b) => new Date(a.GMT).getTime() - new Date(b.GMT).getTime()
        );
    }

    //Fill in data
    for (let stationId in buoys) {
        const data = buoys[stationId];
        // buoys[stationId] = buoys[stationId].map((spot) => {
        const keys = Object.keys(data[0]);

        keys.forEach((key) => {
            let lastValue = undefined;
            let lastIndex;
            let nullCount = 0;
            data.forEach((reading, readingIndex) => {
                const value = reading[key];
                let _isNan = false;

                //first time through
                if (lastValue === undefined) {
                    lastValue = value;
                    lastIndex = readingIndex;
                }
                //first few times this may happen
                if (value === null && lastValue === null) {
                    nullCount++;
                }
                //this is what we really care about
                else if (value === null) {
                    nullCount++;
                }
                if (value) {
                    if (nullCount && !_isNan) {
                        // console.log("we need to backFill");

                        //started with null, make all last values the only known value
                        if (lastValue === null && lastIndex === 0) {
                            for (let x = 0; x < nullCount; x++) {
                                data[x][key] = value;
                            }
                            // console.log(data);
                        } else {
                            // console.log("We got here!");
                            let diff = value - (lastValue || value);
                            if (isNaN(diff)) {
                                // console.log(value);
                                diff = value || lastValue;
                            }

                            const delta = diff / (nullCount + 1);

                            for (
                                let x = readingIndex - nullCount;
                                x < readingIndex;
                                x++
                            ) {
                                const newValue = isNaN(lastValue + delta)
                                    ? lastValue
                                    : lastValue + delta;
                                data[x][key] = newValue;
                                lastValue = newValue;
                            }
                            // console.log(data);
                        }
                        if (lastValue === NaN) {
                            console.log("got nan");
                        }
                        lastIndex = readingIndex;
                        nullCount = 0;
                    } else if (nullCount) {
                        for (
                            let x = readingIndex - nullCount;
                            x < readingIndex;
                            x++
                        ) {
                            data[x][key] = lastValue;
                            lastValue = value;
                        }
                        nullCount = 0;
                    }

                    lastValue = parseFloat(value);
                    if (isNaN(lastValue)) {
                        _isNan = true;
                        lastValue = value;
                    }
                    lastIndex = readingIndex;
                }
                if (
                    nullCount &&
                    readingIndex === data.length - 1 &&
                    lastValue !== null
                ) {
                    for (
                        let x = readingIndex - nullCount;
                        x <= readingIndex;
                        x++
                    ) {
                        data[x][key] = lastValue;
                    }
                }
            });
        });
        // });
    }
    return buoys;
}

async function getNearLA() {
    console.log("getNearLA");

    let buoys = await findBuoysNear({ lat: LA.lat, lng: LA.lng });

    buoys = cleanBuoyData(buoys);

    return buoys;
}

async function getNearPNW() {
    console.log("getNearPNW");

    let buoys = await findBuoysNear({ lat: PNW.lat, lng: PNW.lng });

    buoys = cleanBuoyData(buoys);

    return buoys;
}

async function getHawaiiBuoys() {
    console.log("getHawaiiBuoys");

    let buoys = await findBuoysNear({ lat: HAWAII.lat, lng: HAWAII.lng });

    buoys = cleanBuoyData(buoys);

    return buoys;
}

function getWaveData(lat, lng) {
    return waveDataService.getWaveData(lat, lng);
}

async function trackAK() {
    console.log("~~~~~~~~~  Tracking  |   AK    |    Buoys  ~~~~~~~~~~~~~~");
    const { lat, lng } = AK;
    data = await waveDataService.getWaveData(lat, lng, 2);
    fetchStationData(data);
}

async function trackLA() {
    console.log(
        "~~~~~~~~~~~~~~    Tracking   |     LA   |     Buoys  ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = LA;
    data = await waveDataService.getWaveData(lat, lng, 2);
    fetchStationData(data);
}

async function trackPacificNorthWest() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     PNW    |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = PNW;
    data = await waveDataService.getWaveData(lat, lng, 2);
    fetchStationData(data);
}

async function trackHawaii() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     HAWAII   |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = HAWAII;
    const data = await waveDataService.getWaveData(lat, lng, 2);
    fetchStationData(data);
}

async function fetchStationData(data) {
    const timePer = 1000;
    //get all station ids
    // console.log(data);
    const stationIds = Object.keys(data.station_id_obj).map(
        (stationId) => stationId
    );

    const cleanedData = cleanData(data);
    // console.log(cleanedData);
    //fetch the stations
    let stationCounter = 0;
    // let count = 0;
    const stationCount = Object.keys(cleanedData).length;
    console.log(
        `Collecting ${stationCount} data in ${
            (stationCount * timePer) / 1000 / 60
        } Minutes`
    );

    await getStationData(stationIds, stationCounter);

    //get this stations data
    async function getStationData(stationIds, stationCounter) {
        const stationId = stationIds[stationCounter];

        const { LAT, LON } = cleanedData[stationId];
        if (recentlyFetched[stationId]) {
            return console.log(`Recently got ${stationId}`);
        } else {
            recentlyFetched[stationId] = true;

            const stationData = await waveDataService.fetchStation(stationId);
            console.log(
                `${stationCounter} Data fetched and inserted for ${stationId}`
            );

            //lets limit this to 10
            let stationDataPoints = 0;
            for (let time in stationData) {
                let data = stationData[time];
                data.GMT = new Date(parseInt(time)).toUTCString();
                data.LAT = LAT;
                data.LON = LON;
                data.id = stationId;
                stationDataPoints++;
                if (stationDataPoints > 10) {
                    break;
                }

                await parseAndInsertData(data);
            }
        }

        stationCounter++;
        if (stationCounter < stationIds.length) {
            setTimeout(async () => {
                await getStationData(stationIds, stationCounter);
            }, timePer);
        }
    }
}

function cleanData(data) {
    //get swell period
    const { station_id_obj, obshder_array } = data;
    const cleanData = {};
    for (let id in station_id_obj) {
        const station = station_id_obj[id];
        if (!cleanData[id]) cleanData[id] = {};
        const cleanStationData = cleanData[id];
        let startingHour;
        let GMT = new Date().toUTCString();
        let [weekday, day, month, year, time, timezone] = GMT.split(" ");
        let [hour, minute, seconds] = time.split(":");
        station.forEach(async (data) => {
            cleanStationData.LAT = data.LAT;
            cleanStationData.LON = data.LON;
            //     await parseAndInsertData(data);
        });
    }
    return cleanData;
}

async function parseAndInsertData(data) {
    const cleanStationData = {};

    let time = getTime(data);

    // if (!cleanStationData[time]) cleanStationData[time] = {};
    cleanStationData.stationId = data.id;
    cleanStationData.LAT = data.LAT;
    cleanStationData.LON = data.LON;
    cleanStationData.GMT = new Date(time).getTime();

    // console.log(station);
    cleanStationData.period = getPeriod(data);
    cleanStationData.height = getWaveHeight(data);
    cleanStationData.swellDir = getSwellDir(data);

    cleanStationData.windSpeed = getWindSpeed(data);
    cleanStationData.windGust = getWindGust(data);
    cleanStationData.windDir = getWindDir(data);

    cleanStationData.airTemp = getAirTemp(data);
    cleanStationData.waterTemp = getWaterTemp(data);
    cleanStationData.tide = getTide(data);

    await insertBuoyData(cleanStationData);
    return cleanStationData;
}

function getTide(data) {
    return getData("TIDE", data);
}
function getAirTemp(data) {
    return getData("ATMP", data);
}
function getWaterTemp(data) {
    return getData("WTMP", data);
}

function getWindDir(data) {
    return getData("WDIR", data);
}

function getWindGust(data) {
    return getData("GST", data);
}

function getWindSpeed(data) {
    return getData("WSPD", data);
}

function getSwellDir(data) {
    return getData("SwD", data) || getData("S1DIR", data);
}

function getWaveHeight(data) {
    return (
        getData("SwH", data) ||
        getData("WVHT", data) ||
        getData("WWH", data) ||
        getData("S1HT", data) ||
        getData("S2HT", data)
    );
}

function getTime(data) {
    const time = data.GMT;

    return `${time}`;
}

function getPeriod(data) {
    return (
        getData("SwP", data) ||
        getData("DPD", data) ||
        getData("APD", data) ||
        getData("S1PD", data) ||
        getData("S2PD", data)
    );
}

function getData(prop, data) {
    const d = data[prop];
    if (!d || d == "-") return;
    return d;
}
