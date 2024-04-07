const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const airportSchema = new Schema({
    iataCode:{
        type:String,
        required:true
    },
    airportName:{
        type:String,
        required:true
    },
    cityName:{
        type:String,
        required:true
    },
    countryName:{
        type:String,
        required:true
    },
    cityCode:{
        type:String,
        required:true
    },
    stateCode:{
        type:String
    },
    countryCode:{
        type:String,
        required:true
    }  
},
{   
    timestamps:true
});

module.exports=mongoose.model('Airports', airportSchema);