require('dotenv').config();
var Amadeus = require('amadeus');
const { validationResult } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const { redisConnect } = require('../util/redis');
const User = require('../models/user');
const Airport = require('../models/airport');
const FlightBooking = require('../models/flightBooking');
const Booking = require('../models/booking');
const BookingType = require('../models/bookingType');
const Payment = require('../models/payments');
const Currency = require('../models/currency');
const Log = require('../models/log');
const LogDetail = require('../models/logDetail');
const EventType = require('../models/eventType');
const EventParameter = require('../models/eventParameter');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

const CryptoJS = require('crypto-js');
const { decrypt } = require('dotenv');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.stripe_secret_key);
const { ConnectionStates } = require('mongoose');

var amadeus = new Amadeus({
    clientId: process.env.amadeus_clientid,
    clientSecret: process.env.amadeus_api_secret
});

const transporter = nodemailer.createTransport(sendgridTransport({
    auth:{
        api_key: process.env.sendgrid_key.toString()
    }
}));

//Controller function to get final flight booking information before user decides to checkout
exports.bookFlight = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userId = req.userId;

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    let bytes;
    let decryptedKey;

    //Function to get flight booking information key by decrypting journey continuation id
    async function getFlightKeyDetails(journeyContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(journeyContinuationId, "VacayBuddy Flight Journey");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
            flightId = decryptedKey.toString(CryptoJS.enc.Utf8).split('_')[3];

            return {     
                flightId: flightId,
                key: decryptedKey
            };
        }
        catch (error) {
            console.log('Error decrypting the journey continuation ID: ', error)
            error.message = 'Error decrypting the journey continuation ID';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    //Function to get flight booking information from Redis
    async function getFlightBookingInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);

            //Check if flight booking information result has expired in Redis
            if(flightBookingInfoStr === undefined || flightBookingInfoStr == null) {
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }
            //Parse it in JSON format
            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                console.log('Error retrieving flight booking information from Redis: ', error);
                error.message = 'Error retrieving flight booking information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    //Immediately invoked function expressions - to run all the functions above in a modular way
    (async () => {
        try {
            const flightKeyDetails = await getFlightKeyDetails(journeyContinuationId.toString());

            const flightId = flightKeyDetails.flightId;
            const flightInfoKey = flightKeyDetails.key;
            
            const flightBookingInfo = await getFlightBookingInfo(flightInfoKey);

            res.status(201).json({
                message: 'Flight booking information for checkout retrieved successfully!',
                journeyContinuationId: journeyContinuationId,
                originLocation: flightBookingInfo.originLocation,
                destinationLocation: flightBookingInfo.destinationLocation,
                travelerInfo: flightBookingInfo.travelerInfo,
                flightItinerary: flightBookingInfo.flightInfo.itineraries,
                flightPrice: flightBookingInfo.flightInfo.price,
                dictionaries: flightBookingInfo.dictionaries,
                airportMetadata: flightBookingInfo.airportMetadata 
            });

        } catch (error) {
            if(!error.errorCode) {
                error.message = 'Error retrieving flight booking information';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
}

//Controller function to initiate flight booking checkout process
exports.postFlightCheckout = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userId = req.userId;
    const userBookingInfo = req.body.userBookingInfo;

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    let bytes;
    let decryptedKey;

    //Function to get flight booking information key by decrypting journey continuation id
    async function getFlightKeyDetails(journeyContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(journeyContinuationId, "VacayBuddy Flight Journey");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
            flightId = decryptedKey.toString(CryptoJS.enc.Utf8).split('_')[3];

            return {     
                flightId: flightId,
                key: decryptedKey
            };
        }
        catch (error) {
            console.log('Error decrypting the journey continuation ID: ', error);
            error.message = 'Error decrypting the journey continuation ID';
            error.errorCode = 'internal_server_err';
            throw error;
        }
        
    }
    
    //Function to get flight booking information from Redis
    async function getFlightBookingInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);

            //Check if flight booking information key has expired in Redis
            if(flightBookingInfoStr === undefined || flightBookingInfoStr == null) {
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }
            //Parse in JSON format
            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                console.log('Error retrieving flight booking information from Redis: ', error);
                error.message = 'Error retrieving flight booking information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    //Function to initiate payment checkout session using Stripe
    async function initiateCheckout(flightBookingInfo, userBookingInfo) {
        try {
            const originCountryName = flightBookingInfo.airportMetadata.find(metadata => 
                metadata.iataCode === flightBookingInfo.originLocation
            )?.countryName;
            
            const destinationCountryName = flightBookingInfo.airportMetadata.map(metadata => 
                metadata.iataCode === flightBookingInfo.destinationLocation
            )?.countryName;

            const today = new Date();

            //Initiate stripe checkout session
            const session = await stripe.checkout.sessions.create({
                payment_method_types:['card'],
                client_reference_id: userId.toString(),
                line_items: [{
                        price_data: {
                            currency: flightBookingInfo.flightInfo.price.currency,
                            product_data: {
                                name: 'Flight Booking',
                                metadata: {
                                    code: "flightbookinginfo",
                                    originLocation: flightBookingInfo.originLocation,
                                    destinationLocation: flightBookingInfo.destinationLocation,
                                    originCountryName: originCountryName,
                                    destinationCountryName: destinationCountryName,
                                    bookingDate: today
                                }
                            },
                            unit_amount_decimal: parseInt(flightBookingInfo.flightInfo.price.total) * 100
                        },
                        quantity: 1,
                    }]
                ,
                metadata: {
                    code: "flightbookinguserinfo",
                    customerName: userBookingInfo.name,
                    customerEmail: userBookingInfo.email,
                    customerAddress: userBookingInfo.address,
                    customerCity: userBookingInfo.city,
                    customerState: userBookingInfo.state,
                    customerCountry: userBookingInfo.country
                },
                mode: 'payment',
                success_url:process.env.frontend+'/bookingConfirmation',
                cancel_url:process.env.frontend +'/bookingCancel'
            });

            return session;
        }
        catch (error) {
            console.log('Error in processing the payment: ', error);
            error.message = 'Error in processing your payment. Please try again!';
            error.errorCode = 'payments_err';
            throw error;
        }
    }

    //Function to temporarily store user booking information in Redis and create user booking ID to track it post payment completion
    async function storeUserBookingInfo(userBookingInfo, userId, flightId) {
        try {
            const client = await redisConnect;
            let now = Date.now();
            const key = 'flightbookinguserinfo_' + userId + '_' + now + '_' + flightId.toString();
            await client.set(key, JSON.stringify(userBookingInfo));
            await client.expire(key, 1200);
            console.log('Users booking information stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Flight Booking");

            return encrypted.toString();

        } catch (error) {
            console.log('Error storing user booking information in Redis: ', error);
            error.message = 'Error storing user booking information in Redis';
            error.errorCode = 'redis_err';
            throw error;
        }
    }

    //Immediately invoked function expressions - to run all the functions above in a modular way
    (async () => {
        try {
            const flightKeyDetails = await getFlightKeyDetails(journeyContinuationId);

            const flightId = flightKeyDetails.flightId;
            const flightInfoKey = flightKeyDetails.key;
            
            const flightBookingInfo = await getFlightBookingInfo(flightInfoKey);

            const session = await initiateCheckout(flightBookingInfo, userBookingInfo);

            //Add session ID to user booking info
            userBookingInfo.sessionId = session.id;

            const userBookingId = await storeUserBookingInfo(userBookingInfo, userId, flightId);

            res.status(201).json({
                message: 'Flight booking session created!',
                journeyContinuationId: journeyContinuationId,
                userBookingId: userBookingId,
                sessionUrl: session.url
            });
  
        } catch (error) {
            console.log('Error in creating flight booking session: ', error);
            if(!error.errorCode) {
                error.message = 'Error in creating flight booking session';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

};

//Controller function to store booking information in database and generate booking invoice if payment is completed successfully
exports.postBookingFlight = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userBookingId = req.body.userBookingId;
    const userId = req.userId;

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    let bytes;
    let decryptedKey;

    //Function to get flight booking information key by decrypting journey continuation id
    async function getFlightKeyDetails(journeyContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(journeyContinuationId, "VacayBuddy Flight Journey");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);      
            flightId = decryptedKey.split('_')[3];

            return {     
                flightId: flightId,
                key: decryptedKey
            };
        }
        catch(error) {
            console.log('Error decrypting the journey continuation ID: ', error);
            error.message = 'Error decrypting the journey continuation ID';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    //Function to get user booking information key by decrypting user booking id
    async function getUserKeyDetails(userBookingId) {
        try {
            bytes = CryptoJS.AES.decrypt(userBookingId, "VacayBuddy Flight Booking");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);

            return decryptedKey;
        }
        catch(error) {
            console.log('Error decrypting the user booking ID: ', error);
            error.message = 'Error decrypting the user booking ID';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    //Function to get flight booking information from Redis
    async function getFlightBookingConfirmationInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);

            //Check if flight booking information key has expired in Redis
            if(flightBookingInfoStr === undefined || flightBookingInfoStr == null) {
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }

            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                console.log('Error retrieving flight booking information from Redis: ', error);
                error.message = 'Error retrieving flight booking information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    //Function to get user booking checkout information from Redis
    async function getUserBookingConfirmationInfo(userBookingInfoKey) {
        try {
            const client = await redisConnect;

            const userBookingInfoStr = await client.get(userBookingInfoKey);

            //Check if user booking information key has expired in Redis
            if(userBookingInfoStr === undefined || userBookingInfoStr == null) {
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }

            const userBookingInfo = await JSON.parse(userBookingInfoStr);

            return userBookingInfo;

        }
        catch (error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                console.log('Error retrieving user booking details from Redis: ', error);
                error.message = 'Error retrieving user booking details from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }      
        }
    }

    //Function to store the flight booking information of the user in flight bookings database
    async function storeFlightBookingConfirmationInfo(flightBookingInfo) {
        try {
            let destinationTravelSegments;
            let returnTravelSegments;
            let returnTripDuration;

            destinationTravelSegments = flightBookingInfo.flightInfo.itineraries[0].segments.map(segment => {
                return {
                    duration: segment.duration,
                    departure: segment.departure,
                    arrival: segment.arrival,
                    carrierCode: segment.carrierCode,
                    aircraftCode: segment.aircraft.code
                };
            });

            //Get return trip information when applicable
            if(flightBookingInfo.flightInfo.itineraries.length > 1) {
                returnTravelSegments = flightBookingInfo.flightInfo.itineraries[1].segments.map(segment => {
                    return {
                        duration: segment.duration,
                        departure: segment.departure,
                        arrival: segment.arrival,
                        carrierCode: segment.carrierCode,
                        aircraftCode: segment.aircraft.code
                    };
                });
                returnTripDuration = flightBookingInfo.flightInfo.itineraries[1].duration;
            }
            else {
                returnTravelSegments = null;
                returnTripDuration = null;
            }
            
            //Create FlightBooking object to store detailed information
            const flightBooking = new FlightBooking({
                airlineCarrierMetadata: JSON.stringify(flightBookingInfo.dictionaries.carriers),
                airportMetadata: JSON.stringify(flightBookingInfo.airportMetadata),
                destinationTravelSegments: destinationTravelSegments,
                returnTravelSegments: returnTravelSegments,
                originLocation: flightBookingInfo.originLocation,
                destinationLocation: flightBookingInfo.destinationLocation,
                travelerInfo: flightBookingInfo.travelerInfo,
                duration: {
                    destinationTrip: flightBookingInfo.flightInfo.itineraries[0].duration,
                    returnTrip: returnTripDuration
                },
                cabin: flightBookingInfo.flightInfo.price.fareDetailsBySegment[0].cabin,
                price: {
                    total: flightBookingInfo.flightInfo.price.total,
                    base: flightBookingInfo.flightInfo.price.base,
                    taxes: flightBookingInfo.flightInfo.price.taxes
                }
                // baggageAllowance: {
                //     destinationTrip:
                //     returnTrip: 
                // }

            });

            flightBooking.save();

            return flightBooking._id;
        }
        catch (error) {
            console.log('Error in storing flight booking information in database: ', error);
            error.message = 'Error in storing flight booking information in database';
            error.errorCode = 'database_cud_err'
            throw error;
        }
    }

    //Function to get payment information from stripe session
    async function getStripePaymentInfo(userBookingInfo) {
        try {    
            const sessionId = userBookingInfo.sessionId;  
            const session = await stripe.checkout.sessions.retrieve(
                sessionId
            );
            
            if(session.status === 'complete') {
                return session;
            }
            else {
                const error = new Error('Payment has not been completed. Please try again!');
                error.errorCode = 'payments_err';
                error.specificMessage = 'payment_incomplete';
                throw error;
            }
        }
        catch (error) {
            if(error.specificMessage === 'payment_incomplete') {
                throw error;
            }
            else {
                console.log('Error in retrieving payment session information from Stripe: ', error);
                error.message = 'Error in retrieving payment session information from Stripe.';
                error.errorCode = 'payments_err';
                throw error;
            }
        }
    }

    //Function to store user's payment information in payments database
    async function saveUserPaymentDetails(flightBookingInfo, userBookingInfo, paymentSession) {
        try {
            const bookingType = await BookingType.findOne({type:'Flight'});
            const bookingTypeId = bookingType._id;

            const currency = paymentSession.currency.toUpperCase();
            const currencyInfo = await Currency.findOne({currencyType:currency});
            const currencyId = currencyInfo._id;
            const today = new Date();

            const userInfo = {
                userName: userBookingInfo.name,
                userEmail: userBookingInfo.email,
                userMailingAddress: userBookingInfo.address,
                userCity: userBookingInfo.city,
                userState: userBookingInfo.state,
                userCountry: userBookingInfo.country,
                userPostalCode: userBookingInfo.postal,
                userPhoneNo: userBookingInfo.phoneno
            }

            const existingPayment = await Payment.findOne({stripeTransactionId:userBookingInfo.sessionId});

            // if(existingPayment) {
            //     const error = new Error('Error in storing user payment information in database. The payment information already exists.');
            //     error.errorCode = 'database_cud_err';
            //     error.specificMessage = 'payment_duplicate';
            //     throw error;
            // }
            // else {
                const payment = new Payment({
                    userId: userId,
                    bookingTypeId: bookingTypeId,
                    paymentDate: today,
                    paymentAmount: (paymentSession.amount_total)/100,
                    currencyId: currencyId,
                    paymentStatus: paymentSession.status,
                    paymentMethodTypes: paymentSession.payment_method_types,
                    userBookingInfo: userInfo,
                    stripeTransactionId: userBookingInfo.sessionId
    
                })
                payment.save();
    
                return payment._id;
            // }

           }
        catch (error) {
            if(error.specificMessage === 'payment_duplicate') {
                throw error;
            }
            else {
                console.log('Error in storing user payment information in database: ', error);
                error.message = 'Error in storing user payment information in database';
                error.errorCode = 'database_cud_err'
                throw error;
            }
        }
    }

    //Function to store booking information in booking database that references flight reservation and payment information
    async function storeBooking(flightBookingId, paymentId, paymentSession) {
        const today = new Date();
        const bookingType = await BookingType.findOne({type:'Flight'});
        const bookingTypeId = bookingType._id;
        try {
            //Create Booking Object
            const booking = new Booking({
                userId: userId,
                bookingDate: today,
                bookingTypeId: bookingTypeId,
                flightReservationId: flightBookingId,
                status: paymentSession.status,
                paymentId: paymentId
            });

            booking.save();

            return booking._id;
        }
        catch (error) {
            console.log('Error in storing user booking information in database: ', error);
            error.message = 'Error in storing user booking information in database';
            error.errorCode = 'database_cud_err'
            throw error;
        }
    }

    //Function to send booking email confirmation to the user
    async function sendBookingEmailConfirmation(bookingId, flightBookingId, paymentId) {
        try {
            const bookingDetails = await Booking.findOne({_id:bookingId});
            const flightBookingDetails = await FlightBooking.findOne({_id:flightBookingId});
            const paymentDetails = await Payment.findOne({_id:paymentId});

            const airportMetadata = await JSON.parse(flightBookingDetails.airportMetadata);
            const airlineCarrierMetadata = await JSON.parse(flightBookingDetails.airlineCarrierMetadata);

            const originCity = airportMetadata.find(metadata => 
                metadata.iataCode === flightBookingDetails.originLocation
            )?.cityName;
            const destinationCity = airportMetadata.find(metadata => 
                metadata.iataCode === flightBookingDetails.destinationLocation
            )?.cityName;

            const noOfTravelers = (flightBookingDetails.travelerInfo.adults + flightBookingDetails.travelerInfo.children + flightBookingDetails.travelerInfo.infants);
            const currencyInfo = await Currency.findOne({_id:paymentDetails.currencyId});
            const currencySymbol = currencyInfo.symbol;

            return transporter.sendMail({
                to:paymentDetails.userBookingInfo.userEmail,
                from:'sabadejuyee21@gmail.com',
                subject:'VacayBuddy flight purchase information',
                html:`<!DOCTYPE html>
                <html lang="en">
                
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
                    <link rel="icon" href="/img/bookicon.png" type="image/png">
                    <!-- Bootstrap CSS -->
                    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.5.0/css/font-awesome.css" integrity="sha512-EaaldggZt4DPKMYBa143vxXQqLq5LE29DG/0OoVenoyxDrAScYrcYcHIuxYO9YNTIQMgD8c8gIUU8FQw7WpXSQ==" crossorigin="anonymous" referrerpolicy="no-referrer" /> 
                    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/OwlCarousel2/2.3.4/assets/owl.carousel.min.css">

                    <style>
                        .container-fluid {
                            width: 100%;
                            padding-right: 15px;
                            padding-left: 15px;
                            margin-right: auto;
                            margin-left: auto
                        }
                        .cat_product_area .latest_product_inner {
                            padding-top: 30px;
                            margin-bottom: -50px; }
                            .cat_product_area .latest_product_inner .f_p_item {
                            margin-bottom: 50px; }
                        
                        .section_gap {
                            padding: 50px 0px; }
                            @media (max-width: 1224px) {
                                .section_gap {
                                    padding: 60px 0px; 
                                } 
                        }
                        .row {
                            display: -ms-flexbox;
                            display: flex;
                            -ms-flex-wrap: wrap;
                            flex-wrap: wrap;
                            margin-right: -15px;
                            margin-left: -15px
                        }
                        .flex-row-reverse {
                            -ms-flex-direction: row-reverse !important;
                            flex-direction: row-reverse !important
                        }
                        .col-lg-2 {
                            -ms-flex: 0 0 16.666667%;
                            flex: 0 0 16.666667%;
                            max-width: 16.666667%
                        }
                        .col-lg-8 {
                            -ms-flex: 0 0 66.666667%;
                            flex: 0 0 66.666667%;
                            max-width: 66.666667%
                        }
                        .col-lg-6 {
                            -ms-flex: 0 0 50%;
                            flex: 0 0 50%;
                            max-width: 50%
                        }
                        .col-lg-12 {
                            -ms-flex: 0 0 100%;
                            flex: 0 0 100%;
                            max-width: 100%
                        }
                        .left_widgets {
                            margin-bottom: 30px;
                            background-color: white;
                            box-shadow: 0px 10px 10px 0px rgba(153, 153, 153, 0.1); }
                            .left_widgets:last-child {
                                margin-bottom: 0px; 
                        }
                        .cat_widgets .list li {
                            margin-bottom: 13px; }
                            .cat_widgets .list li a {
                                font-size: 14px;
                                font-family: "Roboto", sans-serif;
                                color: #222222; }
                            .cat_widgets .list li .list {
                                margin-top: 10px;
                                padding-left: 35px;
                                border-top: 1px solid #eeeeee;
                                padding-top: 10px;
                                display: none; 
                        }
                        .cat_widgets .widgets_inner .list li a,
                            .p_filter_widgets .widgets_inner .list li a{
                            color:#815304;
                        }

                        .cat_widgets .widgets_inner .list li a.active,
                        .p_filter_widgets .widgets_inner .list li a .active{
                            font-weight: bold;
                            color:#3b2a12;
                        }
                        .widgets_inner {
                            /* background-color: rgb(224, 221, 216); */
                            padding-left: 30px;
                            padding-right: 30px;
                            padding-top: 15px;
                            padding-bottom: 15px;
                            color: #222222;
                        }
                        .p_filter_widgets .widgets_inner {
                            border-bottom: 1px solid #eeeeee; }
                            .p_filter_widgets .widgets_inner:last-child {
                                border-bottom: 0px; }
                        .p_filter_widgets p {
                            color: #222222;
                            font-size: 13px;
                            font-family: "Roboto", sans-serif;
                            font-weight: normal;
                            margin-bottom: 1px;
                            margin-top: 1px; 
                        }
                        .left_sidebar_area{
                            margin-top: 50px;
                        }
                        .logo {
                            text-align: center;
                            align-content: center;
                        }
                    </style>
                </head>
                
                <body>
                    <section class="cat_product_area section_gap">
                        <div class="container-fluid">
                            <div class="row flex-row-reverse">
                                <div class="col-lg-2"></div>
                                <div class="col-lg-8">
                                    <div class="left_sidebar_area">
                                        <aside class="left_widgets cat_widgets">
                                            <div class="logo">
                                                <img src="https://i.imgur.com/wlfL1nF.jpg" alt="Icon">
                                            </div>
                                            <div class="widgets_inner">
                                                <h3>Thank you, ${paymentDetails.userBookingInfo.userName}! Your booking is confirmed.</h3>
                                                <h5>Booking ID: ${bookingId.toString()}</h5>
                                            </div>
                                            <hr style="width:100%;text-align:center;margin-left:0">
                                            <div class="widgets_inner">
                                                <div class="row">
                                                    <div class="col-lg-12">
                                                        <a href="#" style="color: #222222;">
                                                            <i class="fa fa-user"></i>
                                                            Traveler Details
                                                        </a>
                                                    </div>
                                                </div>
                                                <div class="row">
                                                        <div class="col-lg-12">
                                                            <p>Adults: ${flightBookingDetails.travelerInfo.adults}</p>
                                                            <p>Children: ${flightBookingDetails.travelerInfo.children}</p>
                                                            <p>Infants: ${flightBookingDetails.travelerInfo.infants}</p>
                                                        </div>                                                    
                                                </div>  
                                            </div>
                
                                            <div class="widgets_inner">
                                                <div class="row">
                                                    <div class="col-lg-12">
                                                        <a href="#" style="color: #222222;">
                                                        <i class="fa fa-plane"></i>
                                                        ${originCity} (${flightBookingDetails.originLocation}) to ${destinationCity} (${flightBookingDetails.destinationLocation})
                                                        </a>
                                                    </div>
                                                </div>
                                                ${flightBookingDetails.destinationTravelSegments.map(segment => `
                                                <div class="p_filter_widgets">  
                                                    <p>${airportMetadata.find(metadata => 
                                                        metadata.iataCode === segment.departure.iataCode)?.airportName } to 
                                                        ${airportMetadata.find(metadata => 
                                                            metadata.iataCode === segment.arrival.iataCode)?.airportName }</p>
                                                    <p>Airline: ${airlineCarrierMetadata[segment.carrierCode]}</p>
                                                    <p>Class: ${flightBookingDetails.cabin}</p>
                                                    <p>Journey Date: ${segment.departure.at}</p>
                                                    <p>Duration: ${segment.duration}</p>
                                                </div>
                                                ${flightBookingDetails.destinationTravelSegments.length > 1 ? `<hr style="width:55%;text-align:left;margin-left:1px">` : ``}
                                                `).join('')}

                                                ${flightBookingDetails.returnTravelSegments ? flightBookingDetails.returnTravelSegments.map(segment => `
                                                <div class="p_filter_widgets">   
                                                    <p>${segment.departure.iataCode} to ${segment.arrival.iataCode}</p>
                                                    <p>Airline: ${airlineCarrierMetadata[segment.carrierCode]}</p>
                                                    <p>Class: ${flightBookingDetails.cabin}</p>
                                                    <p>Journey Date: ${segment.departure.at}</p>
                                                    <p>Duration: ${segment.duration}</p>
                                                </div>
                                                ${flightBookingDetails.returnTravelSegments.length > 1 ? `<hr style="width:60%;text-align:left;margin-left:1px">` : ``}
                                                `).join('') : ``}
                                            </div>
                                            <hr style="width:100%;text-align:center;margin-left:0">
                                            <div class="widgets_inner">
                                                <div class="row">
                                                    <div class="col-lg-12">
                                                        <h4>Price Summary</h4>
                                                    </div>
                                                </div>
                                                <div class="p_filter_widgets">
                                                    <div class="row">
                                                        <div class="col-lg-12">
                                                            ${flightBookingDetails.returnTravelSegments ? `<p style="font-weight: bold;font-size: 12px;">Return flight</p>` : `<p style="font-weight: bold;font-size: 12px;">One way flight</p>`}
                                                        </div>
                                                    </div>
                                                    <div class="row">
                                                        <div class="col-lg-12">
                                                            <p>${noOfTravelers} traveler: ${currencySymbol}${flightBookingDetails.price.base}</p>
                                                        </div>
                                                        
                                                    </div>
                                                    <div class="row">
                                                        <div class="col-lg-12">
                                                            <p>Taxes and Fees: ${currencySymbol}${flightBookingDetails.price.taxes}</p>
                                                        </div>
                                                        
                                                    </div>
                                                    <div class="row">
                                                        <div class="col-lg-12">
                                                            <h4>Total: ${currencySymbol}${flightBookingDetails.price.total}</h4>
                                                        </div>
                                                       
                                                    </div>
                                                </div>
                                            </div>
                 
                                            <hr style="width:100%;text-align:center;margin-left:0">
                            
                                            <div class="widgets_inner">
                                                <h4 class="footer_email">We're here to help.</h4>
                                                <h6>Contact VacayBuddy for further guidance on your itinerary.</h6>
                                                <h5>Booking ID: ${bookingId.toString()}</h5>
                                            </div>
                                            <div class="br"></div>
                                        </aside>
                                    </div>
                
                                </div>
                                <div class="col-lg-2"></div>
                            </div>
                        </div>
                    </section>
                </body>
                
                </html>`
        });
            
        }
        catch(error) {
            console.log('Error in sending booking confirmation on email: ', error);
            error.message = 'Error in sending booking confirmation on email.';
            error.errorCode = 'internal_server_err'
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'flight_booking'});
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
            console.log('Error in storing user logs: ', error);
            error.message = 'Error in storing user logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function storeLogDetails(logId, bookingId, paymentId) {
        try {
            const bookingMetadataEventParameter = await EventParameter.findOne({attribute:'bookingId'});
            const bookingMetadataEventParameterId = bookingMetadataEventParameter._id;

            const bookingLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: bookingMetadataEventParameterId,
                value: bookingId.toString()
            });
            bookingLogDetail.save();

            const paymentMetadataEventParameter = await EventParameter.findOne({attribute:'paymentId'});
            const paymentMetadataEventParameterId = paymentMetadataEventParameter._id;

            const paymentLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: paymentMetadataEventParameterId,
                value: paymentId.toString()
            });
            paymentLogDetail.save();


        }
        catch(error) {
            console.log('Error in storing flight booking log details: ', error);
            error.message = 'Error in storing flight booking log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    //Immediately invoked function expression
    (async () => {
        try {
            const flightKeyDetails = await getFlightKeyDetails(journeyContinuationId);

            const flightInfoKey = flightKeyDetails.key;
            const flightId = flightKeyDetails.flightId;
            
            const flightBookingConfirmationInfo = await getFlightBookingConfirmationInfo(flightInfoKey);

            const userBookingInfoKey = await getUserKeyDetails(userBookingId);

            const userBookingConfirmationInfo = await getUserBookingConfirmationInfo(userBookingInfoKey);

            const userPaymentSession = await getStripePaymentInfo(userBookingConfirmationInfo);

            const paymentId = await saveUserPaymentDetails(flightBookingConfirmationInfo, userBookingConfirmationInfo, userPaymentSession);

            const flightBookingId = await storeFlightBookingConfirmationInfo(flightBookingConfirmationInfo);

            const bookingId = await storeBooking(flightBookingId, paymentId, userPaymentSession, flightBookingConfirmationInfo);

            await sendBookingEmailConfirmation(bookingId, flightBookingId, paymentId);

            const logId = await storeLogs();

            await storeLogDetails(logId, bookingId, paymentId);

            res.status(201).json({
                message: 'Flight Booking has been successfully completed. An email confirmation has been sent to your registered email address.',
                bookingId: bookingId
            });
            
        } catch (error) {
            console.log('Error in completing flight booking: ', error);
            if(!error.errorCode) {
                error.message = 'Error in completing flight booking. Please try again later!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
};

//Controller function to get booking history
exports.getBookings = (req, res, next) => {
    
    const userId = req.userId;

    async function getUserBookings(userId) {
    
        try {
            //Get flight booking type ID
            const bookingType = await BookingType.findOne({type:'Flight'});
            const bookingTypeId = bookingType._id;

            //Get flight bookings of user
            const userBookings = await Booking.find({userId: userId, bookingTypeId: bookingTypeId})

            const promises = [];
            const paymentPromises = [];

            //Get flight and payment information of all the bookings
            userBookings.forEach(booking => {

                //Promise chain for getting flight booking information
                promises.push(
                    FlightBooking.findOne({_id: booking.flightReservationId})
                    .then(flight=> {

                        const airportMetadata = JSON.parse(flight.airportMetadata);
                        const airlineCarrierMetadata = JSON.parse(flight.airlineCarrierMetadata);

                        const flightInfo =  {
                            bookingId: booking._id,
                            bookingDate: booking.bookingDate,
                            bookingStatus: booking.status,
                            originLocation: flight.originLocation,
                            destinationLocation: flight.destinationLocation,
                            originAirportName: airportMetadata.find(metadata => 
                                metadata.iataCode === flight.originLocation)?.airportName,
                            destinationAirportName: airportMetadata.find(metadata => 
                                metadata.iataCode === flight.destinationLocation)?.airportName,
                            originCityName: airportMetadata.find(metadata => 
                                metadata.iataCode === flight.originLocation)?.cityName,
                            destinationCityName: airportMetadata.find(metadata => 
                                metadata.iataCode === flight.destinationLocation)?.cityName,
                            destinationTravelSegments: flight.destinationTravelSegments.map(segment => {
                                        return {
                                            departure: {
                                                departureAirport: airportMetadata.find(metadata => 
                                                    metadata.iataCode === segment.departure.iataCode)?.airportName,
                                                iataCode: segment.departure.iataCode,
                                                terminal: segment.departure.terminal,
                                                at: segment.departure.at
                                            },
                                            arrival: {
                                                arrivalAirport: airportMetadata.find(metadata => 
                                                    metadata.iataCode === segment.arrival.iataCode)?.airportName,
                                                iataCode: segment.arrival.iataCode,
                                                terminal: segment.arrival.terminal,
                                                at: segment.arrival.at
                                            },
                                            carrierCode: segment.carrierCode.at,
                                            airline: airlineCarrierMetadata[segment.carrierCode],
                                            aircraftCode: segment.aircraftCode,
                                            duration: segment.duration
                                        }
                            }),
                            returnTravelSegments: flight.returnTravelSegments ? flight.returnTravelSegments.map(segment => {
                                return {
                                    departure: {
                                        departureAirport: airportMetadata.find(metadata => 
                                            metadata.iataCode === segment.departure.iataCode)?.airportName,
                                        iataCode: segment.departure.iataCode,
                                        terminal: segment.departure.terminal,
                                        at: segment.departure.at
                                    },
                                    arrival: {
                                        arrivalAirport: airportMetadata.find(metadata => 
                                            metadata.iataCode === segment.arrival.iataCode)?.airportName,
                                        iataCode: segment.arrival.iataCode,
                                        terminal: segment.arrival.terminal,
                                        at: segment.arrival.at
                                    },
                                    carrierCode: segment.carrierCode.at,
                                    airline: airlineCarrierMetadata[segment.carrierCode],
                                    aircraftCode: segment.aircraftCode,
                                    duration: segment.duration
                                }
                            }) : undefined,
                            duration: flight.duration,
                            cabin: flight.cabin,
                            price: flight.price
                        };

                        return flightInfo;
                    })
                    .catch(err => {
                        console.log('Error in retrieving flight booking information: ', err);
                        err.message = "Error in retrieving flight booking information";
                        err.errorCode = 'database_read_err';
                        err.specificMessage = 'flight_booking_read_err';
                        throw err;
                    })
                );

                //Promise chain for getting booking payment information
                paymentPromises.push(
                    Payment.findOne({_id: booking.paymentId})
                    .then(payment => {

                        return Currency.findOne({_id:payment.currencyId})
                            .then(currency => {
                                const paymentInfo = {
                                    bookingId: booking._id,
                                    paymentAmount: payment.paymentAmount,
                                    currency: currency.symbol,
                                    userBookingInfo: payment.userBookingInfo,
                                    paymentMethodTypes: payment.paymentMethodTypes
                                };
                                return paymentInfo;
                            })
                            .catch(err => {
                                console.log("Error in retrieving currency information: ", err);
                                err.message = "Error in retrieving currency information";
                                err.errorCode = 'database_read_err';
                                err.specificMessage = 'currency_read_err';
                                throw err;
                        });

                    })
                    .catch(err => {
                        console.log("Error in retrieving payment information: ", error);
                        err.message = "Error in retrieving payment information";
                        err.errorCode = 'database_read_err';
                        err.specificMessage = 'payment_read_err';
                        throw err;
                    })
                );
                
            });

            //Run all the promises to get array of flight bookings
            const flightsBookingInfo = (await Promise.all(promises)).filter(info => info !== null);

            //Run all the promises to get array of payment details
            const bookingPaymentsInfo = (await Promise.all(paymentPromises)).filter(info => info !== null);
            
            //Merge above two to get final booking related information
            const bookingInfo = flightsBookingInfo.map(flightBooking => {

                const paymentInfo = bookingPaymentsInfo.find(payment => {
                    return payment.bookingId.toString() === flightBooking.bookingId.toString();
                });

                const mergedInfo = {
                    ...flightBooking,
                    ...paymentInfo
                }

                if(mergedInfo!== undefined) {
                    return mergedInfo;
                }
            });
            
            return bookingInfo;
        }
        catch (error) {
            if(!error.specificMessage) {
                error.message = "Error in retrieving flight/payment information of past user bookings";
                error.errorCode = 'database_read_err';
            }
            throw error;
        }
    }

    //Immediately invoked function expression
    (async () => {
        try {
            const bookingInfo = await getUserBookings(userId);

            res.status(201).json({
                message: 'Flight Booking history has been successfully retrieved!',
                bookingInfo: bookingInfo
            });
        }
        catch(error) {
            console.log('Error in getting user flight booking history', error);
            if(!error.errorCode) {
                error.message = 'Error in getting user flight booking history';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
};



