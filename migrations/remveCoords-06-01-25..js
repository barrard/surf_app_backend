const mongoose = require("mongoose");
const BuoyData = require("./path/to/BuoyData");

async function removeCoordsInBatches(batchSize = 100) {
    await mongoose.connect("mongodb://localhost:27017/surf_buoy");

    const cursor = BuoyData.find({ coords: { $exists: true } }).cursor();

    let batch = [];
    for await (const doc of cursor) {
        batch.push(doc._id);

        if (batch.length >= batchSize) {
            await BuoyData.updateMany(
                { _id: { $in: batch } },
                { $unset: { coords: 1 } }
            );
            console.log(`Processed batch of ${batch.length}`);
            batch = [];
        }
    }

    // process remaining docs
    if (batch.length > 0) {
        await BuoyData.updateMany(
            { _id: { $in: batch } },
            { $unset: { coords: 1 } }
        );
        console.log(`Processed final batch of ${batch.length}`);
    }

    console.log("All done!");
    await mongoose.disconnect();
}

removeCoordsInBatches().catch(console.error);
