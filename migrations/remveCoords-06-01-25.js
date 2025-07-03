const mongoose = require("mongoose");
const BuoyModel = require("../models/BuoyModel");

async function removeCoordsInBatches(batchSize = 1000) {
    await mongoose.connect("mongodb://0.0.0.0:27017/surf_app");

    const cursor = BuoyModel.find({ coords: { $exists: true } }).cursor();

    let batch = [];
    for await (const doc of cursor) {
        batch.push(doc._id);

        if (batch.length >= batchSize) {
            await BuoyModel.updateMany(
                { _id: { $in: batch } },
                { $unset: { coords: 1 } }
            );
            console.log(`Processed batch of ${batch.length}`);
            batch = [];
        }
    }

    // process remaining docs
    if (batch.length > 0) {
        await BuoyModel.updateMany(
            { _id: { $in: batch } },
            { $unset: { coords: 1 } }
        );
        console.log(`Processed final batch of ${batch.length}`);
    }

    console.log("All done!");
    await mongoose.disconnect();
}

removeCoordsInBatches().catch(console.error);
