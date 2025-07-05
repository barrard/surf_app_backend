/* Import the model and the service */
const waveDataService = require("../services/waveDataService.js");
const BuoyModel = require("../models/BuoyModel.js");
const StationModel = require("../models/StationModel.js");

const { HAWAII, PNW, LA, AK, USER_LOC, FL, MA } = require("../utils/locs");

let recentlyFetched = {};
let b = {};
let fl_station = {};
let ma_station = {};
let hawaii_station = {};
let ak_station = {};
let pnw_station = {};
let la_station = {};

// let cacheData = false;
// setTimeout(async () => {
//     console.log("Get initial b data");
//     const _b = await findBuoysNear();
//     b = cleanBuoyData(_b);
// }, 1000 * 60);

// setInterval(async () => {
//     console.log("Get interval b data");

//     const _b = await findBuoysNear();
//     b = cleanBuoyData(_b);
//     cacheData = false;
// }, 1000 * 60 * 10);

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
const _20Min = _1Min * 20;

const MIN_6_Timeout = _1Min * 6;
const MIN_16_Timeout = _1Min * 16;
const ZERO_Timeout = 0; //_1Min * 5;

setInterval(() => {
    recentlyFetched = {};
}, _20Min * 2);
// Calls the method to watch a spot, e.i. hawaii

//FL : 22 min
//MA : 18 min
//PNW : 10min
//AK : 7 min
//LA : 6 min
// HI : 1 min

setTimeout(() => {
    trackLA();
    setInterval(() => {
        trackLA();
    }, _20Min * 2);
}, _20Min * 2); //call every 15 mins

setTimeout(() => {
    trackFlorida();

    // trackHawaii();
    setInterval(() => {
        // trackAK();
        trackFlorida();
    }, _20Min + _5Min * 2);

    setInterval(() => {
        trackMassachusetts();
    }, _20Min * 2);
}, ZERO_Timeout); //call every 15 mins

//wait 5 minutes and call pnw
setTimeout(() => {
    trackPacificNorthWest();
    setInterval(() => {
        trackPacificNorthWest();
    }, _20Min + _5Min);
    setInterval(() => {
        trackAK();
    }, _20Min);
}, _20Min + _5Min);

setInterval(() => {
    trackHawaii();
}, MIN_16_Timeout);

