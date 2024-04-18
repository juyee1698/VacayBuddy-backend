require('dotenv').config();
var Amadeus = require('amadeus');
const { validationResult } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const { redisConnect } = require('../util/redis');

const User = require('../models/user');
const Airport = require('../models/airport');
const City = require('../models/city');
const CityMetadata = require('../models/cityMetadata');
const FileType = import('file-type');
const Log = require('../models/log');
const LogDetail = require('../models/logDetail');
const EventType = require('../models/eventType');
const Review = require('../models/review');
const Rating = require('../models/rating');
const EventParameter = require('../models/eventParameter');
const ImageMetadata = require('../models/imageMetadata');

const CryptoJS = require('crypto-js');
const { decrypt } = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ConnectionStates } = require('mongoose');

var amadeus = new Amadeus({
    clientId: process.env.amadeus_clientid,
    clientSecret: process.env.amadeus_api_secret
});

const places_nearbysearch_api = process.env.places_nearby_search_api;

exports.postRating = (req, res, next) => {
    const userId = req.userId;
    const rating = req.body.rating;
    const placeId = req.body.placeId;

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    //Function to process flight search results
    async function addRating() {
        try {
            const existingRating = await Rating.findOne({placeId:placeId, userId:userId});

            if(existingRating) {
                existingRating.rating = rating;

                return existingRating.save();
            }
            else {
                const userRating = new Rating({
                    userId: userId,
                    placeId: placeId,
                    rating: rating
                });
                return userRating.save();
            }
        }
        catch(error) {
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'add_rating'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: req.userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user rating logs: ', error);
            error.message = 'Error in storing user rating logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function storeLogDetails(logId) {
        try {
            const placeMetadataEventParameter = await EventParameter.findOne({attribute:'placeId'});
            const placeEventParameterId = placeMetadataEventParameter._id;

            const placeLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placeEventParameterId,
                value: placeId
            });
            placeLogDetail.save();

        }
        catch(error) {
            console.log('Error in storing log details: ', error);
            error.message = 'Error in storing log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const userRating = await addRating();

            //Store flight search activity logs
            const logId = await storeLogs();
            storeLogDetails(logId);

            res.status(201).json({
                message: 'Rating saved successfully!',
                placeId: placeId,
                userRating: userRating.rating
            });
        } catch (error) {
            console.error('Error adding user rating:', error);
            if(!error.errorCode) {
                error.message = 'Error adding rating. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}

exports.postReview = (req, res, next) => {
    const userId = req.userId;
    const placeId = req.body.placeId;
    const rating = req.body.rating;
    const summary = req.body.summary;
    const review = req.body.review;

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    //Function to process flight search results
    async function addReview() {
        try {

            const existingUserReview = await Review.findOne({placeId: placeId, userId: userId});

            if(existingUserReview) {
                const error = new Error('Sorry! You have already reviewed this place.');
                error.errorCode = 'duplicate_review';
                return next(error);
            }

            const userRating = new Rating({
                userId: userId,
                placeId: placeId,
                rating: rating
            });
            userRating.save();

            const userReview = new Review({
                userId: userId,
                placeId: placeId,
                rating: rating,
                summary: summary,
                review: review
            });
            return userReview.save();
        }
        catch(error) {
            console.log(error);
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'add_review'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: req.userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user review logs: ', error);
            error.message = 'Error in storing user review logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function storeLogDetails(logId) {
        try {
            const placeMetadataEventParameter = await EventParameter.findOne({attribute:'placeId'});
            const placeEventParameterId = placeMetadataEventParameter._id;

            const placeLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placeEventParameterId,
                value: placeId
            });
            placeLogDetail.save();

        }
        catch(error) {
            console.log('Error in storing log details: ', error);
            error.message = 'Error in storing log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const userReview = await addReview();

            //Store flight search activity logs
            const logId = await storeLogs();
            storeLogDetails(logId);

            const userDetails = await User.findById(userId);

            res.status(201).json({
                message: 'Review saved successfully!',
                placeId: placeId,
                userName: userDetails.name,
                rating: userReview.rating,
                summary: userReview.summary,
                review: userReview.review,
                reviewedAt: userReview.createdAt
            });
        } catch (error) {
            console.error('Error adding user rating:', error);
            if(!error.errorCode) {
                error.message = 'Error adding rating. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

}