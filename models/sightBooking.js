const mongoose = require("mongoose");

const sightBookingSchema = new mongoose.Schema({
  localAttractionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LocalAttraction",
    required: true,
  },
  price: {
    type: String, // Assuming 'price' is a string, you can change it to Number if needed
    required: true,
  },
});

const SightBooking = mongoose.model("SightBooking", sightBookingSchema);

module.exports = SightBooking;
