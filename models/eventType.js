const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const eventTypeSchema = new Schema({
    eventTemplate:{
        type:String,
        required:true
    } 
}
);

module.exports=mongoose.model('EventType', eventTypeSchema);