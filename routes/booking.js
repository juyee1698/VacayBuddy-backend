const express = require('express');
const path = require('path');
const rootDir = require('../util/path');
const { check,body, query } = require('express-validator');
const bodyParser = require('body-parser');

const bookingController = require('../controllers/booking');
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
    bookingController.getFlights);

//Getting selected flight booking information
router.post('/flightSearch/selectFlight',
    [
        query('flightId', 'Flight ID should not be empty').not().isEmpty(),
        check('flightId').custom((value, {req}) => {
            if(typeof value === 'number' && isFinite(value) && Math.floor(value) === value) {
                //do nothing
            }
            else {
                throw new Error('Invalid input, flight ID should be a valid number.');
            }
            return true;
        })
    ],
    isAuth, 
    bookingController.selectFlight);

//Getting flight booking information 
router.post('/flightBooking', 
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty()
    ],
    isAuth, 
    bookingController.bookFlight);

//Initiating checkout session
router.post('/flightBooking/checkout', 
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty(),
        body('userBookingInfo', 'User booking information should not be empty').not().isEmpty(),
        body('userBookingInfo.name', 'User name cannot be empty').not().isEmpty(),
        body('userBookingInfo.name', 'Invalid input, user name should be a valid string').isString(),
        body('userBookingInfo.email', 'User email cannot be empty').not().isEmpty(),
        body('userBookingInfo.email', 'Invalid input, user email should be a valid string').isString(),
        body('userBookingInfo.address', 'User address cannot be empty').not().isEmpty(),
        body('userBookingInfo.address', 'Invalid input, user address should be a valid string').isString(),
        body('userBookingInfo.city', 'User city cannot be empty').not().isEmpty(),
        body('userBookingInfo.city', 'Invalid input, user city should be a valid string').isString(),
        body('userBookingInfo.state', 'User state cannot be empty').not().isEmpty(),
        body('userBookingInfo.state', 'Invalid input, user state should be a valid string').isString(),
        body('userBookingInfo.country', 'User country cannot be empty').not().isEmpty(),
        body('userBookingInfo.country', 'Invalid input, user country should be a valid string').isString(),
        body('userBookingInfo.postal', 'User postal code cannot be empty').not().isEmpty(),
        body('userBookingInfo.postal', 'Invalid input, user postal code should be a valid string').isString(),
        body('userBookingInfo.phoneno', 'User phone number cannot be empty').not().isEmpty(),
        body('userBookingInfo.phoneno', 'Invalid input, user phone number should be a valid string').isString(),
        check('userBookingInfo').custom((value, {req}) => {
            if(value.name.length > 50) {
                throw new Error('Invalid input, user name should be a maximum of 50 characters');
            }
            if(value.email.length > 50) {
                throw new Error('Invalid input, user email should be a maximum of 50 characters');
            }
            if(value.address.length > 200) {
                throw new Error('Invalid input, user email should be a maximum of 200 characters');
            }
            if(value.city.length > 50) {
                throw new Error('Invalid input, user city should be a maximum of 50 characters');
            }
            if(value.state.length > 50) {
                throw new Error('Invalid input, user state should be a maximum of 50 characters');
            }
            if(value.country.length > 50) {
                throw new Error('Invalid input, user country should be a maximum of 50 characters');
            }
            if(value.postal.length > 50) {
                throw new Error('Invalid input, user postal should be a maximum of 50 characters');
            }
            if(value.phoneno.length > 50) {
                throw new Error('Invalid input, user phone number should be a maximum of 50 characters');
            }
        })
    ],
    isAuth, bookingController.postFlightCheckout);

//
router.post('/flightBooking/checkout/success',
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty(),
        body('userBookingId', 'User Booking ID should not be empty').not().isEmpty(),
    ],
    isAuth,bookingController.postBookingFlight);

router.get('/flightBooking/checkout/cancel',
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty()
    ],
    isAuth,bookingController.bookFlight);

module.exports = router; 