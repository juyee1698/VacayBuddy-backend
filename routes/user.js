const express = require('express');
const path = require('path');
const rootDir = require('../util/path');
const { check,body, query } = require('express-validator');
const bodyParser = require('body-parser');

const searchController = require('../controllers/search');
const userController = require('../controllers/user');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

//Create itinerary
router.post('/createItinerary',
    [
        body('itineraryName')
        .notEmpty().withMessage('Itinerary name should not be empty')
        .isString().withMessage('Invalid input, itinerary name should be a valid string'),
        body('itineraryDescription')
        .notEmpty().withMessage('Itinerary description should not be empty')
        .isString().withMessage('Invalid input, itinerary description should be a valid string'),
        body('startDate')
        .notEmpty().withMessage('Start date should not be empty')
        .isString().withMessage('Invalid input, start date should be a valid string'),
        body('endDate')
        .notEmpty().withMessage('End date should not be empty')
        .isString().withMessage('Invalid input, end date should be a valid string')
    ],
    isAuth, 
    userController.postCreateItinerary);

//Edit itinerary
router.post('/editItinerary',
    [
        body('itineraryId')
        .notEmpty().withMessage('Itinerary ID should not be empty')
        .isString().withMessage('Invalid input, itinerary ID should be a valid string'),
        body('segmentPlaceId')
        .notEmpty().withMessage('Place ID should not be empty')
        .isString().withMessage('Invalid input, place ID should be a valid string'),
        body('segmentDate')
        .notEmpty().withMessage('Date should not be empty')
        .isString().withMessage('Invalid input, date should be a valid string')
    ],
    isAuth, 
    userController.postEditItinerary);

//Remove a place from itinerary
router.post('/deleteItinerarySegment',
    [
        body('itineraryId')
        .notEmpty().withMessage('Itinerary ID should not be empty')
        .isString().withMessage('Invalid input, itinerary ID should be a valid string'),
        body('segmentPlaceId')
        .notEmpty().withMessage('Place ID should not be empty')
        .isString().withMessage('Invalid input, place ID should be a valid string'),
        body('segmentDate')
        .notEmpty().withMessage('Date should not be empty')
        .isString().withMessage('Invalid input, date should be a valid string')
    ],
    isAuth, 
    userController.postDeleteItinerarySegment);

//Delete itinerary
router.post('/deleteItinerary',
    [
        body('itineraryId')
        .notEmpty().withMessage('Itinerary ID should not be empty')
        .isString().withMessage('Invalid input, itinerary ID should be a valid string')
    ],
    isAuth,
    userController.postDeleteItinerary);

router.get('/getItineraries', isAuth, userController.getUserItineraries);

module.exports = router; 