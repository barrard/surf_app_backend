require("../utils/logger.js");

const cheerio = require("cheerio");
let fs = require("fs-extra");
let rp = require("request-promise");
// var xmlParser = require("xml2json");

module.exports = {
  getWaveData
}
function convertGPS(_lat, _lng){
  let lat = parseFloat(_lat)
  let lng = parseFloat(_lng)
logger.log({lat, lng})
if(lat>0) lat=`${lat}N`
else lat=`${lat*-1}S`
if(lng>0) lng=`${lng}E`
else lng=`${lng*-1}W`
return {lat1:lat, lng1:lng}
}
function getWaveData(lat, lng) {
  logger.log('getWaveData')
  let latLng =  convertGPS(lat, lng)
  // const latLng = { lat1: "23.558N", lng1: "153.900W" };
  logger.log(latLng)
  
  get_nearby_stations(latLng)//{lat1:'23.558N' ,  lng1:'153.900W' }
}

/* Get master list */
async function get_nearby_stations({ lat1, lng1 }) {
  logger.log("getting station list");
  let distance = 25
  let url = `https://www.ndbc.noaa.gov/radial_search.php?lat1=${lat1}&lon1=${lng1}&uom=E&dist=${distance}`
  logger.log({url})
  var station_list_html = await rp(url)
  // await fs.writeFile('./station_list.xml', station_list_html)
  // var station_list_html = await fs.readFile("./station_list.xml");

  let $ = cheerio.load(station_list_html);
  // var pre_tags = $('pre')
  // logger.log(pre_tags.length)
  // let ch_pre_tags = cheerio.load(pre_tags)
  let spans = $("span");
  logger.log(spans.length);
  // logger.log(pre_tags)
  let span_id_arr = [];
  spans.map((index, span) => {
    if ($(span).hasClass("obshdr")) {
      logger.log(index);
      span_id_arr.push(index);
      logger.log($(span).attr("class"));
    }
  });
  logger.log({ span_id_arr });
  spans = spans.slice(span_id_arr[0] + 1, span_id_arr[1]);

  spans.map((index, span) => {
    let station_link = $(span.children).attr("href");
    logger.log(station_link);
    if (station_link) {
      fetch_station_data(station_link);
    }
  });
}
// fetch_station_data("/station_page.php?station=51213");
async function fetch_station_data(link) {
  const url = "https://www.ndbc.noaa.gov";
  const station_id = link.split("=")[1];
  let station_page = await rp(`${url}${link}`)
  // await fs.writeFile(`./wave_data/data/station_data${station_id}.html`, station_page)
  // var station_page = await fs.readFile(
  //   `./wave_data/data/station_data${station_id}.html`
  // );
  let $ = cheerio.load(station_page);
  let tables = $("table");
  let captions = $("table caption");
  /* get gps */
  let meta_data = $("b", "#stn_metadata");
  let gps_coords = $(meta_data[2]).text();
  logger.log(gps_coords);

  logger.log(captions.length);
  tables.map((index, table) => {
    let cap = $("caption", table);
    let table_title = $(cap).text();

    if (table_title) {
      // logger.log('got cap')
      logger.log({ table_title });
      if (table_title.includes(`Previous observations`)) {
        // logger.log('get from Detailed Wave Summary table')
        // if(!table_title.includes('Conditions')){
        parse_wave_detail_page($("tr", table), station_id, gps_coords);
        // }
      }
    }
  });
}

async function parse_wave_detail_page(table_rows, station_id, gps_coords) {
  let $ = cheerio.load(table_rows);

  logger.log(table_rows.length);

  let columns = $(table_rows[1]).children();
  logger.log(columns.length);

  if (columns.length == 18) {
    parse_observations({ table_rows, station_id, gps_coords });
  }
  if (columns.length == 12) {
    parse_wave_details({ table_rows, station_id, gps_coords });
  }
}

async function parse_wave_details({ table_rows, station_id, gps_coords }) {
  /* 
    12
    MM, DD, TIME
    WVHTft = wave height
    SwHft	= swell height
    SwPsec	= swell eriod
    SwD = swell dirrection
    STEEPNESS = description
    WWH = wind wave height
    WWP = wind wave period
    WWD = wind wave dirrection
    APD = Average Wave Period
    */
  let $ = cheerio.load(table_rows);

  logger.log("parse wave details");
  let headers = table_rows[1];
  let header_obj = {}
  $(headers)
    .children()
    .map((index, header) => {
      let text = $(header).text()
      header_obj[index]=text
    });
  table_rows.map((index, row) => {
    /* parse each col */
    let cols = $(row).children();
    let row_data = {}
    cols.map((index, col) => {
      let symbol = header_obj[index]
      row_data[symbol] = $(col).text()
    });
    logger.log({row_data})

  });
}

async function parse_observations({ table_rows, station_id, gps_coords }) {
  /* 18 
    MM, DD
      TIME, 
      WVHTft = wave height
      DPD = Domo wave period
      MWD = mean wave dir
    */
  let $ = cheerio.load(table_rows);
  let headers = table_rows[1];
  let header_obj = {}
  $(headers)
    .children()
    .map((index, header) => {
      let text = $(header).text()
      header_obj[index]=text
    });
  table_rows.map((index, row) => {
    /* parse each col */
    let cols = $(row).children();
    let row_data = {}
    cols.map((index, col) => {
      let symbol = header_obj[index]
      row_data[symbol] = $(col).text()
    });
    logger.log({row_data})
  });

  logger.log("parse observations");
}
