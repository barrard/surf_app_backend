// Test script to verify swell data preservation logic
// This simulates the scenario where a buoy alternates between
// sending complete swell data (with direction) and incomplete data (without direction)

require('dotenv').config();
const mongoose = require('mongoose');
const BuoyModel = require('./models/BuoyModel');

// Connect to MongoDB using same config as app
const db_name = process.env.DB_NAME || "surf_app";
const db_host = process.env.DB_HOST || "localhost";

mongoose.connect(`mongodb://${db_host}/${db_name}`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true
});

// Simulate the insertBuoyData function with the new logic
async function insertBuoyData(data) {
    try {
        const {
            salinity,
            visibility,
            pressure,
            pressureTendency,
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

        // Check if we should preserve existing swell data
        // If existing data has swellDir but new data doesn't, keep the old swell data
        const existingData = await BuoyModel.findOne({
            stationId,
            GMT,
        }).lean();

        let updateData = {
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
            salinity,
            visibility,
            pressure,
            pressureTendency,
        };

        // Preserve complete swell data if new data is incomplete
        if (existingData && existingData.swellDir && !swellDir) {
            // Keep the existing swell data (height, period, swellDir) instead of overwriting
            updateData.height = existingData.height;
            updateData.period = existingData.period;
            updateData.swellDir = existingData.swellDir;
            console.log(`  ⚠️  Preserving existing swell data with direction: ${existingData.swellDir}`);
        }

        const newBuoyData = await BuoyModel.findOneAndUpdate(
            {
                stationId,
                GMT,
            },
            updateData,
            { upsert: true, new: true, lean: true }
        );
        return newBuoyData;
    } catch (err) {
        console.log(err);
    }
}

async function runTest() {
    console.log('\n=== Testing Swell Data Preservation Logic ===\n');

    const testStationId = '51001-TEST';
    const testTimestamp = new Date('2025-10-24T10:00:00Z');

    // Clean up any existing test data
    await BuoyModel.deleteMany({ stationId: testStationId });
    console.log('✓ Cleaned up existing test data\n');

    // Test 1: Insert initial complete data with swellDir
    console.log('Test 1: Inserting complete swell data (height=3, period=8, swellDir=270)');
    const result1 = await insertBuoyData({
        stationId: testStationId,
        GMT: testTimestamp,
        height: '3',
        period: '8',
        swellDir: '270',
        windSpeed: '10',
        airTemp: '72'
    });
    console.log(`  Result: height=${result1.height}, period=${result1.period}, swellDir=${result1.swellDir}\n`);

    // Test 2: Try to update with incomplete data (no swellDir) - should preserve old data
    console.log('Test 2: Attempting update with incomplete data (height=3.2, period=9, swellDir=null)');
    const result2 = await insertBuoyData({
        stationId: testStationId,
        GMT: testTimestamp,
        height: '3.2',
        period: '9',
        swellDir: null,
        windSpeed: '12',
        airTemp: '73'
    });
    console.log(`  Result: height=${result2.height}, period=${result2.period}, swellDir=${result2.swellDir}`);

    if (result2.swellDir === '270' && result2.height === '3' && result2.period === '8') {
        console.log('  ✅ SUCCESS: Old swell data preserved!\n');
    } else {
        console.log('  ❌ FAILED: Swell data was overwritten!\n');
    }

    // Test 3: Update with new complete data - should update normally
    console.log('Test 3: Updating with new complete data (height=3.5, period=9, swellDir=275)');
    const result3 = await insertBuoyData({
        stationId: testStationId,
        GMT: testTimestamp,
        height: '3.5',
        period: '9',
        swellDir: '275',
        windSpeed: '15',
        airTemp: '74'
    });
    console.log(`  Result: height=${result3.height}, period=${result3.period}, swellDir=${result3.swellDir}`);

    if (result3.swellDir === '275' && result3.height === '3.5' && result3.period === '9') {
        console.log('  ✅ SUCCESS: New complete data updated!\n');
    } else {
        console.log('  ❌ FAILED: Complete data not updated correctly!\n');
    }

    // Test 4: Verify other fields still update when swell is preserved
    console.log('Test 4: Verifying other fields update even when swell is preserved');
    const result4 = await insertBuoyData({
        stationId: testStationId,
        GMT: testTimestamp,
        height: '4',
        period: '10',
        swellDir: null, // incomplete swell
        windSpeed: '20', // should update
        airTemp: '75'    // should update
    });
    console.log(`  Result: height=${result4.height}, period=${result4.period}, swellDir=${result4.swellDir}`);
    console.log(`  Wind/Temp: windSpeed=${result4.windSpeed}, airTemp=${result4.airTemp}`);

    if (result4.swellDir === '275' && result4.windSpeed === '20' && result4.airTemp === '75') {
        console.log('  ✅ SUCCESS: Swell preserved, other fields updated!\n');
    } else {
        console.log('  ❌ FAILED: Other fields not updated correctly!\n');
    }

    // Clean up test data
    await BuoyModel.deleteMany({ stationId: testStationId });
    console.log('✓ Test cleanup complete\n');

    mongoose.connection.close();
    console.log('=== Test Complete ===\n');
}

// Run the test
runTest().catch(err => {
    console.error('Test failed:', err);
    mongoose.connection.close();
    process.exit(1);
});
