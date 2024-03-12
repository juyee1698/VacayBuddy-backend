const express = require('express');
const passport =require("passport")
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const router = express.Router();
const session = require( 'express-session');
const User = require('../models/user');
router.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Initialize Passport and restore authentication state if available
router.use(passport.initialize());
router.use(passport.session());

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
        done(null, user);
});

const jwt = require('jsonwebtoken');
// Assuming User model is imported correctly

passport.use(new GoogleStrategy({
        clientID: "243962731858-rb04b0dbelevp5blhc339io995opuhqu.apps.googleusercontent.com",
        clientSecret: "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",
        callbackURL: "http://localhost:8080/o2auth/google/callback",
        passReqToCallback: true
    },
    function(request, accessToken, refreshToken, profile, done) {
        // Search for existing user by email
        User.findOne({ email: profile.emails[0].value })
            .then(existingUser => {
                if (existingUser) {
                    // User exists, generate a JWT token
                    const token = jwt.sign({
                        email: existingUser.email,
                        userId: existingUser._id.toString()
                    }, 'somesuperprojectsecret', { expiresIn: '1h' });
                    
                    // Add token to profile object for now, consider better strategies for token management
                    profile.jwtToken = token;
                    return done(null, profile);
                } else {
                    // No user found, create a new user
                    const newUser = new User({
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        password: "xxx"
                        // You may need to set more fields depending on your User model
                    });
                    newUser.save()
                        .then(user => {
                            // Generate JWT token for new user
                            const token = jwt.sign({
                                email: user.email,
                                userId: user._id.toString()
                            }, 'somesuperprojectsecret', { expiresIn: '1h' });
                            
                            // Add token to profile object
                            profile.jwtToken = token;
                            return done(null, profile);
                        });
                }
            })
            .catch(err => done(err));
    }
));

router.get("/failed", (req, res) => {
    res.send("Failed")
})
router.get("/success", (req, res) => {
    console.log('User:', req.user);
        
    // Extract username and email from user profile
    const username = req.user.displayName;
    const email = req.user.emails[0].value;
    
    // Print username and email
    console.log('Username:', username);
    console.log('Email:', email);

    // Redirect to home page
    res.redirect('/');
})
// Define routes
router.get('/google',
passport.authenticate('google', {
        scope:
            ['email', 'profile']
    }
));

router.get('/google/callback',
passport.authenticate('google', {

    failureRedirect: '/failed',
}),
function (req, res) {
    console.log("okk")
    res.redirect('/o2auth/success')

}
);;

module.exports = router;
