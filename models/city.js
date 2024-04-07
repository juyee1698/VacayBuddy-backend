const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
const { strike } = require('../util/path');
    
const Schema = mongoose.Schema;
    
const citySchema = new Schema({
    iataCode:{
        type:String,
        required:true
    },
    name:{
        type:String,
        required:true
    },
    countryCode:{
        type:String,
        required:true
    },
    geoCode:{
        latitude: {
            type:mongoose.Types.Decimal128,
            required:true
        },
        longitude: {
            type:mongoose.Types.Decimal128,
            required:true
        }
        },
    type:{
        type:String
    },
    subType:{
        type:String
    }
});
    
module.exports=mongoose.model('City', citySchema);