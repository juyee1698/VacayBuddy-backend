const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const logSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    eventTypeId:{
        type:Schema.Types.ObjectId,
        ref:'EventType',
        required:true
    },
    logTime:{
        type:String,
        required:true
    }
    
},
{   
    timestamps:true
});

module.exports=mongoose.model('Log', logSchema);