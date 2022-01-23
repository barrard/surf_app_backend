/* Import the model and the service */
const waveDataService = require("../services/waveDataService.js");
const BuoyModel = require("../models/BuoyModel.js");
const lat = "20";
const lng = "-156";
module.exports = {
    getWaveData,
    trackHawaii,
    getNearHawaiiBuoys,
};

trackHawaii();

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

async function getNearHawaiiBuoys(req, res) {
    console.log("getNearHawaiiBuoys");

    let spots = await BuoyModel.find(
        {
            coords: {
                //     $geoNear: {
                $near: {
                    $geometry: { type: "Point", coordinates: [lng, lat] },
                    $minDistance: 0,
                    $maxDistance: 500000000,
                },
            },
            createdAt: { $gt: new Date().getTime() - 1000 * 60 * 60 * 24 },
        },
        {},
        { lean: true }
    );

    spots = spots.reduce((allSpots, spot) => {
        if (!allSpots[spot.stationId]) {
            allSpots[spot.stationId] = [];
        }
        allSpots[spot.stationId].push(spot);
        return allSpots;
    }, {});

    for (let stationId in spots) {
        spots[stationId] = spots[stationId].sort((a, b) => new Date(a.GMT).getTime() - new Date(b.GMT).getTime());
    }

    //Fill in data
    for (let stationId in spots) {
        const data = spots[stationId];
        // spots[stationId] = spots[stationId].map((spot) => {
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
                            const diff = value - (lastValue || value);
                            const delta = diff / (nullCount + 1);

                            for (let x = readingIndex - nullCount; x < readingIndex; x++) {
                                const newValue = lastValue + delta;
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
                        for (let x = readingIndex - nullCount; x < readingIndex; x++) {
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
                if (nullCount && readingIndex === data.length - 1 && lastValue !== null) {
                    for (let x = readingIndex - nullCount; x <= readingIndex; x++) {
                        data[x][key] = lastValue;
                    }
                }
            });
        });
        // });
    }

    // console.log({ spots });
    res.json({ spots });
}

function getWaveData(lat, lng) {
    return waveDataService.getWaveData(lat, lng);
}

async function trackHawaii() {
    data = await waveDataService.getWaveData(lat, lng, 2);

    const cleanedData = cleanData(data);

    setInterval(async () => {
        data = await waveDataService.getWaveData(lat, lng, 2);

        const cleanedData = cleanData(data);
    }, 1000 * 60 * 15);
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
            let time = getTime(data);

            time = time.split("");

            let mins = time.splice(-2);
            mins = mins.join("");
            let hrs = time.join("");
            let hrsInt = parseInt(hrs);
            if (!hrsInt) {
                hrsInt = 0;
            }

            if (!startingHour) startingHour = hrsInt;
            if (hrsInt > startingHour) {
                startingHour = hrsInt;
                day = parseInt(day) - 1;
            }

            if (hrs.length === 0) hrs = `0${0}`;
            if (hrs.length === 1) hrs = `0${hrs}`;
            if (mins.length === 1) mins = `0${mins}`;
            time = `${hrs}:${mins}:${"00"}`;

            GMT = `${weekday} ${day} ${month} ${year} ${time} ${timezone}`;
            time = new Date(GMT).getTime();
            if (!cleanStationData[time]) cleanStationData[time] = {};
            cleanStationData[time].stationId = id;
            cleanStationData[time].LAT = data.LAT;
            cleanStationData[time].LON = data.LON;
            cleanStationData[time].GMT = GMT;

            // console.log(station);
            cleanStationData[time].period = getPeriod(data);
            cleanStationData[time].height = getWaveHeight(data);
            cleanStationData[time].swellDir = getSwellDir(data);

            cleanStationData[time].windSpeed = getWindSpeed(data);
            cleanStationData[time].windGust = getWindGust(data);
            cleanStationData[time].windDir = getWindDir(data);

            cleanStationData[time].airTemp = getAirTemp(data);
            cleanStationData[time].waterTemp = getWaterTemp(data);
            cleanStationData[time].tide = getTide(data);

            await insertBuoyData(cleanStationData[time]);
        });
    }
    return cleanData;
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
    const time = data.TIME;

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
