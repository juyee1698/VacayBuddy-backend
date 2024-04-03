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


module.exports = router; 