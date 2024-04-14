const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const router = express.Router();
const bcrypt = require('bcryptjs');
// const User = require('../models/user');
const jwt = require('jsonwebtoken');
const { eventNames } = require('../models/airport');

// Initialize Google OAuth client
function getGoogleClinet(){
    return new OAuth2Client(process.env.o2auth_client_id);
}

function getUserDB(){
    const User = require('../models/user');
    return User
}
// const googleClient = new OAuth2Client(process.env.o2auth_client_id);

// Google OAuth callback route
router.post('/google', async (req, res) => {
    try {
        const googleClient = getGoogleClinet()
        const { access_token } = req.body;
        // Verify Google access token
    
        const ticket = await googleClient.verifyIdToken({
            idToken: access_token,
            audience: process.env.o2auth_client_id,
        });

        const payload = ticket.getPayload();
        const { sub, email, name } = payload; // Extract user information
        const User = getUserDB()
        let user = await User.findOne({ email });
        if (!user) {
            // User doesn't exist, create a new user
            user = await User.create({
                name,
                email,
                password:bcrypt.hash('xxx',12),
                imageUrl:'images/user/profile.jpg',
                city:'',
                country:'',
                address:'',
                phoneno:0,
                postal:0
            });
        }

        // Generate JWT token
        const token = jwt.sign({ userId: user._id }, "somesuperprojectsecret", { expiresIn: '1h' });
        res.status(201).json({ token, userId: user._id , name:name });
    } catch (error) {
        console.error('Error:', error);
        res.status(401).json({ message: 'Unauthorized' });
    }
});

module.exports = router;
