const express = require('express');
const path = require('path');
const rootDir = require('../util/path');
const { check,body, query } = require('express-validator');
const bodyParser = require('body-parser');

const bookingController = require('../controllers/booking');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

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
        body('userBookingInfo.name')
        .notEmpty().withMessage('User name cannot be empty')
        .isString().withMessage('Invalid input, user name should be a valid string')
        .isLength({min: 1, max: 50}).withMessage('Invalid input, user name should be a minimum of 1 character and maximum of 50 characters'),
        body('userBookingInfo.email')
        .notEmpty().withMessage('User email cannot be empty')
        .isString().withMessage('Invalid input, user email should be a valid string')
        .isLength({min: 1, max: 50}).withMessage('Invalid input, user email should be a minimum of 1 character and maximum of 50 characters'),
        body('userBookingInfo.address')
        .notEmpty().withMessage('User address cannot be empty')
        .isString().withMessage('Invalid input, user address should be a valid string')
        .isLength({min: 5, max: 50}).withMessage('Invalid input, user address should be a minimum of 5 character and maximum of 50 characters'),
        body('userBookingInfo.city')
        .notEmpty().withMessage('User city cannot be empty')
        .isString().withMessage('Invalid input, user city should be a valid string')
        .isLength({min: 2, max: 50}).withMessage('Invalid input, user city should be a minimum of 2 character and maximum of 50 characters'),
        body('userBookingInfo.state')
        .notEmpty().withMessage('User state cannot be empty')
        .isString().withMessage('Invalid input, user state should be a valid string')
        .isLength({min: 2, max: 50}).withMessage('Invalid input, user state should be a minimum of 2 character and maximum of 50 characters'),
        body('userBookingInfo.country')
        .notEmpty().withMessage('User country cannot be empty')
        .isString().withMessage('Invalid input, user country should be a valid string')
        .isLength({min: 2, max: 50}).withMessage('Invalid input, user country should be a minimum of 2 character and maximum of 50 characters'),
        body('userBookingInfo.postal')
        .notEmpty().withMessage('User postal code cannot be empty')
        .isString().withMessage('Invalid input, user postal code should be a valid string')
        .isLength({min: 5, max: 50}).withMessage('Invalid input, user postal code should be a minimum of 5 character and maximum of 50 characters'),
        body('userBookingInfo.phoneno')
        .notEmpty().withMessage('User phone number cannot be empty')
        .isString().withMessage('Invalid input, user phone number should be a valid string')
        .isLength({min: 5, max: 50}).withMessage('Invalid input, user phone number should be a minimum of 5 character and maximum of 50 characters')
    ],
    isAuth, bookingController.postFlightCheckout);

//Post successful payment session - Redirected to booking confirmation page
router.post('/flightBooking/checkout/success',
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty(),
        body('userBookingId', 'User Booking ID should not be empty').not().isEmpty(),
    ],
    isAuth,bookingController.postBookingFlight);

//Post unsuccessful payment session - Redirected to booking information page
router.post('/flightBooking/checkout/cancel',
    [
        body('journeyContinuationId', 'Journey continuation ID should not be empty').not().isEmpty()
    ],
    isAuth,bookingController.bookFlight);

//Get user's past flight booking history
router.post('/flightBookingHistory',
    isAuth,bookingController.getBookings);


module.exports = router; 