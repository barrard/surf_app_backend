var express = require("express");
var router = express.Router();

const {
    saveSurfSpot,
    getNearSurfSpot,
    deleteSurfSpot,
    editSurfSpot,
    postSurfReport,
} = require("../controllers/surfSpotsController");

const { getNearHawaiiBuoys } = require("../controllers/waveDataController");
/* GET home page. */
router.get("/", function (req, res, next) {
    res.send("Dave the wave slave");
});

router.post("/addSurfSpot", saveSurfSpot);

router.get("/getSurfSpots/:lat/:lng", getNearSurfSpot);

router.delete("/deleteSurfSpot/:id", deleteSurfSpot);

router.post("/editSurfSpot", editSurfSpot);
router.post("/postSurfReport", postSurfReport);

router.get("/hawaii-buoys", getNearHawaiiBuoys);

module.exports = router;
