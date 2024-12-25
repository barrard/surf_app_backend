const log = require("../utils/logger.js");

const cheerio = require("cheerio");
const fs = require("fs-extra");
const rp = require("request-promise");
// var xmlParser = require("xml2json");

module.exports = {
    getWaveData,
    fetchStation,
};
function convertGPS(_lat, _lng) {
    let lat = parseFloat(_lat);
    let lng = parseFloat(_lng);
    // log({ lat, lng })
    if (lat > 0) lat = `${lat}N`;
    else lat = `${lat * -1}S`;
    if (lng > 0) lng = `${lng}E`;
    else lng = `${lng * -1}W`;
    return { lat1: lat, lng1: lng };
}
function getWaveData(lat, lng, time) {
    // log('getWaveData')
    const latLng = convertGPS(lat, lng);

    return get_nearby_stations(latLng, time); // {lat1:'23.558N' ,  lng1:'153.900W' }
}

async function fetchStation(stationId) {
    const url = `https://www.ndbc.noaa.gov/station_page.php?station=${stationId}&uom=E&tz=GMT`;

    const station_list_data = await rp(url);

    const $ = cheerio.load(station_list_data);

    const weatherData = $("#wxdata").children();
    const waveData = $("#wavedata").children();

    let currentConditions = {};

    let swellSummary = {};
    const dataArray = [];

    getRowDataFromTable(weatherData);
    getRowDataFromTable(waveData);

    function getRowDataFromTable(table) {
        let tableCount = 0;
        Array.from(table).forEach((child) => {
            // console.log(child.name);
            //this will get the most current conditions
            let isTable = child.name === "table";
            if (isTable) {
                tableCount++;
            }
            // console.log({ tableCount });
            if (isTable && tableCount === 1) {
                firstDataTable = true;
                //get the data from the first table
                const children = $(child).children();

                currentConditions = getCurrentConditions(children);

                dataArray.push(currentConditions);
            }
            if (child.name === "div") {
                const className = $(child).attr("class");
                if (className === "dataTable-wrapper") {
                    const rows = $("tr", "table", child);

                    const keys = [];

                    Array.from(rows).forEach((row, i) => {
                        let currentData = null;
                        //this is the legend
                        //get legend
                        if (i === 0) {
                            let th = $("th", row);

                            Array.from(th).forEach((header) => {
                                let key;
                                const html = $(header).html();

                                if (html.includes("<br>")) {
                                    key = html.split("<br>");
                                    if (key.length === 3) {
                                        key = key[1];
                                    } else if (key.length === 2) {
                                        key = key[0];
                                    }
                                } else {
                                    throw new Error("Fix dis bug");
                                }

                                keys.push(key);
                            });
                        } else {
                            currentData = {};
                            //this is the actual data
                            let td = $("td", row);
                            let th = $("th", row);
                            let datetime = $(th).text();
                            let [date, time] = datetime.split(" ");
                            let [year, month, day] = date.split("-");
                            let hour = time.slice(0, 2);
                            let min = time.slice(-2);
                            currentData["year"] = year;
                            currentData["MM"] = month;
                            currentData["DD"] = day;
                            currentData["Hour"] = hour;
                            currentData["Min"] = min;
                            Array.from(td).forEach((tData, i) => {
                                let val;
                                const labelName = keys[i + 1];
                                const html = $(tData).text().trim();
                                // console.log(html);
                                if (html === "-") return;

                                val = html;

                                currentData[labelName] = val;
                            });
                        }
                        if (currentData) {
                            dataArray.push(currentData);
                        }
                    });
                }
            }
        });
    }

    // console.log(dataArray);

    const timeDateObj = {};
    dataArray.reverse().forEach((data) => {
        //get the GMT time
        // console.log(data);
        let { Hour, Min, DD, MM, year } = data;
        const GMT_Date = `${DD} ${switchMonth(
            MM
        )} ${year} ${Hour}:${Min}:${"00"} GMT`;
        // console.log(GMT_Date);
        // console.log(new Date(GMT_Date).toLocaleString());
        const time = new Date(GMT_Date).getTime();
        if (!timeDateObj[time]) timeDateObj[time] = {};
        for (let key in data) {
            timeDateObj[time][key] = String(data[key].trim());
        }
    });

    // console.log(timeDateObj);
    return timeDateObj;

    function getCurrentConditions(children) {
        const currentConditions = {};
        let Hour, Min, year, day, month, onDate, time;
        Array.from(children).forEach((child) => {
            //this is the most current meta data
            if (child.name === "caption") {
                //mainly want time and date
                const metaData = $(child).html();
                if (metaData.startsWith("<a href")) {
                    //this is a link we need to ignore on the swell date
                    let [_, __, dateTime] = metaData.split("<br>");
                    let [_time, _onDate] = dateTime.split("GMT");
                    time = _time.trim();

                    onDate = _onDate;
                } else {
                    let [_, caption] = metaData.split("<br>");
                    // console.log(caption);
                    let [_time, _onDate] = caption.split("GMT");
                    time = _time.trim();
                    onDate = _onDate;
                }
                let [__, date] = onDate.split("on");
                date = date.split(":")[0];

                Hour = time.slice(0, 2);
                Min = time.slice(2);

                currentConditions["Hour"] = Hour;
                currentConditions["Min"] = Min;
                // if (!data) {
                //     console.log("wtf");
                // }

                let [_month, _day, _year] = date.split("/");
                month = _month.trim();
                day = _day.trim();
                year = _year.trim();
                currentConditions["year"] = year;
                currentConditions["MM"] = month;
                currentConditions["DD"] = day;

                // console.log({ Hour, Min, month, day, year });
            }
            //now look for table body?
            else if (child.name === "tbody") {
                const rows = $("tr", child);
                currentConditions["year"] = year;
                Array.from(rows).forEach((row, i) => {
                    //theses rows are the current conditions.  skip the first row, it's a header
                    if (i === 0) {
                        return;
                    } else {
                        const rowData = $("td", row);
                        let labelName, val;
                        Array.from(rowData).forEach((data, i) => {
                            // if (i === 0) {
                            //this is a chart button
                            // return;
                            // } else {
                            //this will be label and data
                            if (i === 0) {
                                //label
                                const text = $(data).text();
                                //parse the label
                                const [_, labelValueDirty] = text.split("(");
                                if (!labelValueDirty) return;
                                const [_labelName] = labelValueDirty.split(")");
                                labelName = _labelName;
                                currentConditions[labelName] = "";
                            } else if (i === 1) {
                                //value
                                const value = $(data).text();
                                const [_val] = value.trim().split(" ");
                                val = _val;
                                if (!labelName) return;

                                currentConditions[labelName] = val;
                            }
                            // }
                        });
                    }
                });
            }
        });
        return currentConditions;
    }
}

