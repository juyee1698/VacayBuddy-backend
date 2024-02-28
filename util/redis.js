require('dotenv').config();
const redis = require('redis');

// const client = redis.createClient({
//     url: process.env.redis_port
// });
const client = redis.createClient({
    password: process.env.redis_password,
    socket: {
        host: process.env.redis_host,
        port: process.env.redis_port
    }
});

const redisConnect = 
    client.connect()
    .then(result => {
        console.log('Connected to redis from here');
        // callback();
        return client;
    })
    .catch(err => {
        console.log(err);
        throw err;
    });


exports.redisConnect = redisConnect;