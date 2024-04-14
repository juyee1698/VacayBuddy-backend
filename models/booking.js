const mongoose = require('mongoose');
const { redisConnect } = require('../util/redis');
// const { strike } = require('../util/path');

const Schema = mongoose.Schema;

const bookingSchema = new Schema({
    userId:{
        type:Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    bookingDate:{
        type:Date,
        required:true
    },
    bookingTypeId:{
        type:Schema.Types.ObjectId,
        ref:'BookingType',
        required:true
    },
    flightReservationId:{
        type:Schema.Types.ObjectId,
        ref:'FlightBooking',
        validate: [
            function() {
                return !(this.flightReservationId && this.sightsReservationId);
            },
            'Only one of flightReservationId or sightsReservationId should be provided'
        ]
    },
    sightsReservationId:{
        type:Schema.Types.ObjectId,
        ref:'SightsBooking',
        validate: [
            function() {
                return !(this.flightReservationId && this.sightsReservationId);
            },
            'Only one of flightReservationId or sightsReservationId should be provided'
        ]
    },
    status:{
        type:String,
        required:true
    },
    paymentId:{
        type:Schema.Types.ObjectId,
        ref:'Payments',
        required:true
    }
    
}, 
{   
    timestamps:true
});



module.exports=mongoose.model('Booking', bookingSchema);