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

exports.getFlights = (req, res, next) => {
    //Get the flight search input parameters from request body 
    const originLocation = req.body.originLocation;
    const destinationLocation = req.body.destinationLocation;
    const departureDate = req.body.departureDate;
    const returnDate = req.body.returnDate;
    const adultsCount = req.body.adultsCount;
    const childrenCount = req.body.childrenCount;
    const infantsCount = req.body.infantsCount;
    const maxFlightOffers = req.body.maxFlightOffers;
    const travelClass = req.body.travelClass;
    const currencyCode = req.body.currencyCode;

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "server_validation_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    //Function to process flight search results
    async function processFlightOffers() {
        try {
            const response = await amadeus.shopping.flightOffersSearch.get({
                originLocationCode: originLocation,
                destinationLocationCode: destinationLocation,
                departureDate: departureDate,
                returnDate: returnDate,
                adults: adultsCount,
                children: childrenCount,
                infants: infantsCount,
                travelClass: travelClass,
                currencyCode: 'USD',
                max: maxFlightOffers
            });

            const promises = [];

            //Function to get airport metadata from Airports collection/Amadeus API
            Object.keys(response.result.dictionaries.locations).forEach(function(key) {
                let airportInfo = {};
     
                promises.push(
                    Airport.findOne({iataCode: key})
                    .then(existingAirport => {
                        if(existingAirport){
                            airportInfo["iataCode"] = existingAirport.iataCode;
                            airportInfo["airportName"] = existingAirport.name;
                            airportInfo["cityName"] = existingAirport.cityName;
                            airportInfo["countryName"] = existingAirport.countryName;
                            airportInfo["cityCode"] = existingAirport.cityCode;
                            airportInfo["stateCode"] = existingAirport.stateCode;
                            airportInfo["countryCode"] = existingAirport.countryCode;
    
                            return airportInfo;
                        }
                        else {
                            //Function to get airport metadata from API and save it dynamically in database if it does not already exist
                            return amadeus.referenceData.locations.get({
                                subType: 'AIRPORT',
                                keyword: key
                            })
                            .then(locationResponse => {
                                //Save in airports collection
                                const airport = new Airport({
                                    iataCode:locationResponse.data[0].iataCode,
                                    airportName:locationResponse.data[0].name,
                                    cityName:locationResponse.data[0].address.cityName,
                                    countryName:locationResponse.data[0].address.countryName,
                                    cityCode:locationResponse.data[0].address.cityCode,
                                    stateCode:locationResponse.data[0].address.stateCode,
                                    countryCode:locationResponse.data[0].address.countryCode
                                });
                                return airport.save();
                            })
                            .then(savedAirport => {
                                return {
                                    iataCode: savedAirport.iataCode,
                                    airportName: savedAirport.name,
                                    cityName: savedAirport.cityName,
                                    countryName: savedAirport.countryName,
                                    cityCode: savedAirport.cityCode,
                                    stateCode: savedAirport.stateCode,
                                    countryCode: savedAirport.countryCode
                                };
                            })
                            .catch(err => {
                                err.errorCode = "api_response_err";
                                return next(err); 
                            });
                        }
                        
                    })
                    .catch(err => {
                        err.errorCode = "database_err";
                        throw err;
                    })
                    
                );
            });
            

            const airportMetadata = (await Promise.all(promises)).filter(info => info !== null);

            //Function to process and restructure the flight search response to send to client
            const flightsResult = response.data.map(flightOffer => {
                // Structure each flight offer
                let departureTrip = {};
                departureTrip["type"] = flightOffer.type;
                departureTrip["id"] = flightOffer.id;
                departureTrip["numberOfBookableSeats"] = flightOffer.numberOfBookableSeats; 
                departureTrip["oneWay"] = flightOffer.oneWay;
                departureTrip["lastTicketingDate"] = flightOffer.lastTicketingDate;
                departureTrip["validatingAirlineCodes"] = flightOffer.validatingAirlineCodes;
                departureTrip["itineraries"] = flightOffer.itineraries;
    
                let flightPriceInfo = {};
                flightPriceInfo["currency"] = flightOffer.price.currency;
                flightPriceInfo["total"] = flightOffer.price.total;
                flightPriceInfo["base"] = flightOffer.price.base;
                flightPriceInfo["taxes"] = Math.round((flightOffer.price.total - flightOffer.price.base) * 100) / 100;
                flightPriceInfo["fareDetailsBySegment"] = flightOffer.travelerPricings[0].fareDetailsBySegment;
                departureTrip["price"] = flightPriceInfo;
    
                let travelerPricings = [];
                flightOffer.travelerPricings.forEach(travelerPricing => {
                    travelerPricings.push({
                        travelerId: travelerPricing.travelerId,
                        fareOption: travelerPricing.fareOption,
                        travelerType: travelerPricing.travelerType,
                        price: travelerPricing.price
                    })
                });
                departureTrip["travelerPricings"] = travelerPricings;
    
                // let itineraries = [];
                // flightOffer.itineraries.forEach(itinerary => {              
                //     itineraries.push({
                //         duration: itinerary.duration,
                //         segments: itinerary.segments.forEach(segment => {
                            
                //         })
                //     });
                // });
    
                return departureTrip;

            });

            //Create a flights search result dictionary to send to the client
            const flights = {
                flightsResult,
                originLocation: originLocation,
                destinationLocation: destinationLocation,
                travelerInfo: {
                    adults: adultsCount,
                    children: childrenCount,
                    infants: infantsCount
                },
                metadata: response.result.meta,
                dictionaries: response.result.dictionaries,
                airportMetadata
            };
    
            return flights;

        }
        catch (err) {
            console.error('Error processing flight offers:', err);
            const error = new Error('Error processing flight offers');
            error.statusCode = err.description[0].status;
            error.message = 'Error processing flight offers: '+ err.description[0].title;
            error.errorCode = 'client_err';
            error.data = {
                msg: err.description[0].detail,
                path: err.description[0].source.pointer,
                example: err.description[0].source.example
            }
            throw error;
        }
    }

    //Function to temporarily store flight search results in Redis
    async function storeFlightResults(flights) {
        try {
            let now = Date.now();
            let today = now - (now % 86400000);

            const userId = req.userId;
            const client = await redisConnect;
            const key = 'flightresults_' + userId + '_' + today;

            await client.set(key, JSON.stringify(flights));
            await client.expire(key, 600);

            console.log('Flight results stored in Redis:', key);

            return true;
        } catch (error) {
            console.error('Error storing flight results in Redis:', error);
            error.errorCode = 'redis_err'
            throw error;
        }
    }

    (async () => {
        try {
            const flights = await processFlightOffers();
            await storeFlightResults(flights);
            res.status(201).json({
                message: 'Flight results retrieved successfully!',
                ...flights
            });
        } catch (err) {
            return next(err);
        }
    })();
    
};

