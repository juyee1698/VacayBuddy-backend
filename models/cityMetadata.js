const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
const { strike } = require('../util/path');
    
const Schema = mongoose.Schema;
    
const cityMetadataSchema = new Schema({
    name:{
        type:String,
        required:true
    },
    country:{
        type:String,
        required:true
    },
    countryCode:{
        type:String,
        required:true
    },
    iataCode:{
        type:String,
        required:true
    }
});
    
module.exports=mongoose.model('CityMetadata', cityMetadataSchema);