async function insertBuoyData(data) {
    try {
        const {
            salinity,
            visibility,
            pressure,
            pressureTendency,
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

        const newBuoyData = await BuoyModel.findOneAndUpdate(
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
                salinity,
                visibility,
                pressure,
                pressureTendency,
                coords: { type: "Point", coordinates: [LON, LAT] },
            },
            { upsert: true, new: true, lean: true }
        );
        return newBuoyData;
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

//Depreciated
async function findBuoysNear(args = {}) {
    const { lat, lng } = args;
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

function addUserHistory(req, res) {
    try {
        let { lat, lng } = req.params;
        lat = parseFloat(lat).toFixed(3);
        lng = parseFloat(lng).toFixed(3);
        console.log(req.ip);

        res.header(
            "Access-Control-Allow-Headers",
            "Origin, X-Requested-With, Content-Type, Accept"
        );

        // if (!req.cookies) {
        //     console.log("this one no cookies");
        //     return;
        // } else {
        //     console.log("this one no cookies");
        //     return;
        // }
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

async function getNearByBuoys(req, res) {
    // addUserHistory(req, res);
    // const { lat, lng } = req.params;

    // const RANGE = USER_LOC.radius;
    // let buoys;

    // //is hawaii
    // const isHAWAII =
    //     calcCrow({
    //         lat1: HAWAII.lat,
    //         lon1: HAWAII.lng,
    //         lat2: lat,
    //         lon2: lng,
    //     }) < RANGE;

    // // is PNW
    // const isPNW =
    //     calcCrow({
    //         lat1: PNW.lat,
    //         lon1: PNW.lng,
    //         lat2: lat,
    //         lon2: lng,
    //     }) < RANGE;

    // // is LA
    // const isLA =
    //     calcCrow({
    //         lat1: LA.lat,
    //         lon1: LA.lng,
    //         lat2: lat,
    //         lon2: lng,
    //     }) < RANGE;

    // if (isHAWAII) {
    //     buoys = await getHawaiiBuoys();
    // } else if (isPNW) {
    //     buoys = await getNearPNW();
    // } else if (isLA) {
    //     buoys = await getNearLA();
    // } else {
    //     buoys = await getNearPNW()();
    // }

    // console.log({ isHAWAII, isPNW, isLA });

    return res.json(cleanBuoyData(b));
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
    if (Array.isArray(buoys)) {
        buoys = buoys.reduce((allSpots, spot) => {
            if (!allSpots[spot.stationId]) {
                allSpots[spot.stationId] = [];
            }
            allSpots[spot.stationId].push(spot);
            return allSpots;
        }, {});
    }

    for (let stationId in buoys) {
        buoys[stationId] = buoys[stationId].sort(
            (a, b) => new Date(a.GMT).getTime() - new Date(b.GMT).getTime()
        );
    }

    // //Fill in data
    // for (let stationId in buoys) {
    //     const data = buoys[stationId];
    //     // buoys[stationId] = buoys[stationId].map((spot) => {
    //     const keys = Object.keys(data[0]);

    //     keys.forEach((key) => {
    //         let lastValue = undefined;
    //         let lastIndex;
    //         let nullCount = 0;
    //         data.forEach((reading, readingIndex) => {
    //             const value = reading[key];
    //             let _isNan = false;

    //             //first time through
    //             if (lastValue === undefined) {
    //                 lastValue = value;
    //                 lastIndex = readingIndex;
    //             }
    //             //first few times this may happen
    //             if (value === null && lastValue === null) {
    //                 nullCount++;
    //             }
    //             //this is what we really care about
    //             else if (value === null) {
    //                 nullCount++;
    //             }
    //             if (value) {
    //                 if (nullCount && !_isNan) {
    //                     // console.log("we need to backFill");

    //                     //started with null, make all last values the only known value
    //                     if (lastValue === null && lastIndex === 0) {
    //                         for (let x = 0; x < nullCount; x++) {
    //                             data[x][key] = value;
    //                         }
    //                         // console.log(data);
    //                     } else {
    //                         // console.log("We got here!");
    //                         let diff = value - (lastValue || value);
    //                         if (isNaN(diff)) {
    //                             // console.log(value);
    //                             diff = value || lastValue;
    //                         }

    //                         const delta = diff / (nullCount + 1);

    //                         for (
    //                             let x = readingIndex - nullCount;
    //                             x < readingIndex;
    //                             x++
    //                         ) {
    //                             const newValue = isNaN(lastValue + delta)
    //                                 ? lastValue
    //                                 : lastValue + delta;
    //                             data[x][key] = newValue;
    //                             lastValue = newValue;
    //                         }
    //                         // console.log(data);
    //                     }
    //                     if (lastValue === NaN) {
    //                         console.log("got nan");
    //                     }
    //                     lastIndex = readingIndex;
    //                     nullCount = 0;
    //                 } else if (nullCount) {
    //                     for (
    //                         let x = readingIndex - nullCount;
    //                         x < readingIndex;
    //                         x++
    //                     ) {
    //                         data[x][key] = lastValue;
    //                         lastValue = value;
    //                     }
    //                     nullCount = 0;
    //                 }

    //                 lastValue = parseFloat(value);
    //                 if (isNaN(lastValue)) {
    //                     _isNan = true;
    //                     lastValue = value;
    //                 }
    //                 lastIndex = readingIndex;
    //             }
    //             if (
    //                 nullCount &&
    //                 readingIndex === data.length - 1 &&
    //                 lastValue !== null
    //             ) {
    //                 for (
    //                     let x = readingIndex - nullCount;
    //                     x <= readingIndex;
    //                     x++
    //                 ) {
    //                     data[x][key] = lastValue;
    //                 }
    //             }
    //         });
    //     });
    //     // });
    // }
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
    updateStationTracker(ak_station, data, 10);
    fetchStationData(data);
}

async function trackLA() {
    console.log(
        "~~~~~~~~~~~~~~    Tracking   |     LA   |     Buoys  ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = LA;
    data = await waveDataService.getWaveData(lat, lng, 2);
    updateStationTracker(la_station, data, 10);
    fetchStationData(data);
}

async function trackPacificNorthWest() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     PNW    |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = PNW;
    data = await waveDataService.getWaveData(lat, lng, 2);
    updateStationTracker(pnw_station, data, 10);
    fetchStationData(data);
}

async function trackFlorida() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     FLORIDA   |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = FL;
    const data = await waveDataService.getWaveData(lat, lng, 2);
    updateStationTracker(fl_station, data, 10);

    fetchStationData(data);
}
async function trackMassachusetts() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     Massachusetts   |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = MA;
    const data = await waveDataService.getWaveData(lat, lng, 2);
    updateStationTracker(ma_station, data, 10);

    fetchStationData(data);
}
async function trackHawaii() {
    console.log(
        "~~~~~~~~~~~~~~   Tracking   |     HAWAII   |     Buoys   ~~~~~~~~~~~~~~"
    );
    const { lat, lng } = HAWAII;
    const data = await waveDataService.getWaveData(lat, lng, 2);
    updateStationTracker(hawaii_station, data, 10);

    fetchStationData(data);
}

function updateStationTracker(stationTracker, data, maxAge = 10) {
    const stationIds = Object.keys(data.station_id_obj);
    const prevStations = { ...stationTracker };
    stationIds.forEach((stationId) => {
        if (!stationTracker[stationId]) {
            // New station
            stationTracker[stationId] = 0;
        }
        if (prevStations[stationId]) {
            delete prevStations[stationId];
        }
    });
    if (Object.keys(prevStations).length) {
        Object.keys(prevStations).forEach((stationId) => {
            stationTracker[stationId]++;
            if (stationTracker[stationId] > maxAge) {
                delete stationTracker[stationId];
                delete b[stationId];
            }
        });
    }
}

async function fetchStationData(data) {
    const timePer = 3000;
    //get all station ids
    // console.log(data);
    const stationIds = Object.keys(data.station_id_obj).map(
        (stationId) => stationId
    );

    const cleanedData = await cleanData(data);
    // console.log(cleanedData);
    //fetch the stations
    let stationCounter = 0;
    // let count = 0;
    const stationCount = Object.keys(cleanedData).length;
    console.log(
        `Collecting ${stationCount} buoys in ${
            (stationCount * timePer) / 1000 / 60
        } Minutes`
    );
    try {
        await getStationData(stationIds, stationCounter);
        console.log("Done Buoys");
    } catch (err) {
        console.log(err);
    }

    function addToCache(data) {
        if (Array.isArray(data)) {
            // throw new Error("Data is an array is depreciated, try again");
            b[data[0].stationId] = data;
        }
        // if (!b[data.stationId]) {
        //     b[data.stationId] = [];
        // }
        // if (!b[data.stationId].length) {
        //     b[data.stationId].push(data);
        // } else {
        //     const current = b[data.stationId].slice(-1)[0];
        //     if (
        //         new Date(current.GMT).getTime() >= new Date(data.GMT).getTime()
        //     ) {
        //         return;
        //     }
        //     b[data.stationId].push({ ...data, ...current, GMT: data.GMT });
        //     b[data.stationId] = b[data.stationId].slice(-10);
        // }
    }

    //get this stations data
    async function getStationData(stationIds, stationCounter) {
        const stationId = stationIds[stationCounter];

        try {
            const { LAT, LON } = cleanedData[stationId];
            if (recentlyFetched[stationId]) {
                console.log(`Recently got ${stationId}`);
            } else {
                recentlyFetched[stationId] = true;

                const stationData = await waveDataService.fetchStation(
                    stationId
                );
                console.log(
                    `${stationCounter} Data fetched and inserted for ${stationId}`
                );

                console.time("got-buoys-" + stationId);
                //lets limit this to 10
                // let prevData = {};
                let stationDataPoints = 0;
                const sortedTimes = Object.keys(stationData).sort(
                    (a, b) => a - b
                );
                const allSavedData = [];
                await Promise.all(
                    sortedTimes.map(async (time, index) => {
                        // sortedTimes.slice(-60).forEach(async (time, index) => {
                        // for (let time in ) {
                        let data = stationData[time];
                        data.GMT = new Date(parseInt(time)).toUTCString();
                        data.LAT = LAT;
                        data.LON = LON;
                        data.id = stationId;

                        const cleanBuoyData = await parseAndInsertData(data);
                        allSavedData.push(cleanBuoyData);
                    })
                );
                const newSortedSlicedData = allSavedData
                    .sort(
                        (a, b) =>
                            new Date(a.GMT).getTime() -
                            new Date(b.GMT).getTime()
                    )
                    .slice(-10);
                const mergedData = newSortedSlicedData.map((data, index) => {
                    if (index === 0) {
                        return data;
                    }
                    let prev = newSortedSlicedData[index - 1];
                    // Start with previous data
                    let merged = { ...prev };
                    // Only overwrite with defined values from current data
                    Object.keys(data).forEach((key) => {
                        if (data[key] !== undefined && data[key] !== null) {
                            merged[key] = data[key];
                        }
                    });
                    // Always set GMT to current data's GMT
                    merged.GMT = data.GMT;
                    merged.coords = {
                        coordinates: [LON, LAT],
                    };
                    return merged;
                });
                addToCache(mergedData);

                // }
                console.timeEnd("got-buoys-" + stationId);
            }

            stationCounter++;
            if (stationCounter < stationIds.length) {
                console.log("starting timer for next");
                setTimeout(async () => {
                    await getStationData(stationIds, stationCounter);
                }, timePer);
            }
        } catch (err) {
            console.log(err);
        }
    }
}

async function cleanData(data) {
    //get swell period
    const { station_id_obj, obshder_array } = data;
    const cleanData = {};
    for (let id in station_id_obj) {
        const station = station_id_obj[id];
        if (!cleanData[id]) {
            cleanData[id] = {};
        }

        //check if station is in database
        const stationModel = await StationModel.findOne({ stationId: id });

        //if not, then make one
        if (!stationModel) {
            const { LAT, LON } = station[0];
            const newStation = new StationModel({
                stationId: id,
                lat: LAT,
                lng: LON,
            });
            await newStation.save();
        }

        const cleanStationData = cleanData[id];
        // let startingHour;
        // let GMT = new Date().toUTCString();
        // let [weekday, day, month, year, time, timezone] = GMT.split(" ");
        // let [hour, minute, seconds] = time.split(":");
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

    try {
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
        cleanStationData.pressure = getPressure(data);
        cleanStationData.pressureTendency = getPressureTendency(data);
        cleanStationData.salinity = getSalinity(data);
        cleanStationData.visibility = getVisibility(data);

        const saveCleanStationData = await insertBuoyData(cleanStationData);
        return saveCleanStationData;
    } catch (err) {
        console.error(err);
    }
}

function getPressure(data) {
    const pres = getData("PRES", data);

    return pres;
}
function getPressureTendency(data) {
    return getData("PTDY", data);
}
function getSalinity(data) {
    const sal = getData("SAL", data);

    return sal;
}
function getVisibility(data) {
    const vis = getData("VIS", data);

    return vis;
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
