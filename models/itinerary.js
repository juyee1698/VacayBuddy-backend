const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const itinerarySchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    name:{
        type:String,
        required:true
    },
    description:{
        type:String,
        required:true
    },
    itinerarySegments: [
        {
            date: {
                type:Date
            },
            placeId: {
                type:String
            },
            placeName: {
                type:String
            },
            placeAddress: {
                type:String
            }
        }
    ],
    startDate:{
        type:Date,
        required:true
    },
    endDate:{
        type:Date,
        required:true
    },
    tags:{
        type:Array
    }
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('Itinerary', itinerarySchema);