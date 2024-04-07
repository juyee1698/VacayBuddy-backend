const express = require('express');
const passport = require("passport");
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const router = express.Router();
const session = require('express-session');
const jwt = require('jsonwebtoken');
const User = require('../models/user'); // Ensure this path is correct for your project structure

router.use(session({
    secret: 'your_secret_key', // Make sure to keep your secret key safe
    resave: false,
    saveUninitialized: true,
}));

// Initialize Passport and restore authentication state if available
router.use(passport.initialize());
router.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new GoogleStrategy({
        clientID: "243962731858-rb04b0dbelevp5blhc339io995opuhqu.apps.googleusercontent.com",
        clientSecret: "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",
        callbackURL: "http://localhost:8080/o2auth/google/callback",
        passReqToCallback: true
    },
    function (request, accessToken, refreshToken, profile, done) {
        User.findOne({ email: profile.emails[0].value })
            .then(existingUser => {
                if (existingUser) {
                    const token = jwt.sign({
                        email: existingUser.email,
                        userId: existingUser._id.toString()
                    }, 'somesuperprojectsecret', { expiresIn: '1h' });

                    profile.jwtToken = token;
                    profile.userId = existingUser._id.toString();
                    return done(null, profile);
                } else {
                    const newUser = new User({
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        password: "xxx" // Consider using a more secure way to handle passwords for OAuth users
                    });
                    newUser.save()
                        .then(user => {
                            const token = jwt.sign({
                                email: user.email,
                                userId: user._id.toString()
                            }, 'somesuperprojectsecret', { expiresIn: '1h' });

                            profile.jwtToken = token;
                            profile.userId = user._id.toString();
                            return done(null, profile);
                        });
                }
            })
            .catch(err => done(err));
    }
));

router.get("/failed", (req, res) => {
    res.send("Login Failed");
});

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/failed' }),
    function (req, res) {
        if (req.user && req.user.jwtToken) {
            res.status(200).json({
                token: req.user.jwtToken,
                userId: req.user.userId,
            });
        } else {
            res.status(500).json({ error: "Authentication succeeded but failed to retrieve user information." });
        }
    }
);

router.get('/google',
    passport.authenticate('google', { scope: ['email', 'profile'] }
));

module.exports = router;
