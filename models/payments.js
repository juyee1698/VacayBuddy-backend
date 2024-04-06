const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const paymentSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    bookingTypeId:{
        type:Schema.Types.ObjectId,
        ref:'BookingType',
        required:true
    },
    paymentDate:{
        type:Date,
        required:true
    },
    paymentAmount:{
        type:Number,
        required:true
    },
    currencyId:{
        type:Schema.Types.ObjectId,
        ref:'Currency',
        required:true
    },
    paymentStatus:{
        type:String,
        required:true
    },
    paymentMethodTypes:{
        type:Array,
        required:true
    },
    userBookingInfo: {
        userName: {
            type:String,
            required:true
        },
        userEmail: {
            type:String,
            required:true
        },
        userMailingAddress: {
            type:String,
            required:true
        },
        userCity: {
            type:String,
            required:true
        },
        userState: {
            type:String
        },
        userCountry: {
            type:String,
            required:true
        },
        userPostalCode: {
            type:String,
            required:true
        },
        userPhoneNo: {
            type:String,
            required:true
        }
    },
    stripeTransactionId:{
        type:String,
        required: true
    }
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('Payments', paymentSchema);