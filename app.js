require('dotenv').config();
const http = require('http');
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
//const MongoDBStore = require('connect-mongodb-session')(session);
const csrf = require('csurf');
const flash = require('connect-flash');
const multer = require('multer');
const redis = require('redis');
const passport = require('passport');
const cookieSession = require('cookie-session');
// require('./passport');
const app = express();
const session = require( 'express-session');

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Initialize Passport and restore authentication state if available
app.use(passport.initialize());
app.use(passport.session());
app.get('/', (req, res) => {
    res.send('Hello, World!');
  });
// app.use(cookieSession({
//     name: 'google-auth-session',
//     keys: ['key1', 'key2']
//   }))
// const fileStorage = multer.diskStorage({
//     destination: (req,file,cb) => {
//         cb(null,'images')
//     },
//     filename: (req,file,cb) => {
//         cb(null,new Date().getTime()+'-'+file.originalname)
//     }
// });

// const fileFilter = (req,file,cb) => {
//     if(file.mimetype==='image/png' || file.mimetype==='image/jpg' || file.mimetype==='image/jpeg') {
//         cb(null,true);
//     }
//     else {
//         cb(null,false);
//     }
// };
// app.use(passport.initialize());
// app.use(passport.session());
const adminRoutes = require('./routes/admin');
const bookingRoutes = require('./routes/booking');
const authRoutes = require('./routes/auth');
const o2authRoutes = require('./routes/oauth2')


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