exports.selectFlight = (req, res, next) => {
    const flightId = req.query.flightId;
    const userId = req.userId;

    //Function to retrieve that flight result from Redis
    async function retrieveFlightsResult() {
        try {
            const client = await redisConnect;
            let now = Date.now();
            let today = now - (now % 86400000)
            const key = 'flightresults_' + userId + '_' + today;
            //Get the most recent key from redis
            // client.keys(key_prefix, (err, key) => {
            //     if (err) {
            //         //Future reference: better exception handling here to handle expired search results.
            //         //return next(err);
            //         const error = new Error('Sorry! Your search result has expired.');
            //         error.statusCode = 500;
            //         error.data = errors.array();
            //         throw error;
            //     }
            // });

            const flightSearchResultStr = await client.get(key);

            const flightSearchResult = await JSON.parse(flightSearchResultStr);


            return flightSearchResult;

        } catch (err) {
            console.error('Error retrieving flight result in Redis:', err);
            //throw error;
            return next(err);
        }
    }

    async function getFlightBookingInfo(flightSearchResult, flightId) {
        try {
            const flightsResult = flightSearchResult.flightsResult;
            const flightInfo = flightsResult.find(flight => flight.id === flightId.toString());
            return flightInfo;

        } catch (error) {
            console.error('Error processing flight info from Redis:', error);
            throw error;
        }
    }

    //Function to temporarily store flight selection info in Redis and create journey continuation ID for frontend
    async function storeFlightBookingInfo(flightBookingInfo, flightId) {
        try {
            let now = Date.now();
            let today = now - (now % 86400000)
            const userId = req.userId;
            const client = await redisConnect;
            const key = 'flightbookings_' + userId + '_' + now + '_' + flightId.toString();
            
            await client.set(key, JSON.stringify(flightBookingInfo));
            await client.expire(key, 600);
            console.log('Flight booking information stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Flight Journey");

            return encrypted;

        } catch (error) {
            console.error('Error storing flight booking information in Redis:', error);
            throw error;
        }
    }

    (async () => {
        try {
            const flightSearchResult = await retrieveFlightsResult();

            const flightInfo = await getFlightBookingInfo(flightSearchResult, flightId);

            const flightBookingInfo = {
                originLocation: flightSearchResult.originLocation,
                destinationLocation: flightSearchResult.destinationLocation,
                travelerInfo: flightSearchResult.travelerInfo,
                flightInfo: flightInfo,
                dictionaries: flightSearchResult.dictionaries,
                airportMetadata: flightSearchResult.airportMetadata
            };

            const encryptedKey = await storeFlightBookingInfo(flightBookingInfo, flightId);

            const journeyContinuationId = encryptedKey.toString();

            res.status(201).json({
                message: 'Flight booking information retrieved successfully!',
                journeyContinuationId: journeyContinuationId,
                flightInfo: flightInfo,
                travelerInfo: flightSearchResult.travelerInfo,
                dictionaries: flightSearchResult.dictionaries,
                airportMetadata: flightSearchResult.airportMetadata
                
            });

        } catch (err) {
            return next(err);
        }
    })();

}

exports.bookFlight = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userId = req.userId;

    let bytes;
    let decryptedKey;

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
        catch (err) {
            return next(err);
        }
    }


    async function getFlightBookingInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);
            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (err) {
            return next(err);
        }
    }

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

        } catch (err) {
            return next(err);
        }
    })();
}

