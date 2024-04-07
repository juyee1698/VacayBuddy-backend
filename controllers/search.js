require('dotenv').config();
var Amadeus = require('amadeus');
const { validationResult } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const { redisConnect } = require('../util/redis');

const User = require('../models/user');
const Airport = require('../models/airport');
const City = require('../models/city');
const FlightBooking = require('../models/flightBooking');
const Booking = require('../models/booking');
const BookingType = require('../models/bookingType');
const Payment = require('../models/payments');
const Currency = require('../models/currency');
const FileType = import('file-type');

const CryptoJS = require('crypto-js');
const { decrypt } = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ConnectionStates } = require('mongoose');

var amadeus = new Amadeus({
    clientId: process.env.amadeus_clientid,
    clientSecret: process.env.amadeus_api_secret
});

const places_nearbysearch_api = process.env.places_nearby_search_api;

//Controller function to get flight search results and store it temporarily for future reference - when user selects a flight
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
        error.errorCode = "client_err";
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
                            airportInfo["airportName"] = existingAirport.airportName;
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
                                keyword: key,
                                countryCode: response.result.dictionaries.locations[key].countryCode
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
                                    airportName: savedAirport.airportName,
                                    cityName: savedAirport.cityName,
                                    countryName: savedAirport.countryName,
                                    cityCode: savedAirport.cityCode,
                                    stateCode: savedAirport.stateCode,
                                    countryCode: savedAirport.countryCode
                                };
                            })
                            .catch(err => {
                                const manualAirportInfo = {
                                    iataCode: key,
                                    airportName: 'Unknown',
                                    cityName: 'Unknown',
                                    countryName: 'Unknown',
                                    cityCode: response.result.dictionaries.locations[key].cityCode,
                                    stateCode: 'Unknown',
                                    countryCode: response.result.dictionaries.locations[key].countryCode
                                };
                                const airport = new Airport(manualAirportInfo);
                                airport.save();
        
                                return {
                                    iataCode: key,
                                    airportName: 'Unknown',
                                    cityName: 'Unknown',
                                    countryName: 'Unknown',
                                    cityCode: response.result.dictionaries.locations[key].cityCode,
                                    stateCode: 'Unknown',
                                    countryCode: response.result.dictionaries.locations[key].countryCode
                                };
                                // err.message = "Error retrieving airport metadata from API";
                                // err.errorCode = "api_response_err";
                                // return next(err); 
                            });
                        }
                        
                    })
                    .catch(err => {
                        err.message = "Error processing airport information in database";
                        err.errorCode = "database_read_err";
                        return next(err);
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
            return next(error);
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
            error.message = 'Error storing flight results in Redis';
            error.errorCode = 'redis_err';
            return next(error);
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
        } catch (error) {
            error.message = 'Error retrieving flight search results';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();
    
};

//Controller function to display flight booking information of the user selected flight and store it temporarily for future reference incase user decides to book this flight
exports.selectFlight = (req, res, next) => {
    const flightId = req.query.flightId;
    const userId = req.userId;

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    //Function to retrieve that flight result from Redis
    async function retrieveFlightsResult() {
        try {
            const client = await redisConnect;
            let now = Date.now();
            let today = now - (now % 86400000);
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

            //Check if flight search result has expired in Redis
            if(flightSearchResultStr === undefined || flightSearchResultStr == null) {
                error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                return next(error);
            }

            //Parse flight search results in JSON format
            const flightSearchResult = await JSON.parse(flightSearchResultStr);

            return flightSearchResult;

        } catch (error) {
            console.error('Error retrieving flight search results from Redis:', error);
            error.message = 'Error retrieving flight search results from Redis';
            error.errorCode = 'redis_err';
            return next(error);
        }
    }

    //Function to get detailed flight information of the flight that the user selected
    async function getFlightBookingInfo(flightSearchResult, flightId) {
        try {
            const flightsResult = flightSearchResult.flightsResult;
            const flightInfo = flightsResult.find(flight => flight.id === flightId.toString());
            return flightInfo;

        } catch (error) {
            console.error('Error processing flight information in Redis:', error);
            error.message = 'Error processing flight search information in Redis';
            error.errorCode = 'redis_err';
            return next(error);
        }
    }

    //Function to temporarily store detailed flight indo in Redis and create journey continuation ID for frontend
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
            error.message = 'Error processing flight search information in Redis';
            error.errorCode = 'redis_err';
            return next(error);
        }
    }

    //Immediately invoked function expressions - to run all the functions above in a modular way
    (async () => {
        try {
            //Get the flight search results of the search performed by user on that day
            const flightSearchResult = await retrieveFlightsResult();

            //Get booking information of the flight that the user selected
            const flightInfo = await getFlightBookingInfo(flightSearchResult, flightId);

            const flightBookingInfo = {
                originLocation: flightSearchResult.originLocation,
                destinationLocation: flightSearchResult.destinationLocation,
                travelerInfo: flightSearchResult.travelerInfo,
                flightInfo: flightInfo,
                dictionaries: flightSearchResult.dictionaries,
                airportMetadata: flightSearchResult.airportMetadata
            };

            //Store booking information in Redis for future reference and create a unique identifier for this search result
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

        } catch (error) {
            error.message = 'Error retrieving flight search results';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();

}

exports.getAirportMetadata = (req, res, next) => {

    async function getAirportsData() {
        try {
            const airports = await Airport.find();
            return airports;
        }
        catch(err) {
            return next(err);
        }
    }


    (async () => {
        try {
            const airportMetadata = await getAirportsData();

            res.status(201).json({
                message: 'Airports information retrieved successfully!',
                airportMetadata: airportMetadata
            });

        } catch (error) {
            error.message = 'Error retrieving airports information';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();
}

exports.getSightSeeingActivities = (req, res, next) => {
    const city = req.body.city;
    const state = req.body.state;
    const countryCode = req.body.countryCode;
    const iataCode = req.body.iataCode;
    const type = req.body.type;
    const radius = "10000";

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    async function getCityGeographicDetails(city, countryCode) {
        try {
            
            const existingCity = await City.findOne({iataCode: iataCode});

            if(existingCity) {
                return existingCity;
            }
            else {
                const citiesResponse = await amadeus.referenceData.locations.cities.get({
                    keyword: city,
                    countryCode: countryCode
                });

                const locations = citiesResponse.data;

                locations.forEach(location => {
                    if (location.iataCode === iataCode) {
                        const cityDetails = new City({
                            iataCode:location.iataCode,
                            name:location.name,
                            countryCode:location.address.countryCode,
                            cityCode:location.cityCode,
                            stateCode:location.address.stateCode,
                            geoCode: {
                                latitude: location.geoCode.latitude,
                                longitude: location.geoCode.longitude
                            },
                            type:location.type,
                            subType:location.subType
                        });
                        cityDetails.save();

                        return cityDetails;
                    }
                });
            }

        }
        catch(error) {
            error.message = "Error processing cities information in database";
            error.errorCode = "database_read_err";
            return next(error);
        }
    }

    async function getSightsRecommendations(city, type, radius) {

        try {
            const latitude = city.geoCode.latitude.toString();
            const longitude = city.geoCode.longitude.toString();

            const location = latitude + " " + longitude;

            const response = await axios.get(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radius}&type=${type}&rankby=prominence&key=${places_nearbysearch_api}`
            );

            //console.log(response);
            
            const next_page_token = response.next_page_token;

            const next_page_response = await axios.get(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${next_page_token}&key=${places_nearbysearch_api}`
            );

            const results = response.data.results;

            
            results.push(...next_page_response.data.results)
            
            //console.log(results);
            return results;
        }
        catch (err) {
            return next(err);
        }
        
    }

    async function storeSightsRecommendations(sightsSearchResults) {
        try {
            let now = Date.now();
            let today = now - (now % 86400000)
            const userId = req.userId;
            const client = await redisConnect;
            const key = 'sightseeingsearch_' + userId + '_' + now;
            
            await client.set(key, JSON.stringify(sightsSearchResults));
            await client.expire(key, 900);
            console.log('Sightseeing search results stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Sightseeing Search");

            return encrypted;
        }
        catch (err) {
            return next(err);
        }
    }

    (async () => {
        try {
            const cityDetails = await getCityGeographicDetails(city, countryCode);

            const sightsSearchResults = await getSightsRecommendations(cityDetails, type, radius);

            //console.log(sightsSearchResults.length);

            const searchContinuationId = await storeSightsRecommendations(sightsSearchResults);

            res.status(201).json({
                message: 'Sightseeing results retrieved successfully!',
                searchContinuationId: searchContinuationId.toString(),
                sightseeingType: type,
                sightsSearchResults: sightsSearchResults
            });

        } 
        catch (error) {
            error.message = 'Error retrieving sightseeing search results. Please try again!';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();

};

exports.selectSightSeeingActivity = (req, res, next) => {
    const searchContinuationId = req.body.searchContinuationId;
    const placeId = req.body.placeId;
    const userId = req.userId;

    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.errorCode = "client_err";
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    async function getSightsSearchKey(searchContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(searchContinuationId, "VacayBuddy Sightseeing Search");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
            console.log(decryptedKey);
            return decryptedKey;

        }
        catch(error) {

        }
    }

    async function getPlaceDetails(sightsSearchKey, placeId) {
        try {
            const client = await redisConnect;

            const sightsSearchResultsStr = await client.get(sightsSearchKey);

            //Check if sight seeing search results have expired in Redis
            if(sightsSearchResultsStr === undefined || sightsSearchResultsStr == null) {
                error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                return next(error);
            }
            //Parse it in JSON format
            const sightsSearchResults = await JSON.parse(sightsSearchResultsStr);

            const placeDetails = sightsSearchResults.find(sight => sight.place_id === placeId.toString());

            return placeDetails;
        }
        catch(error) {
            error.message = 'Error retrieving sightseeing search information from Redis';
            error.errorCode = 'redis_err';
            return next(error);
        }
    }

    async function getPlaceAdditionalDetails(placeId) {
        try {
            console.log(placeId);
            const placeAdditionalDetails = await axios.get(
                `https://maps.googleapis.com/maps/api/place/details/json?fields=name%2Crating%2Cformatted_phone_number%2Caddress_components%2Cphoto%2Curl%2Cvicinity%2Cuser_ratings_total&place_id=${placeId}&key=${places_nearbysearch_api}`
            );

            return placeAdditionalDetails.data.result;
        }
        catch(error) {
            error.message = 'Error retrieving sightseeing search information from Redis';
            error.errorCode = 'redis_err';
            return next(error);
        }
    }

    async function getPlacePhoto(placeDetails, placeAdditionalDetails) {
        try {

            const primary_photo_reference = placeDetails.photos[0].photo_reference;
            const placePrimaryPhoto = await axios.get(
                `https://maps.googleapis.com/maps/api/place/photo?maxheight=400&maxwidth=500&photo_reference=${primary_photo_reference}&key=${places_nearbysearch_api}`,
                { responseType: 'stream' }
            );  

            const fileName = `${placeDetails.place_id}.jpg`;

            const filePath = path.join(__dirname, '../images', fileName);

            // Create a writable stream to save the photo
            const writer = fs.createWriteStream(filePath);

            // Pipe the photo stream to the writable stream
            placePrimaryPhoto.data.pipe(writer);

            // Return a promise to indicate when the photo is saved successfully
            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

        }
        catch(error) {
            error.message = 'Server error';
            error.errorCode = 'api_response_err';
            return next(error);
        }
    }

    (async () => {
        try {
            const key = await getSightsSearchKey(searchContinuationId);

            const placeDetails = await getPlaceDetails(key, placeId);

            console.log("Hello");

            const placeAdditionalDetails = await getPlaceAdditionalDetails(placeId);

            await getPlacePhoto(placeDetails, placeAdditionalDetails);

            res.status(201).json({
                message: 'Sightseeing results retrieved successfully!',
                placeDetails: placeDetails,
                placeAdditionalDetails: placeAdditionalDetails
            });

        } catch (error) {
            error.message = 'Error retrieving sightseeing search results. Please try again!';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();
};



