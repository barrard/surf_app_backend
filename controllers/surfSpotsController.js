/* Import the model and the service */
const SurfSpotModel = require("../models/SurfSpotModel");
const SurfReport = require("../models/SurfReportModel");
module.exports = {
    saveSurfSpot,
    getNearSurfSpot,
    deleteSurfSpot,
    editSurfSpot,
    postSurfReport,
};

async function postSurfReport(req, res) {
    try {
        const { additionalNotes, dateTime, crowd, surfQuality, weather, wind, rating, surfSpot } = req.body;
        const newSurfSpot = new SurfReport({
            additionalNotes,
            dateTime,
            crowd,
            surfQuality,
            weather,
            wind,
            rating,
            surfSpot,
        });
        let saved = await newSurfSpot.save();
        saved = saved.toJSON();
        // console.log({ saved });
        return res.json(saved);
    } catch (err) {
        console.log(err);
        return res.json({ err });
    }
}

async function editSurfSpot(req, res, next) {
    const data = req.body;

    // console.log(data);
    const updated = await SurfSpotModel.findByIdAndUpdate(
        data.id,
        {
            $set: {
                name: data.name,
                description: data.description,
            },
        },
        { new: true }
    );

    // console.log(updated);
    return res.json(updated);
}

async function deleteSurfSpot(req, res) {
    const id = req.params.id;
    // console.log(`delete ${id}`);
    const resp = await SurfSpotModel.findByIdAndDelete(id);
    // console.log(resp);
    res.json({ ok: "ok" });
}

async function getNearSurfSpot(req, res) {
    // console.log("getNearSurfSpot");

    const { lng, lat } = req.params;
    // console.log({ lng, lat });
    const spots = await SurfSpotModel.find({
        coords: {
            //     $geoNear: {
            $near: {
                $geometry: { type: "Point", coordinates: [lng, lat] },
                // $minDistance: 0,
                // $maxDistance: 500000000,
            },
        },
    });

    // console.log({ spots });
    res.json({ spots });
}
async function saveSurfSpot(req, res) {
    try {
        const { name, description, address, latitude, longitude } = req.body;
        const newSurfSpot = new SurfSpotModel({
            name,
            description,
            address,
            coords: { type: "Point", coordinates: [longitude, latitude] },
        });
        let saved = await newSurfSpot.save();
        saved = saved.toJSON();
        // console.log({ saved });
        return res.json(saved);
    } catch (err) {
        console.log(err);
        return res.json({ err });
    }
}
