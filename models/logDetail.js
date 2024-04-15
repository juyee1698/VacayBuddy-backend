const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const logDetailSchema = new Schema({
    logId:{
        type:Schema.Types.ObjectId,
        ref:'Log',
        required:true
    },
    eventParameterId:{
        type:Schema.Types.ObjectId,
        ref:'EventParameter',
        required:true
    },
    value:{
        type:String,
        required:true
    }
}
);

module.exports=mongoose.model('LogDetail', logDetailSchema);