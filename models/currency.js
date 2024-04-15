const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const currencySchema = new Schema({
    currencyType:{
        type:String,
        required:true
    },
    country:{
        type:String,
        required:true
    },
    symbol:{
        type:String,
        required:true
    }
}
);


module.exports=mongoose.model('Currency', currencySchema);