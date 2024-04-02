require('dotenv').config();
const http = require('http');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const csrf = require('csurf');
const flash = require('connect-flash');
const multer = require('multer');
const redis = require('redis');
const app = express();
// Initialize Passport and restore authentication state if available

app.get('/', (req, res) => {
    res.send('Hello, World!');
  });

const adminRoutes = require('./routes/admin');
const bookingRoutes = require('./routes/booking');
const authRoutes = require('./routes/auth');
const o2authRoutes = require('./routes/o2auth_google')


//app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// app.use(multer({storage:fileStorage,fileFilter:fileFilter}).single('image'));
// app.use(express.static(path.join(__dirname,'public')));
// app.use('/images',express.static(path.join(__dirname,'images')));

app.use('/admin',adminRoutes);
app.use(bookingRoutes);
app.use('/auth', authRoutes);
app.use('/o2auth', o2authRoutes);

app.use((error, req, res, next) => {
    const status = error.statusCode || 500;
    const message = error.message;
    const data = error.data;
    res.status(status).json({ message: message, data: data });
});

// redisClient.connect()
// .then(result => {
//     app.use(redisClient);
//     console.log('Connected to redis');
// })
// .catch(err => {
//     console.log(err);
// });

mongoose.connect(process.env.mongoose_connect)
.then(result => {
    console.log('Connected');
    app.listen(process.env.PORT || 8080)
})
.catch(err => {
    console.log(err);
});

