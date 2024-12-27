const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const morgan = require("morgan");
const compression = require('compression');
require("dotenv").config();
const { placebet, checkstatus, completeMatchCheckStatus, MakeBetLapseCheckStatus, deleteBet } = require("./controllers/testingServer");

const app = express();
const PORT = process.env.PORT || 4000;

mongoose
  .connect(process.env.MONGO_CONNECTION_STRING, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then()
  .catch((error) => console.error("MongoDB connection error:", error));

app.use(cors());
app.use(morgan(":method :url :response-time ms"));
app.use(express.json());
app.use(compression());
app.post("/placebet", placebet);
app.post("/checkstatus", checkstatus);
app.post("/completematch", completeMatchCheckStatus);
app.post("/lapsebet", MakeBetLapseCheckStatus);
app.post("/deleteBet", deleteBet);

app.listen(PORT, () => {
  console.log(`Place a Bet: http://localhost:${PORT}/placebet`);
  console.log(`Check Status: http://localhost:${PORT}/checkstatus`);
  console.log(`Complete Match: http://localhost:${PORT}/completematch`);
  console.log(`Lapse Bet: http://localhost:${PORT}/lapsebet`);
  console.log(`Delete a Bet: http://localhost:${PORT}/deleteBet`);
});
