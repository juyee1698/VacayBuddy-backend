const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({

    sightseeingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LocalAttractions',
        required: true
    },
    summary: {
        type: String,
        required: true
    },
    review: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    }
});

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;