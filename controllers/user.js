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
const Itinerary = require('../models/itinerary');

const CryptoJS = require('crypto-js');
const { decrypt } = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ConnectionStates } = require('mongoose');
const itinerary = require('../models/itinerary');

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

exports.postCreateItinerary = (req, res, next) => {
    const userId = req.userId;
    const itineraryName = req.body.itineraryName;
    const itineraryDescription = req.body.itineraryDescription;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
    const tags = req.body.tags.split();

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    async function checkItinerary() {
        try {
            const existingItinerary = await Itinerary.findOne({name: itineraryName, userId:userId});

            if(existingItinerary) {
                const error = new Error(`Sorry! This itinerary already exists.`);
                error.errorCode = 'client_err';
                return next(error);
            }
        }
        catch(error) {
            throw error;
        }
    }

    async function createItinerary() {
        try {
            const itinerary = new Itinerary({
                userId: userId,
                name: itineraryName,
                description: itineraryDescription,
                startDate: Date.parse(startDate),
                endDate: Date.parse(endDate),
                tags: tags
            });
            return itinerary.save();
        }
        catch(error) {
            console.log('Error in creating user itinerary: ', error);
            throw error;
        }
    }
    
    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'create_itinerary'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user itinerary logs: ', error);
            error.message = 'Error in storing user itinerary logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            await checkItinerary();

            const itinerary = await createItinerary();

            //Store user activity logs
            const logId = await storeLogs();

            //const userDetails = await User.findById(userId);

            res.status(201).json({
                message: 'Itinerary created successfully!',
                itinerary: itinerary
            });

        } catch (error) {
            console.error('Error adding user itinerary:', error);
            if(!error.errorCode) {
                error.message = 'Error in creating the itinerary. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}

exports.postEditItinerary = (req, res, next) => {
    const userId = req.userId;
    const itineraryId = req.body.itineraryId;
    const segmentDate = req.body.segmentDate;
    const segmentPlaceId = req.body.segmentPlaceId;
    const segmentPlaceName = req.body.segmentPlaceName;
    const segmentPlaceAddress = req.body.segmentPlaceAddress;

    async function checkItinerary() {
        try {
            const existingItinerary = await Itinerary.findOne({_id: itineraryId, userId:userId});

            if(!existingItinerary) {
                const error = new Error(`Sorry! This itinerary does not exist.`);
                error.errorCode = 'client_err';
                return next(error);
            }
            else {
                return existingItinerary;
            }
        }
        catch(error) {
            throw error;
        }
    }

    async function addItinerarySegment(existingItinerary) {
        try {
    
            // const existingItinerary = Itinerary.findOne({_id: itineraryId});

            const existingItinerarySegments = existingItinerary.itinerarySegments;

            const itinerarySegment = {
                date: Date.parse(segmentDate),
                placeId: segmentPlaceId,
                placeName: segmentPlaceName,
                placeAddress: segmentPlaceAddress
            };

            if(existingItinerarySegments) {
                const segment = existingItinerarySegments.find(segment => {
                    return segment.placeId===segmentPlaceId;
                });

                //Check if that place is already added to itinerary - then update the date and remove previous entry
                if(segment) {
                    if(segment.date === Date.parse(segmentDate)) {
                        const error = new Error(`Sorry! You have already added this place to ${existingItinerary.name} on this particular date`);
                        error.errorCode = 'client_err';
                        return next(error);
                    }
        
                    const updatedSegment = {
                        date: Date.parse(segmentDate),
                        placeId: segmentPlaceId,
                        placeName: segmentPlaceName,
                        placeAddress: segmentPlaceAddress
                    };
                    
                    let updatedItinerarySegments;
                    updatedItinerarySegments = existingItinerarySegments.filter(segment => segment.placeId != segmentPlaceId);
                    updatedItinerarySegments.push(updatedSegment);

                    existingItinerary.itinerarySegments = updatedItinerarySegments;
                }
                else {
                    existingItinerarySegments.push(itinerarySegment);
                    existingItinerary.itinerarySegments = existingItinerarySegments;
                }
            }
            else {
                //Create itinerary segment
                let segments = [];

                segments.push(itinerarySegment);
                existingItinerary.itinerarySegments = segments;

            }
            return existingItinerary.save();
        }
        catch(error) {
            console.log(error);
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'edit_itinerary'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user itinerary logs: ', error);
            error.message = 'Error in storing user itinerary logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const existingItinerary = await checkItinerary();

            const updatedItinerary = await addItinerarySegment(existingItinerary);

            //Store user activity logs
            const logId = await storeLogs();

            //const userDetails = await User.findById(userId);

            res.status(201).json({
                message: 'Itinerary edited successfully!',
                itinerary: updatedItinerary
            });

        } catch (error) {
            console.error('Error adding user itinerary:', error);
            if(!error.errorCode) {
                error.message = 'Error in editing the itinerary. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}

exports.postDeleteItinerarySegment = (req, res, next) => {
    const userId = req.userId;
    const itineraryId = req.body.itineraryId;
    const segmentDate = req.body.segmentDate;
    const segmentPlaceId = req.body.segmentPlaceId;

    async function checkItinerary() {
        try {
            const existingItinerary = await Itinerary.findOne({_id: itineraryId, userId:userId});

            if(!existingItinerary) {
                const error = new Error(`Sorry! This itinerary does not exist.`);
                error.errorCode = 'client_err';
                return next(error);
            }
            else {
                return existingItinerary;
            }
        }
        catch(error) {
            throw error;
        }
    }

    async function deleteItinerarySegment(existingItinerary) {
        try {
            const existingItinerarySegments = existingItinerary.itinerarySegments;

            if(!existingItinerarySegments) { 
                const error = new Error(`Sorry! Your itinerary is empty. There is nothing to delete.`);
                error.errorCode = 'client_err';
                return next(error);
            }
            else {
                const segment = existingItinerarySegments.find(segment => {
                    return segment.placeId===segmentPlaceId;
                });
                let updatedItinerarySegments;
                updatedItinerarySegments = existingItinerarySegments.filter(segment => segment.placeId != segmentPlaceId);
                existingItinerary.itinerarySegments = updatedItinerarySegments;

                return existingItinerary.save();
            }
        }
        catch(error) {
            throw error;
        }
    }
    
    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'edit_itinerary'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user itinerary logs: ', error);
            error.message = 'Error in storing user itinerary logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const existingItinerary = await checkItinerary();

            const updatedItinerary = await deleteItinerarySegment(existingItinerary);

            //Store user activity logs
            const logId = await storeLogs();

            //const userDetails = await User.findById(userId);

            res.status(201).json({
                message: 'Itinerary edited successfully!',
                itinerary: updatedItinerary
            });

        } catch (error) {
            console.error('Error editing user itinerary:', error);
            if(!error.errorCode) {
                error.message = 'Error in editing the itinerary. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
};

exports.postDeleteItinerary  = (req, res, next) => {
    const userId = req.userId;
    const itineraryId = req.body.itineraryId;

    async function checkItinerary() {
        try {
            const existingItinerary = await Itinerary.findOne({_id: itineraryId, userId:userId});

            if(!existingItinerary) {
                const error = new Error(`Sorry! This itinerary does not exist.`);
                error.errorCode = 'client_err';
                return next(error);
            }
            else {
                return existingItinerary;
            }
        }
        catch(error) {
            throw error;
        }
    }

    async function deleteItinerary() {
        try {
            await Itinerary.deleteOne({_id:itineraryId, userId:userId});
        }
        catch(error) {
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'delete_itinerary'});
            const eventTypeId = eventType._id;

            let now = Date.now();

            const log = new Log({
                userId: userId,
                eventTypeId: eventTypeId,
                logTime: now.toString()
            });

            log.save();

            return log._id;
        }
        catch(error) {
            console.log('Error in storing user itinerary logs: ', error);
            error.message = 'Error in storing user itinerary logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const existingItinerary = await checkItinerary();

            await deleteItinerary();

            //Store user activity logs
            const logId = await storeLogs();

            //const userDetails = await User.findById(userId);

            res.status(201).json({
                message: 'Itinerary deleted successfully!'
            });

        } catch (error) {
            console.error('Error deleting user itinerary:', error);
            if(!error.errorCode) {
                error.message = 'Error in deleting the itinerary. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}

exports.getUserItineraries = (req, res, next) => {
    const userId = req.userId;

    async function getItineraries() {
        try {
            const itineraries = await Itinerary.find({userId:userId});

            return itineraries;
        }
        catch(error) {
            throw error;
        }
    }

    async function formatItineraries(itineraries) {
        try {
            let placeDetails;
            for(const itn of itineraries) {

                for(const segment of itn.itinerarySegments) {
                    placeDetails = await getPlaceDetailsFromAPI(segment.placeId);
                }
                
            }
            const itinerary = itineraries.map(itn => {
               return {
                userId: itn.userId,
                name: itn.name,
                description: itn.description,
                startDate: itn.startDate,
                endDate: itn.endDate,
                tags: itn.tags,
                itinerarySegments: itn.itinerarySegments.map(segment => {
                    return {
                        placeDetails: getPlaceDetailsFromAPI(segment.placeId)
                    }
                }),
                createdAt: itn.createdAt,
                updatedAt: itn.updatedAt
               } 
            });
        }
        catch(error) {
            throw error;
        }
    }

    async function getPlaceDetailsFromAPI(placeId) {
        try {
            
             //Use the Google Place Details API
             const placeAdditionalDetails = await axios.get(
                `https://maps.googleapis.com/maps/api/place/details/json?fields=place_id%2Cname%2Crating%2Cbusiness_status%2Ccurrent_opening_hours%2Cformatted_address%2Curl%2Ctypes&place_id=${placeId}&key=${places_nearbysearch_api}`
            );

            return placeAdditionalDetails.data.result;
        }
        catch(error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                error.message = 'Error retrieving sightseeing search information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    (async () => {
        try {
            const itineraries = await getItineraries();

            res.status(201).json({
                message: 'User Itineraries are retrieved successfully!',
                itineraries: itineraries
            });

        } catch (error) {
            console.error('Error retrieving user itineraries:', error);
            if(!error.errorCode) {
                error.message = 'Error retrieving user itineraries. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}