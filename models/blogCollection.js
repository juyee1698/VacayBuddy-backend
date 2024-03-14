const mongoose = require("mongoose");

const blogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  sightseeingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LocalAttractions",
  },
  title: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  quote: {
    type: String,
  },
  imageUrl: {
    type: String,
  },
  tags: {
    type: [String],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now,
  },
  dateString: {
    type: String,
  },
  views: {
    type: Number,
    default: 0,
  },
});

const Blog = mongoose.model("Blog", blogSchema);

module.exports = Blog;
