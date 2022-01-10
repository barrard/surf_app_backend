/* Import the model and the service */
const SurfSpotModel = require("../models/SurfSpotModel");
module.exports = {
    saveSurfSpot,
    getNearSurfSpot,
};

async function getNearSurfSpot(req, res) {
    console.log("getNearSurfSpot");

    const { lng, lat } = req.params;
    console.log({ lng, lat });
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

    console.log({ spots });
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
        console.log({ saved });
        return res.json(saved);
    } catch (err) {
        console.log(err);
        return res.json({ err });
    }
}
