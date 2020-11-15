
const log = require('../utils/logger.js')

const cheerio = require('cheerio')
const fs = require('fs-extra')
const rp = require('request-promise')
// var xmlParser = require("xml2json");

module.exports = {
  getWaveData
}
function convertGPS (_lat, _lng) {
  let lat = parseFloat(_lat)
  let lng = parseFloat(_lng)
  // log({ lat, lng })
  if (lat > 0) lat = `${lat}N`
  else lat = `${lat * -1}S`
  if (lng > 0) lng = `${lng}E`
  else lng = `${lng * -1}W`
  return { lat1: lat, lng1: lng }
}
function getWaveData (lat, lng) {
  // log('getWaveData')
  const latLng = convertGPS(lat, lng)
  // const latLng = { lat1: "23.558N", lng1: "153.900W" };
  log(latLng)

  return get_nearby_stations(latLng) // {lat1:'23.558N' ,  lng1:'153.900W' }
}

/* Get master list */
async function get_nearby_stations ({ lat1, lng1 }) {
  log('getting station list')
  const distance = 450
  const url = `https://www.ndbc.noaa.gov/radial_search.php?lat1=${lat1}&lon1=${lng1}&uom=E&dist=${distance}&time=20`
  log({ url })
  var station_list_html = await rp(url)
  // await fs.writeFile('./station_list.xml', station_list_html)
  // var station_list_html = await fs.readFile('./station_list.xml')

  const $ = cheerio.load(station_list_html)
  // var pre_tags = $('pre')
  // log(pre_tags.length)
  // let ch_pre_tags = cheerio.load(pre_tags)
  const spans = $('span')
  // const obshdr = $('span.obshdr').text()
  // log({ obshdr })

  log(spans.length)
  // log(pre_tags)
  const station_id_obj = {}

  spans.map((index, span) => {
    /* Each station has an href and a background color */
    const station_link = $(span.children).attr('href')
    const station_data = $(span).text()
    const bg_color = $(span).css('background-color')

    if (station_link && bg_color) {
      const station_id = station_link.split('=')[1]
      // log({ station_data, station_link, station_id })

      const data = parse_current_obs(station_data)
      if (!station_id_obj[station_id]) station_id_obj[station_id] = []

      station_id_obj[station_id].push(data)

      // fetch_station_data(station_link);
    }
  })
  return ({ station_id_obj, obshder_array })
}
// fetch_station_data("/station_page.php?station=51213");
async function fetch_station_data (link) {
  // return log({ link })
  const url = 'https://www.ndbc.noaa.gov'
  const station_id = link.split('=')[1]
  const station_page = await rp(`${url}${link}`)
  // await fs.writeFile(`./wave_data/data/station_data${station_id}.html`, station_page)
  // var station_page = await fs.readFile(
  //   `./wave_data/data/station_data${station_id}.html`
  // );
  const $ = cheerio.load(station_page)
  const tables = $('table')
  const captions = $('table caption')
  /* get gps */
  const meta_data = $('b', '#stn_metadata')
  const gps_coords = $(meta_data[2]).text()
  log({ gps_coords, station_id })

  log(captions.length)
  tables.map((index, table) => {
    const cap = $('caption', table)
    const table_title = $(cap).text()

    if (table_title) {
      // log('got cap')
      log({ table_title })
      if (table_title.includes('Previous observations')) {
        // log('get from Detailed Wave Summary table')
        // if(!table_title.includes('Conditions')){
        parse_wave_detail_page($('tr', table), station_id, gps_coords)
        // }
      }
    }
  })
}

async function parse_wave_detail_page (table_rows, station_id, gps_coords) {
  const $ = cheerio.load(table_rows)

  log(table_rows.length)

  const columns = $(table_rows[1]).children()
  log(columns.length)

  if (columns.length === 18) {
    // parse_observations({ table_rows, station_id, gps_coords });
  }
  if (columns.length === 12) {
    parse_wave_details({ table_rows, station_id, gps_coords })
  }
}

async function parse_wave_details ({ table_rows, station_id, gps_coords }) {
  /*
    12
    MM, DD, TIME
    WVHTft = wave height
    SwHft = swell height
    SwPsec = swell eriod
    SwD = swell dirrection
    STEEPNESS = description
    WWH = wind wave height
    WWP = wind wave period
    WWD = wind wave dirrection
    APD = Average Wave Period
    */
  const $ = cheerio.load(table_rows)

  log('parse wave details')
  const headers = table_rows[1]
  const header_obj = {}
  $(headers)
    .children()
    .map((index, header) => {
      const text = $(header).text()
      header_obj[index] = text
    })
  table_rows.map((index, row) => {
    /* parse each col */
    const cols = $(row).children()
    const row_data = {}
    cols.map((index, col) => {
      const symbol = header_obj[index]
      row_data[symbol] = $(col).text()
    })
    log({ row_data })
  })
}

