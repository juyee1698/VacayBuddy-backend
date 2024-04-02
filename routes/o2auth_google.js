const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();
const User = require('../models/user'); 
const jwt = require('jsonwebtoken');

// Initialize Google OAuth client
const googleClient = new OAuth2Client('243962731858-rb04b0dbelevp5blhc339io995opuhqu.apps.googleusercontent.com');

// Google OAuth callback route
router.post('/google', async (req, res) => {
    try {
        const { access_token } = req.body;
        // Verify Google access token
        const ticket = await googleClient.verifyIdToken({
            idToken: access_token,
            audience: "243962731858-rb04b0dbelevp5blhc339io995opuhqu.apps.googleusercontent.com",
        });

        const payload = ticket.getPayload();
        const { sub, email, name, picture } = payload; // Extract user information
        console.log(email, name)
        let user = await User.findOne({ email });

        if (!user) {
            // User doesn't exist, create a new user
            user = await User.create({
                name,
                email,
                password: "xxx"
            });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, "somesuperprojectsecret", { expiresIn: '1h' });

        // Send JWT token and user ID to the frontend
        res.status(201).json({ token, userId: name });
    } catch (error) {
        console.error('Error:', error);
        res.status(401).json({ message: 'Unauthorized' });
    }
});

module.exports = router;
