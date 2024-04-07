const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const flightBookingSchema = new Schema({
    airlineCarrierMetadata:{
        type:String,
        required:true
    },
    airportMetadata:{
        type:String,
        required:true
    },
    destinationTravelSegments:[
        {   
            duration: {
                type:String,
                required: true
            },
            departure: {
                iataCode: {
                    type:String
                },
                terminal: {
                    type:String
                },
                at: {
                    type:String
                }
            },
            arrival: {
                iataCode: {
                    type:String,
                    required:true
                },
                terminal: {
                    type:String
                },
                at: {
                    type:String
                }
            },
            carrierCode: {
                type:String
            },
            aircraftCode: {
                type:String
            }
        }
    ],
    returnTravelSegments:[
        {   
            duration: {
                type:String
            },
            departure: {
                iataCode: {
                    type:String
                },
                terminal: {
                    type:String
                },
                at: {
                    type:String
                }
            },
            arrival: {
                iataCode: {
                    type:String
                },
                terminal: {
                    type:String
                },
                at: {
                    type:String
                }
            },
            carrierCode: {
                type:String
            },
            aircraftCode: {
                type:String
            }
        }
    ],
    originLocation:{
        type:String,
        required:true
    },
    destinationLocation:{
        type:String,
        required:true
    },
    travelerInfo:{
        adults: {
            type:Number
        },
        children: {
            type:Number
        },
        infants: {
            type:Number
        },
    },
    duration:{
        destinationTrip: {
            type:String,
            required:true
        },
        returnTrip:{
            type:String,
        }
    },
    cabin:{
        type:String
    },
    price:{
        total: {
            type:String,
            required:true
        },
        base: {
            type:String,
            required:true
        },
        taxes: {
            type:String,
            required:true
        }
        
    },
    baggageAllowance:{
        destinationTrip: {
            type:String
        },
        returnTrip: {
            type:String
        }
    }
    
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('FlightBookings', flightBookingSchema);