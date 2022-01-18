require("dotenv").config();
require("./db.js");
let log = require("./utils/logger.js");
const express = require("express");
const app = express();
const path = require("path");
const cookieParser = require("cookie-parser");
const loger = require("morgan");
const session = require("express-session");
var bodyParser = require("body-parser");

const passport = require("passport");
const cors = require("cors");
const origin_whitelist = [
    "http://192.168.0.215:3000",
    "http://localhost:3000",
    "http://localhost:3003",
    "https://surfbuoys.com",
    "https://waves.dakine.website",
    "https://waves.raveaboutdave.com",
];
const corsMiddleware = cors({
    origin: (origin, callback) => {
        console.log(origin);
        if (!origin) {
            return callback(null, true);
        }
        if (origin_whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            log({ origin, origin_whitelist });
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    preflightContinue: false,
});

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.set("trust proxy", "loopback");
app.use(corsMiddleware);
// app.options(corsMiddleware)

const indexRouter = require("./routes/indexRoutes");
const usersRouter = require("./routes/usersRoutes");
const waveDataRouter = require("./routes/waveDataRoutes");

app.use(loger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/wavedata", waveDataRouter);

module.exports = app;
