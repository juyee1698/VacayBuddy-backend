const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const eventParameterSchema = new Schema({
    attribute:{
        type:String,
        required:true
    },
    dataType:{
        type:String,
        required:true
    }  
}
);

module.exports=mongoose.model('EventParameter', eventParameterSchema);