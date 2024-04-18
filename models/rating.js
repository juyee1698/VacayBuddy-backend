const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const ratingSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    placeId:{
        type:String,
        required:true
    },
    rating:{
        type:Number,
        required:true
    }
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('Rating', ratingSchema);