exports.postFlightCheckout = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userId = req.userId;
    const userBookingInfo = req.body.userBookingInfo;

    let bytes;
    let decryptedKey;

    async function getFlightKeyDetails(journeyContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(journeyContinuationId, "VacayBuddy Flight Journey");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
            console.log("Decrypted text", decryptedKey);
            flightId = decryptedKey.toString(CryptoJS.enc.Utf8).split('_')[3];

            return {     
                flightId: flightId,
                key: decryptedKey
            };
        }
        catch (err) {
            return next(err);
        }
        
    }

    async function getFlightBookingInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);
            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (err) {
            return next(err);
        }
    }

    async function initiateCheckout(flightBookingInfo, userBookingInfo) {
        try {
            //Initiate stripe checkout session
            const originCountryName = flightBookingInfo.airportMetadata.find(metadata => 
                metadata.iataCode === flightBookingInfo.originLocation
            )?.countryName;
            
            const destinationCountryName = flightBookingInfo.airportMetadata.map(metadata => 
                metadata.iataCode === flightBookingInfo.destinationLocation
            )?.countryName;

            const today = new Date();
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
                //amount_subtotal: parseInt(flightBookingInfo.flightInfo.price.base) * 100,
                //amount_total: parseInt(flightBookingInfo.flightInfo.price.total) * 100,
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
                success_url:req.protocol+'://'+req.get('host')+'/flightBooking/checkout/success',
                cancel_url:req.protocol+'://'+req.get('host')+'/flightBooking/checkout/cancel'
            });

            return session;
        }
        catch (err) {
            return next(err);
        }
    }

    //Function to temporarily store flight selection info in Redis and create journey continuation ID for frontend
    async function storeUserBookingInfo(userBookingInfo, userId, flightId) {
        try {
            console.log(userBookingInfo);
            const client = await redisConnect;
            let now = Date.now();
            const key = 'flightbookinguserinfo_' + userId + '_' + now + '_' + flightId.toString();
            await client.set(key, JSON.stringify(userBookingInfo));
            await client.expire(key, 1200);
            console.log('Users booking information stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Flight Booking");

            return encrypted.toString();

        } catch (error) {
            console.error('Error storing user booking information in Redis:', error);
            throw error;
        }
    }

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
  
        } catch (err) {
            return next(err);
        }
    })();

};

