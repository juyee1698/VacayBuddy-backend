require('dotenv').config();
var Amadeus = require('amadeus');
const { validationResult } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const { redisConnect } = require('../util/redis');
const User = require('../models/user');
const Airport = require('../models/airport');

const CryptoJS = require('crypto-js');

var amadeus = new Amadeus({
    clientId: process.env.amadeus_clientid,
    clientSecret: process.env.amadeus_api_secret
});

exports.getFlights = (req, res, next) => {
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

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Validation failed.');
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
                            //Get airport data from API and save in Airports mongodb collection.
                            return amadeus.referenceData.locations.get({
                                subType: 'AIRPORT',
                                keyword: key
                            })
                            .then(locationResponse => {
                                //save in airports collection
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
                                console.log(err.description);
                                return next(err); // Returning null in case of error
                            });
                        }
                        
                    })
                    .catch(err => {
                        throw err;
                    })
                    
                );
            });
            

            const airportMetadata = (await Promise.all(promises)).filter(info => info !== null);

            const flightsResult = response.data.map(flightOffer => {
                // Process flight offer
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

            const flights = {
                flightsResult,
                metadata: response.result.meta,
                dictionaries: response.result.dictionaries,
                airportMetadata
            };
    
            return flights;

        }
        catch (error) {
            console.error('Error processing flight offers:', error);
            throw error;
        }
    }

    //Function to temporarily store flight search results in Redis
    async function storeFlightResults(flights) {
        try {
            let now = Date.now();
            let today = now - (now % 86400000)
            const userId = req.userId;
            const client = await redisConnect;
            const key = 'flightresults_' + userId + '_' + today;
            await client.set(key, JSON.stringify(flights));
            await client.expire(key, 600);
            console.log('Flight results stored in Redis:', key);
            return true;
        } catch (error) {
            console.error('Error storing flight results in Redis:', error);
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

            console.log(flightSearchResult);

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
            const key = 'flightbookings_' + userId + '_' + today + '_' + flightId.toString();
            await client.set(key, JSON.stringify(flightBookingInfo));
            await client.expire(key, 600);
            console.log('Flight booking information stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Flight Journey");
            //console.log(encrypted.toString());

            return encrypted.toString();

        } catch (error) {
            console.error('Error storing flight booking information in Redis:', error);
            throw error;
        }
    }

    (async () => {
        try {
            const flightSearchResult = await retrieveFlightsResult();
            
            console.log(flightId);
            const flightInfo = await getFlightBookingInfo(flightSearchResult, flightId);

            const flightBookingInfo = {
                flightInfo: flightInfo,
                dictionaries: flightSearchResult.dictionaries,
                airportMetadata: flightSearchResult.airportMetadata
            };

            const journeyContinuationId = await storeFlightBookingInfo(flightBookingInfo, flightId);

            console.log(journeyContinuationId);

            res.status(201).json({
                message: 'Flight booking info retrieved successfully!',
                journeyContinuationId: journeyContinuationId,
                flightInfo: flightInfo,
                dictionaries: flightSearchResult.dictionaries,
                airportMetadata: flightSearchResult.airportMetadata
                
            });
        } catch (err) {
            return next(err);
        }
    })();

}

exports.bookFlight = (req, res, next) => {

}

exports.getFlight;

exports.getFlightFilterResults;

//exports.get