async function parse_observations ({ table_rows, station_id, gps_coords }) {
  /* 18
    MM, DD
      TIME,
      WVHTft = wave height
      DPD = Domo wave period
      MWD = mean wave dir
    */
  const $ = cheerio.load(table_rows)
  const headers = table_rows[1]
  const header_obj = {}
  $(headers)
    .children()
    .map((index, header) => {
      const text = $(header).text()
      header_obj[index] = text
    })
  table_rows.map((index, row) => {
    /* parse each col */
    const cols = $(row).children()
    const row_data = {}
    cols.map((index, col) => {
      const symbol = header_obj[index]
      row_data[symbol] = $(col).text()
    })
    // log({ row_data });
  })

  // log("parse observations");
}

function parse_current_obs (obs_text) {
  const array_data = obs_text.split(' ').filter(i => (i !== ''))
  const data_obj = {}
  array_data.forEach((data, index) => {
    const name = obshder_array[index].name
    // log({ data, index, name })
    data_obj[obshder_array[index].name] = isNaN(data) ? data : parseFloat(data)
  })
  return data_obj
}

const obshder_array = [
  { name: 'ID', unit: '', fullName: 'Station Id' },
  { name: 'T1', unit: '', fullName: 'Type' }, // B = Buoy, C = C-MAN Station, D = Drifting Buoy, S = Ship, O = Other
  { name: 'TIME', unit: 'GMT', fullName: 'GMT Time' },
  { name: 'LAT', unit: '', fullName: 'Latitude' },
  { name: 'LON', unit: '', fullName: 'Longitude' },
  { name: 'DIST', unit: 'nm', fullName: 'Distance to Bouy' },
  { name: 'HDG', unit: '°T', fullName: 'Dirrection to Bouy' },
  { name: 'WDIR', unit: '°T', fullName: 'Wind Dirrection' },
  { name: 'WSPD', unit: 'kts', fullName: 'Wind Speed' },
  { name: 'GST', unit: 'kts', fullName: 'Wind Gust' },
  { name: 'WVHT', unit: 'ft', fullName: 'Wave Height' },
  { name: 'DPD', unit: 'sec', fullName: 'Wave Period' },
  { name: 'APD', unit: 'sec', fullName: 'Avg. Wave Period' },
  { name: 'MWD', unit: '°T', fullName: 'Wave Dirrection' },
  { name: 'PRES', unit: 'in', fullName: 'Pressure' },
  { name: 'PTDY', unit: 'in', fullName: 'Pressure Tendency' },
  { name: 'ATMP', unit: '°F', fullName: 'Air Temperature' },
  { name: 'WTMP', unit: '°F', fullName: 'Water Tempterature' },
  { name: 'DEWP', unit: '°F', fullName: 'Dew Temperature' },
  { name: 'VIS', unit: 'nm', fullName: 'Visibility' },
  { name: 'TCC', unit: '1/8', fullName: 'Total Cloud Cover' },
  { name: 'TIDE', unit: 'ft', fullName: 'Tide' },
  { name: 'S1HT', unit: 'ft', fullName: 'Primary Swell Height' },
  { name: 'S1PD', unit: 'sec', fullName: 'Primary Swell Period' },
  { name: 'S1DIR', unit: '°T', fullName: 'Primary Swell Dirrection' },
  { name: 'S2HT', unit: 'ft', fullName: 'Secondary Swell Height' },
  { name: 'S2PD', unit: 'sec', fullName: 'Secondary Swell Period' },
  { name: 'S2DIR', unit: '°T', fullName: 'Secondary Swell Dirrection' },
  { name: 'Ice', unit: 'Acc', fullName: 'Ice Accumulation' },
  { name: 'Sea', unit: 'Acc', fullName: 'Sea Ice' },
  { name: 'SwH', unit: 'ft', fullName: 'Swell Height' },
  { name: 'SwP', unit: 'sec', fullName: 'Swell Period' },
  { name: 'SwD', unit: '', fullName: 'Swell Dirrection' },
  { name: 'WWH', unit: 'ft', fullName: 'Wind Wave Height' },
  { name: 'WWP', unit: 'sec', fullName: 'Wind Wave PEriod' },
  { name: 'WWD', unit: '', fullName: 'Wind Wave Dirrection' },
  { name: 'STEEPNESS', unit: '', fullName: 'Wave Type' }
]