/* Get master list */
async function get_nearby_stations({ lat1, lng1 }, time) {
    // log('getting station list')
    time = time || 20;
    const distance = 999;
    const url = `https://www.ndbc.noaa.gov/radial_search.php?lat1=${lat1}&lon1=${lng1}&uom=E&dist=${distance}&time=${time}`;
    log({ url });
    var station_list_html = await rp(url);
    // await fs.writeFile('./station_list.xml', station_list_html)
    // var station_list_html = await fs.readFile('./station_list.xml')

    const $ = cheerio.load(station_list_html);
    const spans = $("span");
    // const obshdr = $('span.obshdr').text()
    // log({ obshdr })

    log(`${spans.length} rows of data for ${lat1} - ${lng1}`);

    const station_id_obj = {};

    spans.map((index, span) => {
        /* Each station has an href and a background color */
        const station_link = $(span).find("a").attr("href");
        const bg_color = $(span).hasClass("data-row");

        if (station_link && bg_color) {
            const station_data = $(span).text();
            const station_id = station_link.split("=")[1];
            // log({ station_data, station_link, station_id })

            const data = parse_current_obs(station_data);
            if (!station_id_obj[station_id]) station_id_obj[station_id] = [];

            station_id_obj[station_id].push(data);

            // fetch_station_data(station_link);
        }
    });
    return { station_id_obj, obshder_array };
}
// fetch_station_data("/station_page.php?station=51213");
async function fetch_station_data(link) {
    // return log({ link })
    const url = "https://www.ndbc.noaa.gov";
    const station_id = link.split("=")[1];
    const station_page = await rp(`${url}${link}`);
    // await fs.writeFile(`./wave_data/data/station_data${station_id}.html`, station_page)
    // var station_page = await fs.readFile(
    //   `./wave_data/data/station_data${station_id}.html`
    // );
    const $ = cheerio.load(station_page);
    const tables = $("table");
    const captions = $("table caption");
    /* get gps */
    const meta_data = $("b", "#stn_metadata");
    const gps_coords = $(meta_data[2]).text();
    log({ gps_coords, station_id });

    log(captions.length);
    tables.map((index, table) => {
        const cap = $("caption", table);
        const table_title = $(cap).text();

        if (table_title) {
            // log('got cap')
            log({ table_title });
            if (table_title.includes("Previous observations")) {
                // log('get from Detailed Wave Summary table')
                // if(!table_title.includes('Conditions')){
                parse_wave_detail_page($("tr", table), station_id, gps_coords);
                // }
            }
        }
    });
}

async function parse_wave_detail_page(table_rows, station_id, gps_coords) {
    const $ = cheerio.load(table_rows);

    log(table_rows.length);

    const columns = $(table_rows[1]).children();
    log(columns.length);

    if (columns.length === 18) {
        // parse_observations({ table_rows, station_id, gps_coords });
    }
    if (columns.length === 12) {
        parse_wave_details({ table_rows, station_id, gps_coords });
    }
}

// async function parse_wave_details({ table_rows, station_id, gps_coords }) {
//     /*
//     12
//     MM, DD, TIME
//     WVHTft = wave height
//     SwHft = swell height
//     SwPsec = swell eriod
//     SwD = swell dirrection
//     STEEPNESS = description
//     WWH = wind wave height
//     WWP = wind wave period
//     WWD = wind wave dirrection
//     APD = Average Wave Period
//     */
//     const $ = cheerio.load(table_rows);

