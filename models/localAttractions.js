const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const localAttractionSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  //address is dictionary
  address: {
    type: Object,
    required: true,
  },
  coordinates: {
    type: Object,
    required: true,
  },
  boundingBox: {
    type: Object,
    required: true,
  },
  tags: {
    type: Array,
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  wikiExtracts: {
    type: String,
    required: true,
  },
});

module.exports = mongoose.model("LocalAttraction", localAttractionSchema);
