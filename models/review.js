const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const reviewSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    reviewDate:{
        type:Date
    },
    placeId:{
        type:String,
        required:true
    },
    summary:{
        type:String,
        required:true
    },
    review:{
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



module.exports=mongoose.model('Review', reviewSchema);