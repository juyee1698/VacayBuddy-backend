const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Log = require('../models/log');
const LogDetail = require('../models/logDetail');
const EventType = require('../models/eventType');
const EventParameter = require('../models/eventParameter');
const Booking = require('../models/booking');
const BookingType = require('../models/bookingType');
const Payment = require('../models/payments');
const Airport = require('../models/airport');
const City = require('../models/city');
const CityMetadata = require('../models/cityMetadata');
const { redisConnect } = require('../util/redis');

//Controller function for user sign up
exports.postSignup = (req, res, next) => {
    //Get registration input parameters from client
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const confirmPassword = req.body.confirmPassword;
    
    //Handle server validation errors
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error('Server Validation failed.');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    async function storeUserInfo() {
        try {
            //Hash the password using bcrypt library
            const hashedPasswd = await bcrypt.hash(password,12);
            //Save the user
            const user = new User({
                name:name,
                email:email,
                password:hashedPasswd,
                imageUrl:'images/user/profile.jpg',
                city:'',
                country:'',
                address:'',
                phoneno:0,
                postal:0
            });
            return user.save();
        }
        catch(error) {
            console.log('Error in registering the user: ', error);
            error.message = 'Error in registering the user. Please try again!';
            error.errorCode = 'database_cud_err'
            throw error;
        }
    }

    (async () => {
        try {
            const user = await storeUserInfo();

            res.status(201).json({
                message: 'User created successfully!',
                flag: true,
                result: user
            });

        } catch (error) {
            console.error('Error in registering the user: ', error);
            if(!error.errorCode) {
                error.message = 'Error in the registration process. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

};

//Controller function for user login
exports.login = (req, res, next) => {
    const email = req.body.email;
    const password = req.body.password;
    let loadedUser;

    async function checkUserInfo() {
        try {
            const user = await User.findOne({email: email});

            if(!user) {
                const error = new Error('Sorry, A user with this email could not be found!');
                error.statusCode = 401;
                error.errorCode = 'auth_err';
                throw error;
            }
            else {
                return user;
            }
        }
        catch(error) {
            console.log('Error in user login: ', error);
            throw error;
        }
    }

    async function generateToken(user) {
        try {
            const isEqual = await bcrypt.compare(password, user.password);

            if(!isEqual) {
                const error = new Error('Sorry, wrong password entered!');
                error.statusCode = 401;
                error.errorCode = 'auth_err';
                throw error;
            }
            else {
                loadedUser = user;               
                const token = jwt.sign({
                        email: loadedUser.email,
                        userId: loadedUser._id.toString()
                    },
                    'somesuperprojectsecret',
                    {expiresIn: '1h'}
                );

                return token;
            }
        }
        catch(error) {
            console.log('Error in generating token for login session: ', error);
            if(!error.errorCode) {
                error.message = 'Error in generating token for login session';
                error.errorCode = 'internal_server_err';
            }
            throw error;
        }
    }

    async function storeLogs(user) {
        try {
            const eventType = await EventType.findOne({eventTemplate:'user_login'});
            const eventTypeId = eventType._id;
            const userId = user._id;
            let now = Date.now();

            const log = new Log({
                userId: userId,
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

    async function retrieveUserFlightSearchLogs(user) {
        try {
            const userId = user._id;

            //Flight search logs
            const eventType = await EventType.findOne({eventTemplate:'flight_search'});
            const eventTypeId = eventType._id;
            const flightSearchLogs = await Log.find({userId: userId, eventTypeId: eventTypeId}).sort({'createdAt':-1}).limit(3);

            let formattedFlightSearchLogs = [];
            for(const log of flightSearchLogs) {
                const logDetails = await LogDetail.find({logId:log._id});
                let originAirportMetadata;
                let destinationAirportMetadata;
                for(const logDetail of logDetails) {
                    const eventParameter = await EventParameter.findOne({_id:logDetail.eventParameterId});
                    const eventParameterAttribute = eventParameter.attribute;
                    
                    if(eventParameterAttribute=='originAirport') {
                        originAirportMetadata = await Airport.findOne({_id:logDetail.value});
                    }
                    if(eventParameterAttribute=='destinationAirport') {
                        destinationAirportMetadata = await Airport.findOne({_id:logDetail.value});
                    }
                };
                // console.log(originAirportMetadata);
                formattedFlightSearchLogs.push({
                    logId: log._id.toString(),
                    activity: 'flight_search',
                    originAirportMetadata: originAirportMetadata,
                    destinationAirportMetadata: destinationAirportMetadata
                });
            };

            //Remove duplicate entries
            const uniqueIds = new Set();
            let combinedStr;
            const result = [];
            for (const log of formattedFlightSearchLogs) {
                combinedStr = log.originAirportMetadata._id.toString() + '_' + log.destinationAirportMetadata._id.toString();
                if (!uniqueIds.has(combinedStr)) {
                    uniqueIds.add(combinedStr);
                    result.push(log);
                }
            }
            return result;

        }
        catch(error) {
            console.log('Error in retrieving user flight search logs: ', error);
            error.message = 'Error in retrieving user flight search logs';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    async function retrieveUserFlightBookingLogs(user) {
        try {
            const userId = user._id;

            //Flight booking logs
            const eventType = await EventType.findOne({eventTemplate:'flight_booking'});
            const eventTypeId = eventType._id;
            const flightBookingLogs = await Log.find({userId: userId, eventTypeId: eventTypeId}).sort({'createdAt':-1}).limit(3);

            let formattedFlightBookingLogs = [];
            for(const log of flightBookingLogs) {
                const logDetails = await LogDetail.find({logId:log._id});
                let bookingInfo;
                let paymentInfo;
                for(const logDetail of logDetails) {
                    const eventParameter = await EventParameter.findOne({_id:logDetail.eventParameterId});
                    const eventParameterAttribute = eventParameter.attribute;
                    
                    if(eventParameterAttribute==='bookingId') {
                        bookingInfo = await Booking.find({_id:logDetail.value});
                    }
                    if(eventParameterAttribute==='paymentId') {
                        paymentInfo = await Payment.find({_id:logDetail.value});
                    }
                };
                formattedFlightBookingLogs.push({
                    logId: log._id.toString(),
                    activity: 'flight_booking',
                    bookingInfo: bookingInfo,
                    paymentInfo: paymentInfo
                });
            };

            return formattedFlightBookingLogs;

        }
        catch(error) {
            console.log('Error in retrieving user flight booking logs: ', error);
            error.message = 'Error in retrieving user flight booking logs';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    async function retrieveUserSightSearchLogs(user) {
        try {
            const userId = user._id;

            const eventType = await EventType.findOne({eventTemplate:'sightseeing_search'});
            const eventTypeId = eventType._id;
            const sightSearchLogs = await Log.find({userId: userId, eventTypeId: eventTypeId}).sort({'createdAt':-1}).limit(5);
            
            let formattedSightLogs = [];
            for(const log of sightSearchLogs) {
                const logDetails = await LogDetail.find({logId:log._id});
                let cityInfo;
                for(const logDetail of logDetails) {
                    const eventParameter = await EventParameter.findOne({_id:logDetail.eventParameterId});
                    const eventParameterAttribute = eventParameter.attribute;
                    
                    if(eventParameterAttribute==='cityMetadataId') {
                        cityInfo = await CityMetadata.findOne({_id:logDetail.value});
                    }
                };
                formattedSightLogs.push({
                    logId: log._id.toString(),
                    activity: 'sightseeing_search',
                    cityInfo: cityInfo
                });
            };
            
            //Remove duplicate entries
            const uniqueIds = new Set();
            const result = [];
            for (const log of formattedSightLogs) {
                if (!uniqueIds.has(log.cityInfo._id.toString())) {
                    uniqueIds.add(log.cityInfo._id.toString());
                    result.push(log);
                }
            }

            return result;
        }
        catch(error) {
            console.log('Error in retrieving user sightseeing search logs: ', error);
            error.message = 'Error in retrieving user sightseeing search logs';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    async function retrieveUserPlaceSearchLogs(user) {
        try {
            const userId = user._id;

            const eventType = await EventType.findOne({eventTemplate:'place_detailed_search'});
            const eventTypeId = eventType._id;
            const placeDetailedSearchLogs = await Log.find({userId: userId, eventTypeId: eventTypeId}).sort({'createdAt':-1}).limit(5);

            let formattedPlaceLogs = [];
            for(const log of placeDetailedSearchLogs) {
                const logDetails = await LogDetail.find({logId:log._id});
                let placeId;
                let placeName;
                let placeAddress;
                let placePhotoReference;
                for(const logDetail of logDetails) {
                    const eventParameter = await EventParameter.findOne({_id:logDetail.eventParameterId});
                    const eventParameterAttribute = eventParameter.attribute;
                    if(eventParameterAttribute==='placeId') {
                        placeId = logDetail.value;
                    }
                    if(eventParameterAttribute==='placeName') {
                        placeName = logDetail.value;
                    }
                    if(eventParameterAttribute==='placeAddress') {
                        placeAddress = logDetail.value;
                    }
                    if(eventParameterAttribute==='placePhotoReference') {
                        placePhotoReference = logDetail.value;
                    }
                };
                formattedPlaceLogs.push({
                    logId: log._id.toString(),
                    activity: 'place_detailed_search',
                    placeId: placeId,
                    placeName: placeName,
                    placeAddress: placeAddress,
                    placePhotoPath: 'images/'+ placeId,
                    placePhotoReference: placePhotoReference
                });
            };
            //Remove duplicate entries
            const uniqueIds = new Set();
            const result = [];
            for (const log of formattedPlaceLogs) {
                if (!uniqueIds.has(log.placeId)) {
                    uniqueIds.add(log.placeId);
                    result.push(log);
                }
            }
            return result;
        }
        catch(error) {
            console.log('Error in retrieving place detailed search logs: ', error);
            error.message = 'Error in retrieving place detailed search logs';
            error.errorCode = 'internal_server_err';
            throw error;
        }
    }

    (async () => {
        try {
            //Validate user login information
            const user = await checkUserInfo();

            //Get JWT token
            const token = await generateToken(user);

            //Get user's past activity from logs
            const flightSearchLogs = await retrieveUserFlightSearchLogs(user);
            const flightBookingLogs = await retrieveUserFlightBookingLogs(user);
            const sightSearchLogs = await retrieveUserSightSearchLogs(user);
            const placeDetailedSearchLogs = await retrieveUserPlaceSearchLogs(user);

            //Store user login activity
            await storeLogs(user);

            res.status(200).json({
                token: token,
                userId: loadedUser._id.toString(),
                name: loadedUser.name.toString(),
                flightSearchLogs,
                sightSearchLogs,
                placeDetailedSearchLogs,
                flightBookingLogs
            });

        } catch (error) {
            if(!error.errorCode) {
                error.message = 'Error in the login process. Please try again!';
                error.errorCode = 'internal_server_err';
            }
            return next(error);
        }
    })();

};

exports.logout = (req, res, next) => {
    const authHeader = req.get('Authorization');
    const token = authHeader.split(' ')[1];
    //const token = 'sometoken';
    let tokensArray;
    let updatedTokens;
    let rclient;
    redisConnect
        .then(client => {
            rclient = client;
            return rclient.get('blacklisttokens');
        })
        .then(tokensArr => {
            tokensArray = JSON.parse(tokensArr);
            tokensArray.push(token);
            updatedTokens = JSON.stringify(tokensArray);
            return rclient.set('blacklisttokens', updatedTokens);
            
        })
        .then(output => {
            res.status(200).json({
                status: "logout",
                message: "Token has been blacklisted"
            });
        })
        .catch(err => {
            console.log('Token does not exist');
            next(err);
        })
};