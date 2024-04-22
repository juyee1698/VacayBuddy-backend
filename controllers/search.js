require('dotenv').config();
var Amadeus = require('amadeus');
const { validationResult } = require('express-validator');
const isAuth = require('../middleware/is-auth');
const { redisConnect } = require('../util/redis');

const User = require('../models/user');
const Airport = require('../models/airport');
const City = require('../models/city');
const CityMetadata = require('../models/cityMetadata');
const FlightBooking = require('../models/flightBooking');
const Booking = require('../models/booking');
const BookingType = require('../models/bookingType');
const Payment = require('../models/payments');
const Currency = require('../models/currency');
const FileType = import('file-type');
const Log = require('../models/log');
const LogDetail = require('../models/logDetail');
const EventType = require('../models/eventType');
const EventParameter = require('../models/eventParameter');
const ImageMetadata = require('../models/imageMetadata');
const Review = require('../models/review');
const Rating = require('../models/rating');

const CryptoJS = require('crypto-js');
const { decrypt } = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ConnectionStates } = require('mongoose');
const stockPhotoPath = './images/stock_photo.jpg';

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
            if(err.errorCode === 'database_read_err') {
                throw err;
            }
            else {
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
            console.log('Error storing flight results in Redis: ', error);
            error.message = 'Error storing flight results in Redis';
            error.errorCode = 'redis_err';
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'flight_search'});
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
            console.log('Error in storing user flight search logs: ', error);
            error.message = 'Error in storing user flight search logs';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function storeLogDetails(logId, originLocation, destinationLocation) {
        try {
            const originAirportMetadata = await Airport.findOne({iataCode: originLocation});
            const originAirportMetadataId = originAirportMetadata._id;

            const originAirportMetadataEventParameter = await EventParameter.findOne({attribute:'originAirport'});
            const originAirportMetadataEventParameterId = originAirportMetadataEventParameter._id;

            const originAirportLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: originAirportMetadataEventParameterId,
                value: originAirportMetadataId.toString()
            });
            originAirportLogDetail.save();

            const destinationAirportMetadata = await Airport.findOne({iataCode: destinationLocation});
            const destinationAirportMetadataId = destinationAirportMetadata._id;

            const destinationAirportMetadataEventParameter = await EventParameter.findOne({attribute:'destinationAirport'});
            const destinationAirportMetadataEventParameterId = destinationAirportMetadataEventParameter._id;

            const destinationAirportLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: destinationAirportMetadataEventParameterId,
                value: destinationAirportMetadataId.toString()
            });
            destinationAirportLogDetail.save();

        }
        catch(error) {
            console.log('Error in storing log details: ', error);
            error.message = 'Error in storing log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    (async () => {
        try {
            const flights = await processFlightOffers();
            await storeFlightResults(flights);

            //Store flight search activity logs
            const logId = await storeLogs();
            storeLogDetails(logId, flights.originLocation, flights.destinationLocation)

            res.status(201).json({
                message: 'Flight results retrieved successfully!',
                ...flights
            });
        } catch (error) {
            console.error('Error retrieving flight search results:', error);
            if(!error.errorCode) {
                error.message = 'Error retrieving flight search results';
                error.errorCode = 'internal_server_err';
            }
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
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }

            //Parse flight search results in JSON format
            const flightSearchResult = await JSON.parse(flightSearchResultStr);

            return flightSearchResult;

        } catch (error) {
            console.error('Error retrieving flight search results from Redis:', error);

            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                error.message = 'Error retrieving flight search results from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
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
            throw error;
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
            error.message = 'Error storing flight booking information in Redis';
            error.errorCode = 'redis_err';
            throw error;
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
            console.log('Error retrieving flight detailed results: ', error);
            if(!error.errorCode) {
                error.message = 'Error retrieving flight detailed results';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

}

//Controller function to get airport metadata from database for flight search autocomplete on frontend
exports.getAirportMetadata = (req, res, next) => {

    async function getAirportsData() {
        try {
            const airports = await Airport.find();
            return airports;
        }
        catch(err) {
            throw err;
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
            console.log('Error retrieving airports information: ', error);
            error.message = 'Error retrieving airports information';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();
}

//Controller function to get city metadata from database for sightseeing search autocomplete on frontend
exports.getCityMetadata = (req, res, next) => {

    async function getCityData() {
        try {
            const cityMetadata = await CityMetadata.find();
            return cityMetadata;
        }
        catch(err) {
            throw err;
        }
    }

    (async () => {
        try {
            const cityMetadata = await getCityData();

            res.status(201).json({
                message: 'Cities information retrieved successfully!',
                cityMetadata: cityMetadata
            });

        } catch (error) {
            console.log('Error retrieving cities information: ', error);
            error.message = 'Error retrieving cities information';
            error.errorCode = 'internal_server_err';
            return next(error);
        }
    })();
}

//Controller function to get sightseeing search results based on city
exports.getSightSeeingActivities = (req, res, next) => {
    const city = req.body.city;
    //const state = req.body.state;
    const country = req.body.country;
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

    //Function to get city's coordinates and geographic details
    async function getCityGeographicDetails(city, countryCode) {
        try {
            
            //Check if city's information already exists in database
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
                let cityDetails;

                locations.forEach(location => {
                    if (location.iataCode === iataCode) {
                        //Create city object to store
                        cityDetails = new City({
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
                    }
                });
                
                return cityDetails;
            }

        }
        catch(error) {
            console.log('Error processing cities information in database: ', error);
            error.message = 'Error processing cities information in database';
            error.errorCode = 'database_read_err';
            throw error;
        }
    }

    //Function to get sightseeing recommendations in a city within a radius
    async function getSightsRecommendations(city, type, radius) {

        try {
            const latitude = city.geoCode.latitude.toString();
            const longitude = city.geoCode.longitude.toString();
            const location = latitude + " " + longitude;

            //Use Google Places API to get local sightseeing recommendations
            const response = await axios.get(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&radius=${radius}&type=${type}&rankby=prominence&key=${places_nearbysearch_api}`
            );
            
            //Get all the paginated data from the API response
            const next_page_token = response.next_page_token;

            const next_page_response = await axios.get(
                `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${next_page_token}&key=${places_nearbysearch_api}`
            );

            const results = response.data.results;

            //Merge the paginated data
            results.push(...next_page_response.data.results)
            
            return results;
        }
        catch (error) {
            console.log('Error in retrieving response from Google Places API: ', error);
            error.message = "Error in retrieving response from Google Places API";
            error.errorCode = "api_response_err";
            throw error;
        }
        
    }

    //Store sightseeing recommendations temporarily in Redis and create a search continuation ID to track it
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
        catch (error) {
            console.log('Error storing sightseeing search information in Redis:', error);
            error.message = 'Error storing sightseeing search information in Redis';
            error.errorCode = 'redis_err';
        }
    }

    //Function to get sightseeing place's primary photo and save it locally
    async function getPlacePhoto(photo, placeId) {
        try {
            const directory = path.join(__dirname, `../images/${placeId}`);

            //Check if directory of that place exists 
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory);
                const fileName = `primary.jpg`;
                const filePath = path.join(__dirname, `../images/${placeId}`, fileName);

                if(photo) {
                    const primary_photo_reference = photo.photo_reference;
                    const placePrimaryPhoto = await axios.get(
                        `https://maps.googleapis.com/maps/api/place/photo?maxheight=400&maxwidth=500&photo_reference=${primary_photo_reference}&key=${places_nearbysearch_api}`,
                        { responseType: 'stream' }
                    ); 
                    
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
                else {
                    const reader = fs.createReadStream(stockPhotoPath);
                    const writer = fs.createWriteStream(filePath);
                    reader.pipe(writer);
                    return new Promise((resolve, reject) => {
                        reader.on('error', reject);
                        writer.on('error', reject);
                        writer.on('finish', resolve);
                    });
                }
            }

        }
        catch(error) {
            console.log('Error in retrieving place primary photo from Google Places API: ', error);
            error.message = 'Error in retrieving place primary photo from Google Places API';
            error.errorCode = 'api_response_err';
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'sightseeing_search'});
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
            console.log('Error in storing user log: ', error);
            error.message = 'Error in storing user log';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function storeLogDetails(logId, iataCode) {
        try {
            const cityMetadata = await CityMetadata.findOne({iataCode: iataCode});
            const cityMetadataId = cityMetadata._id;

            const cityMetadataEventParameter = await EventParameter.findOne({attribute:'cityMetadataId'});
            const cityMetadataEventParameterId = cityMetadataEventParameter._id;

            const cityLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: cityMetadataEventParameterId,
                value: cityMetadataId.toString()
            });
            cityLogDetail.save();

        }
        catch(error) {
            console.log('Error in storing log details: ', error);
            error.message = 'Error in storing log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    //Immediately invoked function expression - run all the above modular functions
    (async () => {
        try {
            const cityDetails = await getCityGeographicDetails(city, countryCode);

            const sightsSearchResults = await getSightsRecommendations(cityDetails, type, radius);

            const searchContinuationId = await storeSightsRecommendations(sightsSearchResults);

            // let photo;
            // for(const sight of sightsSearchResults) {
            //     if(sight.photos) {
            //         photo = sight.photos[0];
            //     }
            //     else {
            //         photo = null;
            //     }
            //     const placeId = sight.place_id;
            //     await getPlacePhoto(photo, placeId);
            // }

            const logId = await storeLogs();

            await storeLogDetails(logId, iataCode);

            res.status(201).json({
                message: 'Sightseeing results retrieved successfully!',
                searchContinuationId: searchContinuationId.toString(),
                sightseeingType: type,
                sightsSearchResults: sightsSearchResults
            });

        } 
        catch (error) {
            console.log(error);
            if(!errorCode) {
                error.message = 'Error retrieving sightseeing search results. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

};

//Controller function to get detailed information of the local sightseeing destination
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

    //Function to get user's recent sightseeing search redis key from search continuation ID
    async function getSightsSearchKey(searchContinuationId) {
        try {
            bytes = CryptoJS.AES.decrypt(searchContinuationId, "VacayBuddy Sightseeing Search");
            decryptedKey = bytes.toString(CryptoJS.enc.Utf8);
            return decryptedKey;
        }
        catch(error) {
            console.log('Error decrypting the search continuation ID: ', error);
            error.message = 'Error decrypting the search continuation ID';
            error.errorCode = 'internal_server_err';
        }
    }

    //Function to get sightseeing place details from search result based on place ID
    async function getPlaceDetails(sightsSearchKey, placeId) {
        try {
            const client = await redisConnect;

            const sightsSearchResultsStr = await client.get(sightsSearchKey);

            //Check if sight seeing search results have expired in Redis
            if(sightsSearchResultsStr === undefined || sightsSearchResultsStr == null) {
                const error = new Error('Sorry! Your search result has expired.');
                error.errorCode = 'search_result_expiry';
                throw error;
            }
            //Parse it in JSON format
            const sightsSearchResults = await JSON.parse(sightsSearchResultsStr);

            //Filter out the place details from place ID
            const placeDetails = sightsSearchResults.find(sight => sight.place_id === placeId.toString());

            return placeDetails;
        }
        catch(error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                error.message = 'Error retrieving sightseeing search information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    async function getPlaceDetailsFromAPI(placeId) {
        try {
            
             //Use the Google Place Details API
             const placeAdditionalDetails = await axios.get(
                `https://maps.googleapis.com/maps/api/place/details/json?fields=place_id%2Cname%2Cgeometry%2Crating%2Cbusiness_status%2Ccurrent_opening_hours%2Curl%2Cvicinity%2Cuser_ratings_total%2Creservable%2Ctypes&place_id=${placeId}&key=${places_nearbysearch_api}`
            );

            return placeAdditionalDetails.data.result;
        }
        catch(error) {
            if(error.errorCode === 'search_result_expiry') {
                throw error;
            }
            else {
                error.message = 'Error retrieving sightseeing search information from Redis';
                error.errorCode = 'redis_err';
                throw error;
            }
        }
    }

    //Function to get additional details of the sightseeing place
    async function getPlaceAdditionalDetails(placeId) {
        try {
            //Use the Google Place Details API
            const placeAdditionalDetails = await axios.get(
                `https://maps.googleapis.com/maps/api/place/details/json?fields=name%2Crating%2Cformatted_phone_number%2Cformatted_address%2Cphoto%2Ccurrent_opening_hours%2Curl%2Cvicinity%2Cuser_ratings_total%2Creservable&place_id=${placeId}&key=${places_nearbysearch_api}`
            );

            return placeAdditionalDetails.data.result;
        }
        catch(error) {
            console.log('Error in retrieving place additional details from Google Places API: ', error);
            error.message = "Error in retrieving place additional details from Google Places API";
            error.errorCode = "api_response_err";
            throw error;
        }
    }

    //Function to get sightseeing place's secondary photos and save it locally
    async function getPlaceAdditionalPhotos(photo, place_id, rank, noOfPhotos) {
        try {
            const directory = path.join(__dirname, `../images/${place_id}`);

            const filesWithPrefix = fs.readdirSync(directory).filter(file => file.startsWith('secondary_'));

            //Check if all the secondary photos already exist in the place directory
            if (filesWithPrefix.length < noOfPhotos) {

                const photo_reference = photo.photo_reference;
                const placePhoto = await axios.get(
                    `https://maps.googleapis.com/maps/api/place/photo?maxheight=400&maxwidth=500&photo_reference=${photo_reference}&key=${places_nearbysearch_api}`,
                    { responseType: 'stream' }
                ); 

                const fileName = `secondary_${rank}.jpg`;

                const filePath = path.join(__dirname, `../images/${place_id}`, fileName);

                // Create a writable stream to save the photo
                const writer = fs.createWriteStream(filePath);

                // Pipe the photo stream to the writable stream
                placePhoto.data.pipe(writer);

                // Return a promise to indicate when the photo is saved successfully
                return new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
            }
            
        }
        catch(error) {
            console.log('Error in retrieving place secondary photos from Google Places API: ', error);
            error.message = 'Error in retrieving place secondary photos from Google Places API';
            error.errorCode = 'api_response_err';
            throw error;
        }
    }

    //Function to store photos metadata
    async function storePhotosMetadata(placeId) {
        try {
            const photoInfo = await ImageMetadata.findOne({name:placeId});

            if(!photoInfo) {
                const directory = path.join(`../images/${placeId}`);

                const photo = new ImageMetadata({
                    name: placeId,
                    path: directory.toString()
                });

                return photo.save();
            }   
        }
        catch(error) {
            console.log('Error in storing image metadata in database: ', error);
            error.message = 'Error in storing image metadata in database';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    //Function to temporarily store detailed sightseeing info in Redis
    async function storeSightseeingDetails(placeDetails, placeAdditionalDetails) {
        try {
            let now = Date.now();
            const userId = req.userId;
            const placeId = placeDetails.place_id;

            const client = await redisConnect;
            const key = 'sightseeingdetails_' + userId + '_' + placeId.toString() + '_' + now;
            
            const placeFullDetails = {
                place_id: placeDetails.place_id,
                business_status: placeDetails.business_status,
                geometry: placeDetails.geometry,
                icon: placeDetails.icon,
                icon_background_color: placeDetails.icon_background_color,
                icon_mask_base_uri: placeDetails.icon_mask_base_uri,
                name: placeDetails.name,
                opening_hours: placeDetails.opening_hours,
                photos: placeDetails.photos,
                plus_code: placeDetails.plus_code,
                rating: placeDetails.rating,
                reference: placeDetails.reference,
                scope: placeDetails.scope,
                types: placeDetails.types,
                user_ratings_total: placeDetails.user_ratings_total,
                vicinity: placeDetails.vicinity,
                formatted_address: placeAdditionalDetails.formatted_address,
                formatted_phone_number: placeAdditionalDetails.formatted_phone_number,
                additionalPhotos: placeAdditionalDetails.photos,
                url: placeAdditionalDetails.url
            };

            await client.set(key, JSON.stringify(placeFullDetails));
            await client.expire(key, 900);
            console.log('Sightseeing detailed information stored in Redis:', key);

            var encrypted = CryptoJS.AES.encrypt(key, "VacayBuddy Sightseeing Search");
            var recommendation = await getRecommendations(key, placeFullDetails.types)
            return {
                encrypted,
                placeFullDetails,
                recommendation
            }

        } catch (error) {
            console.log('Error storing sightseeing information in Redis: ',error);
            error.message = 'Error storing sightseeing information in Redis';
            error.errorCode = 'redis_err';
            throw error;
        }
    }

    //Get place accumulated average rating
    async function getRatings() {
        try {
            const placeRatings = await Rating.find({placeId: placeId});

            let accumulatedRating = 0;
            let count = 0;
            let avgRating = 0;

            if(placeRatings.length>0) {
                placeRatings.forEach(ratingObj => {
                    accumulatedRating+=parseInt(ratingObj.rating);
                    count+=1;
                });
                avgRating = accumulatedRating/(placeRatings.length);
    
                return {
                    avgRating: avgRating,
                    countRatings: placeRatings.length
                };
            }
            else {
                return {
                    avgRating: 0,
                    countRatings: placeRatings.length
                };
            }
        }
        catch(error) {
            console.log('Error retrieving place ratings: ',error);
            error.message = 'Error retrieving place ratings';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    //Get place reviews
    async function getReviews() {
        try {
            const placeReviews = await Review.find({placeId: placeId});

            if(placeReviews) {
                const formattedReviews = placeReviews.map(review => {
                    return {
                        rating: review.rating,
                        summary: review.summary,
                        review: review.review
                    };
                });
    
                return formattedReviews;
            }
            else {
                return null;
            }
        }
        catch(error) {
            console.log('Error retrieving place ratings: ',error);
            error.message = 'Error retrieving place ratings';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

    async function getUserRating() {
        try {
            const userRating = await Rating.findOne({placeId: placeId, userId: userId});

            return userRating;
        }
        catch(error) {
            console.log('Error retrieving user rating for this place: ',error);
            error.message = 'Error retrieving user rating for this place';
            error.errorCode = 'redis_err';
            throw error;
        }
    }

    async function getUserReview() {
        try {
            const userReview = await Review.findOne({placeId: placeId, userId: userId});

            return userReview;
        }
        catch(error) {
            console.log('Error retrieving user review for this place: ',error);
            error.message = 'Error retrieving user review for this place';
            error.errorCode = 'redis_err';
            throw error;
        }
    }

    async function storeLogs() {
        try {
            const eventType = await EventType.findOne({eventTemplate:'place_detailed_search'});
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

    async function storeLogDetails(logId, placeFullDetails) {
        try {
            const placeMetadataEventParameter = await EventParameter.findOne({attribute:'placeId'});
            const placeMetadataEventParameterId = placeMetadataEventParameter._id;

            const placeLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placeMetadataEventParameterId,
                value: placeFullDetails.place_id
            });
            placeLogDetail.save();

            const placeNameEventParameter = await EventParameter.findOne({attribute:'placeName'});
            const placeNameEventParameterId = placeNameEventParameter._id;

            const placeNameLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placeNameEventParameterId,
                value: placeFullDetails.name
            });
            placeNameLogDetail.save();

            const placeAddressEventParameter = await EventParameter.findOne({attribute:'placeAddress'});
            const placeAddressEventParameterId = placeAddressEventParameter._id;

            const placeAddressLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placeAddressEventParameterId,
                value: placeFullDetails.formatted_address
            });
            placeAddressLogDetail.save();

            const placePhotoEventParameter = await EventParameter.findOne({attribute:'placePhotoReference'});
            const placePhotoEventParameterId = placePhotoEventParameter._id;

            let photo_ref;
            if(placeFullDetails.photos) {
                photo_ref = placeFullDetails.photos[0].photo_reference
            }
            else {
                photo_ref = placeFullDetails.additionalPhotos[0].photo_reference
            }

            const placePhotoLogDetail = new LogDetail({
                logId: logId,
                eventParameterId: placePhotoEventParameterId,
                value: photo_ref
            });
            placePhotoLogDetail.save();

        }
        catch(error) {
            console.log('Error in storing log details: ', error);
            error.message = 'Error in storing log details';
            error.errorCode = 'database_cud_err';
            throw error;
        }
    }

 async function getRecommendations(encrypted, type) {
        try {
            const url = process.env.recommendation_url + '/get_recommendation'
            const response = await axios.post(url, {
                recommendation_id: encrypted,
                type: type
            });
            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error('Unexpected status code: ' + response.status);
            }
        }
        catch(error) {
            console.log('Error in getting similar recommendations for the sightseeing location: ', error);
            error.message = 'Error in getting similar recommendations for the sightseeing location';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }


    //Immediately invoked function expression - run all the above modular functions
    (async () => {
        try {
            let placeDetails;
            if(searchContinuationId) {
                const key = await getSightsSearchKey(searchContinuationId);
                placeDetails = await getPlaceDetails(key, placeId);
            }
            else {
                placeDetails = await getPlaceDetailsFromAPI(placeId);
            }

            const placeAdditionalDetails = await getPlaceAdditionalDetails(placeId);

            const photoInfo = await ImageMetadata.findOne({name:placeId});

            //Check the amount of photos available in places additional details object
            // const noOfPhotos = placeAdditionalDetails.photos.length;
            // let rank = 0;
            // for(const photo of placeAdditionalDetails.photos) {
            //     rank+=1;
            //     await getPlaceAdditionalPhotos(photo, placeId, rank, noOfPhotos);

            // }
            //Reading in parallel
            // await Promise.all(placeAdditionalDetails.result.photos.map(async (photo) => {
            //     const contents = await fs.readFile(file, 'utf8')
            //     console.log(contents);
            //   }));

            //Store photos metadata
            await storePhotosMetadata(placeId);

            //Store sightseeing details temporarily in Redis
            const response = await storeSightseeingDetails(placeDetails, placeAdditionalDetails);
            const detailedSearchContinuationId = response.encrypted.toString();
            const placeFullDetails = response.placeFullDetails;
            const recommendation = response.recommendation;
            const placeRatingsInfo = await getRatings();

            const placeAvgRating = placeRatingsInfo.avgRating;
            const placeTotalRatingsCount = placeRatingsInfo.countRatings;

            const placeReviews = await getReviews();

            const userRating = await getUserRating();
            const userReview = await getUserReview();

            const logId = await storeLogs();

            await storeLogDetails(logId, placeFullDetails);

            res.status(201).json({
                message: 'Sightseeing detailed information retrieved successfully!',
                detailedSearchContinuationId: detailedSearchContinuationId,
                searchContinuationId: searchContinuationId,
                placeFullDetails: placeFullDetails,
                placeAvgRating: placeAvgRating,
                placeTotalRatingsCount: placeTotalRatingsCount,
                placeReviews: placeReviews,
                userRating: userRating, 
                userReview: userReview,
                recommendation: recommendation
            });

        } catch (error) {
            console.log(error);
            if(!error.errorCode){
                error.message = 'Error retrieving sightseeing search results. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();
};