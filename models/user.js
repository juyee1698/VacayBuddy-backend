const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const userSchema = new Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true
    },
    password:{
        type:String,
        required:true
    },
    phoneno:{
        type:Number
    },
    postal:{
        type:Number
    },
    imageUrl:{
        type:String
    },
    address:{
        type:String
    },
    city:{
        type:String
    },
    country:{
        type:String
    },
    last_login_at:{
        type:Date,
        default: Date.now
    }
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('User',userSchema);
