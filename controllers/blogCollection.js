const LocalAttraction = require("../models/localAttractions");
const SightBooking = require("../models/sightBooking");

exports.createblogCollection = async (req, res, next) => {
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

exports.getblogCollection = async (req, res, next) => {
  try {
    const result = await SightBooking.find().populate("localAttractionId");
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

exports.getblogCollectionById = async (req, res, next) => {
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

exports.updateblogCollection = async (req, res, next) => {
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

exports.deleteblogCollection = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await SightBooking.findByIdAndDelete(id);
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};