//     log("parse wave details");
//     const headers = table_rows[1];
//     const header_obj = {};
//     $(headers)
//         .children()
//         .map((index, header) => {
//             const text = $(header).text();
//             header_obj[index] = text;
//         });
//     table_rows.map((index, row) => {
//         /* parse each col */
//         const cols = $(row).children();
//         const row_data = {};
//         cols.map((index, col) => {
//             const symbol = header_obj[index];
//             row_data[symbol] = $(col).text();
//         });
//         log({ row_data });
//     });
// }

async function parse_observations({ table_rows, station_id, gps_coords }) {
    /* 18
    MM, DD
      TIME,
      WVHTft = wave height
      DPD = Domo wave period
      MWD = mean wave dir
    */
    const $ = cheerio.load(table_rows);
    const headers = table_rows[1];
    const header_obj = {};
    $(headers)
        .children()
        .map((index, header) => {
            const text = $(header).text();
            header_obj[index] = text;
        });
    table_rows.map((index, row) => {
        /* parse each col */
        const cols = $(row).children();
        const row_data = {};
        cols.map((index, col) => {
            const symbol = header_obj[index];
            row_data[symbol] = $(col).text();
        });
        // log({ row_data });
    });

    // log("parse observations");
}

function parse_current_obs(obs_text) {
    const array_data = obs_text.split(" ").filter((i) => i !== "");
    const data_obj = {};
    array_data.forEach((data, index) => {
        const name = obshder_array[index].name;
        // log({ data, index, name })
        data_obj[obshder_array[index].name] = isNaN(data)
            ? data
            : parseFloat(data);
    });
    return data_obj;
}

const obshder_array = [
    { name: "ID", unit: "", fullName: "Station Id" },
    { name: "T1", unit: "", fullName: "Type" }, // B = Buoy, C = C-MAN Station, D = Drifting Buoy, S = Ship, O = Other
    { name: "TIME", unit: "GMT", fullName: "GMT Time" },
    { name: "LAT", unit: "", fullName: "Latitude" },
    { name: "LON", unit: "", fullName: "Longitude" },
    { name: "DIST", unit: "nm", fullName: "Distance to BuOy" },
    { name: "HDG", unit: "°T", fullName: "Direction to BuOy" },
    { name: "WDIR", unit: "°T", fullName: "Wind Direction" },
    { name: "WSPD", unit: "kts", fullName: "Wind Speed" },
    { name: "GST", unit: "kts", fullName: "Wind Gust" },
    { name: "WVHT", unit: "ft", fullName: "Wave Height" },
    { name: "DPD", unit: "sec", fullName: "Wave Period" },
    { name: "APD", unit: "sec", fullName: "Avg. Wave Period" },
    { name: "MWD", unit: "°T", fullName: "Wave Direction" },
    { name: "PRES", unit: "in", fullName: "Pressure" },
    { name: "PTDY", unit: "in", fullName: "Pressure Tendency" },
    { name: "ATMP", unit: "°F", fullName: "Air Temperature" },
    { name: "WTMP", unit: "°F", fullName: "Water Temperature" },
    { name: "DEWP", unit: "°F", fullName: "Dew Temperature" },
    { name: "VIS", unit: "nm", fullName: "Visibility" },
    { name: "TCC", unit: "1/8", fullName: "Total Cloud Cover" },
    { name: "TIDE", unit: "ft", fullName: "Tide" },
    { name: "S1HT", unit: "ft", fullName: "Primary Swell Height" },
    { name: "S1PD", unit: "sec", fullName: "Primary Swell Period" },
    { name: "S1DIR", unit: "°T", fullName: "Primary Swell Direction" },
    { name: "S2HT", unit: "ft", fullName: "Secondary Swell Height" },
    { name: "S2PD", unit: "sec", fullName: "Secondary Swell Period" },
    { name: "S2DIR", unit: "°T", fullName: "Secondary Swell Direction" },
    { name: "Ice", unit: "Acc", fullName: "Ice Accumulation" },
    { name: "Sea", unit: "Acc", fullName: "Sea Ice" },
    { name: "SwH", unit: "ft", fullName: "Swell Height" },
    { name: "SwP", unit: "sec", fullName: "Swell Period" },
    { name: "SwD", unit: "", fullName: "Swell Direction" },
    { name: "WWH", unit: "ft", fullName: "Wind Wave Height" },
    { name: "WWP", unit: "sec", fullName: "Wind Wave PEriod" },
    { name: "WWD", unit: "", fullName: "Wind Wave Direction" },
    { name: "STEEPNESS", unit: "", fullName: "Wave Type" },
];

function switchMonth(month) {
    switch (month) {
        case "01":
            return "Jan";
        case "02":
            return "Feb";
        case "03":
            return "Mar";
        case "04":
            return "Apr";
        case "05":
            return "May";
        case "06":
            return "Jun";
        case "07":
            return "Jul";
        case "08":
            return "Aug";
        case "09":
            return "Sep";
        case "10":
            return "Oct";
        case "11":
            return "Nov";
        case "12":
            return "Dec";

        default:
            break;
    }
}
