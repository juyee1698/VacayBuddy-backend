const express = require('express');
const path = require('path');
const rootDir = require('../util/path');
const { check,body, query } = require('express-validator');
const bodyParser = require('body-parser');

const bookingController = require('../controllers/booking');
const searchController = require('../controllers/search');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

//Getting flight search information
router.post('/flightSearch',
    [
        body('originLocation', 'Origin location should not be empty').trim().not().isEmpty(),
        body('destinationLocation', 'Departure location should not be empty').trim().not().isEmpty(),
        body('departureDate', 'Departure date should not be empty').trim().not().isEmpty(),
        check('departureDate').custom((value, { req }) => {
            let departureDate = new Date(value);
            let todaysDate = new Date();
            if (departureDate < todaysDate) {
                throw new Error('Invalid input, departure date is in the past!');
            }
            return true;
        }),
        check('returnDate').optional().custom((value, { req }) => {
            let returnDate = new Date(value);
            let todaysDate = new Date();
            let departureDate = new Date(req.body.departureDate);
            //console.log(departureDate, returnDate);
            if (returnDate < todaysDate) {
                throw new Error('Invalid input, return date is in the past!');
            }
            if (returnDate < departureDate ) {
                throw new Error('Departure date cannot be after return date');
            }
            
            return true;
        })
    ],
    isAuth,
    searchController.getFlights);

//Getting selected flight booking information
router.post('/flightSearch/selectFlight',
    [
        query('flightId', 'Flight ID should not be empty').not().isEmpty(),
        check('flightId').custom((value, {req}) => {
            const parsedVal = parseInt(value);
            if(typeof parsedVal === 'number' && isFinite(parsedVal) && Math.floor(parsedVal) === parsedVal) {
                //do nothing
            }
            else {
                throw new Error('Invalid input, flight ID should be a valid number.');
            }
            return true;
        })
    ],
    isAuth, 
    searchController.selectFlight);

//Get airport metadata 
router.post('/airportMetadata', searchController.getAirportMetadata);

router.post('/cityMetadata', searchController.getCityMetadata);

router.post('/sightSearch',
    [
        body('city')
        .notEmpty().withMessage('City cannot be empty')
        .isString().withMessage('Invalid input, city should be a valid string')
        .isLength({min: 1, max: 50}).withMessage('Invalid input, city should be a minimum of 1 character and maximum of 50 characters'),
        body('countryCode')
        .notEmpty().withMessage('Country code cannot be empty')
        .isString().withMessage('Invalid input, country code should be a valid string')
        .isLength({min: 2, max: 2}).withMessage('Invalid input, country code should be only 2 characters'),
        body('iataCode')
        .notEmpty().withMessage('IATA code cannot be empty')
        .isString().withMessage('Invalid input, IATA code should be a valid string')
        .isLength({min: 3, max: 3}).withMessage('Invalid input, IATA code should be only 3 characters'),
        body('type')
        .notEmpty().withMessage('Sightseeing type cannot be empty')
        .isString().withMessage('Invalid input, sightseeing type should be a valid string')
        .isLength({min: 3, max: 20}).withMessage('Invalid input, type should be a minimum of 3 characters and maximum of 20 characters')
    ],
    isAuth, 
    searchController.getSightSeeingActivities);

router.post('/sightSearch/selectSight',
    [
        body('searchContinuationId', 'Search continuation ID should not be empty').not().isEmpty(),
        body('placeId', 'Place ID should not be empty').not().isEmpty(),
    ],
    isAuth, 
    searchController.selectSightSeeingActivity);

module.exports = router; 