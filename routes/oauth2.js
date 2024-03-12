const express = require('express');
const passport =require("passport")
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const router = express.Router();
const session = require( 'express-session');

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

passport.use(new GoogleStrategy({
        clientID:"243962731858-rb04b0dbelevp5blhc339io995opuhqu.apps.googleusercontent.com",
        clientSecret:"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",
        callbackURL: "http://localhost:8080/o2auth/google/callback",
        passReqToCallback   : true
    },
    function(request, accessToken, refreshToken, profile, done) {
            return done(null, profile);
    }
));

router.get("/failed", (req, res) => {
    res.send("Failed")
})
router.get("/success", (req, res) => {
    res.send(`Welcome ${req.user.email}`)
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
