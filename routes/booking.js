const express = require('express');
const path = require('path');
const rootDir = require('../util/path');
const { check,body } = require('express-validator');
const bodyParser = require('body-parser');

const bookingController = require('../controllers/booking');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

//router.get('/',bookingController);

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

router.post('/flightSearch/selectFlight',
    isAuth, 
    bookingController.selectFlight);

//?from=from&to=to&journeyContinuationId=journeyContinuationId',isAuth, bookingController.selectFlight);

router.post('/flightBooking', isAuth, bookingController.bookFlight);

router.post('/flightBooking/checkout', isAuth, bookingController.postFlightCheckout);

router.post('/flightBooking/checkout/success',isAuth,bookingController.postBookingFlight);

router.get('/flightBooking/checkout/cancel',isAuth,bookingController.bookFlight);

module.exports = router; 