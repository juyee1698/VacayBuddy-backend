const localAttraction = require("../models/localAttractions");
const moongoose = require("mongoose");

exports.getLocalAttractions = async (req, res, next) => {
  try {
    const result = await localAttraction.find();
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};
exports.createLocalAttraction = async (req, res, next) => {
  try {
    const {
      name,
      address,
      coordinates,
      boundingBox,
      tags,
      imageUrl,
      wikiExtracts,
    } = req.body;
    const newLocalAttraction = new localAttraction({
      name,
      address,
      coordinates,
      boundingBox,
      tags,
      imageUrl,
      wikiExtracts,
    });
    const result = await newLocalAttraction.save();
    res.status(201).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.getLocalAttraction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await localAttraction.findById(id);
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.getLocalAttractionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await localAttraction.findById(id);
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};

exports.deleteLocalAttraction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await localAttraction.findByIdAndDelete(id);
    res.status(200).json("message: Deleted successfully");
  } catch (err) {
    console.log(err);
  }
};

exports.updateLocalAttraction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      address,
      coordinates,
      boundingBox,
      tags,
      imageUrl,
      wikiExtracts,
    } = req.body;
    const result = await localAttraction.findByIdAndUpdate(id, {
      name,
      address,
      coordinates,
      boundingBox,
      tags,
      imageUrl,
      wikiExtracts,
    });
    res.status(200).json(result);
  } catch (err) {
    console.log(err);
  }
};