exports.postBookingFlight = (req, res, next) => {
    const journeyContinuationId = req.body.journeyContinuationId;
    const userBookingId = req.body.userBookingId;
    const userId = req.userId;

    let bytes;
    let decryptedKey;

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
        catch(err) {
            return next(err);
        }
    }

    async function getUserKeyDetails(userBookingId) {
        try {
            bytes = CryptoJS.AES.decrypt(userBookingId, "VacayBuddy Flight Booking");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);

            return decryptedKey;
        }
        catch(err) {
            return next(err);
        }
    }

    async function getFlightBookingConfirmationInfo(flightInfoKey) {
        try {
            const client = await redisConnect;

            const flightBookingInfoStr = await client.get(flightInfoKey);
            const flightBookingInfo = await JSON.parse(flightBookingInfoStr);

            return flightBookingInfo;

        }
        catch (err) {
            return next(err);
        }
    }

    async function getUserBookingConfirmationInfo(userBookingInfoKey) {
        try {
            const client = await redisConnect;

            const userBookingInfoStr = await client.get(userBookingInfoKey);
            const userBookingInfo = await JSON.parse(userBookingInfoStr);

            return userBookingInfo;

        }
        catch (err) {
            return next(err);
        }
    }

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
                cabin: flightBookingInfo.flightInfo.price.fareDetailsBySegment.cabin,
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
            console.log(flightBooking);

            flightBooking.save();

            return flightBooking._id;
        }
        catch (err) {
            return next(err);
        }
    }

    async function getStripePaymentInfo(userBookingInfo) {
        try {    
            const sessionId = userBookingInfo.sessionId;  
            const session = await stripe.checkout.sessions.retrieve(
                sessionId
            );

            return session;
        }
        catch (err) {
            return next(err);
        }
    }

    async function saveUserPaymentDetails(flightBookingInfo, userBookingInfo, paymentSession) {
        try {
            const bookingType = await BookingType.findOne({type:'Flight'});
            const bookingTypeId = bookingType._id;

            const currency = paymentSession.currency.toUpperCase();
            const currencyInfo = await Currency.findOne({currencyType:currency});
            const currencyId = currencyInfo._id;

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

            const payment = new Payment({
                userId: userId,
                bookingTypeId: bookingTypeId,
                paymentDate: paymentSession.created,
                paymentAmount: (paymentSession.amount_total)/100,
                currencyId: currencyId,
                paymentStatus: paymentSession.status,
                paymentMethodTypes: paymentSession.payment_method_types,
                userBookingInfo: userInfo,
                stripeTransactionId: userBookingInfo.sessionId

            })
            payment.save();

            return payment._id;

           }
        catch (err) {
            return next(err);
        }
    }


    async function storeBooking(flightBookingId, paymentId, paymentSession) {
        const today = new Date();
        const bookingType = await BookingType.findOne({type:'Flight'});
        const bookingTypeId = bookingType._id;
        try {
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
        catch (err) {
            return next(err);
        }
    }

    (async () => {
        try {
            const flightKeyDetails = await getFlightKeyDetails(journeyContinuationId);

            const flightInfoKey = flightKeyDetails.key;
            const flightId = flightKeyDetails.flightId;
            
            const flightBookingConfirmationInfo = await getFlightBookingConfirmationInfo(flightInfoKey);

            const userBookingInfoKey = await getUserKeyDetails(userBookingId);

            const userBookingConfirmationInfo = await getUserBookingConfirmationInfo(userBookingInfoKey);

            const userPaymentSession = await getStripePaymentInfo(userBookingConfirmationInfo);

            const flightBookingId = await storeFlightBookingConfirmationInfo(flightBookingConfirmationInfo);

            const paymentId = await saveUserPaymentDetails(flightBookingConfirmationInfo, userBookingConfirmationInfo, userPaymentSession);

            const bookingId = await storeBooking(flightBookingId, paymentId, userPaymentSession);

            res.status(201).json({
                message: 'Flight Booking has been successfully completed',
                bookingId: bookingId
            });
            
        } catch (err) {
            return next(err);
        }
    })();
};

exports.getBookings;

exports.getFlightFilterResults;

//exports.get

