var express = require("express");
var router = express.Router();

const { saveSurfSpot, getNearSurfSpot } = require("../controllers/surfSpotsController");
/* GET home page. */
router.get("/", function (req, res, next) {
    res.send("Dave the wave slave");
});

router.post("/addSurfSpot", saveSurfSpot);

router.get("/getSurfSpots/:lat/:lng", getNearSurfSpot);

module.exports = router;
