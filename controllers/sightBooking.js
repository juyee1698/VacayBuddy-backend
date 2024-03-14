const SightBooking = require("../models/sightBooking");
const LocalAttraction = require("../models/localAttractions");

exports.createSightBooking = async (req, res, next) => {
  try {
    const { localAttractionId, price } = req.body;
    const newSightBooking = new SightBooking({
      localAttractionId,
      price,
    });
    const result = await newSightBooking.save();
    res.status(201).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.getSightBooking = async (req, res, next) => {
  try {
    //get only name and address of localAttraction
    const result = await SightBooking.find().populate("localAttractionId");
    res.status(200).json(
      //   result.map((item) => {
      //     return {
      //       _id: item._id,
      //       name: item.localAttractionId.name,
      //       price: item.price,
      //     };
      // })
      result
    );
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

exports.getSightBookingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await SightBooking.findById(id).populate(
      "localAttractionId"
    );
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.updateSightBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sightseeingId, price } = req.body;
    const result = await SightBooking.findByIdAndUpdate(id, {
      sightseeingId,
      price,
    });
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.deleteSightBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await SightBooking.findByIdAndDelete(id);
    res.status(200).json("message: Deleted successfully");
  } catch (err) {
    console.log(err);
  }
};
