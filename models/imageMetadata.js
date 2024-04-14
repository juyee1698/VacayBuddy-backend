const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
const { strike } = require('../util/path');
    
const Schema = mongoose.Schema;
    
const imageMetadataSchema = new Schema({
    name:{
        type:String,
        required:true
    },
    path:{
        type:String,
        required:true
    }
});
    
module.exports=mongoose.model('ImageMetadata', imageMetadataSchema);