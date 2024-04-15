const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const bookingTypeSchema = new Schema({
    type:{
        type:String,
        required:true
    }
    
}, 
);



module.exports=mongoose.model('BookingType', bookingTypeSchema);