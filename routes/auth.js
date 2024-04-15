const express = require('express');

const router = express.Router();
const authController = require('../controllers/auth');
const { check,body } = require('express-validator');
const User = require('../models/user');
router.post('/signup',
    [
    check('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .custom((value,{ req }) => {
        return User.findOne({email:value})
        .then(userDoc => {
            if(userDoc) {
                return Promise.reject('Sorry, this email already exists');
            }
        });
    })
    .normalizeEmail(),
    body('password','Please enter a password with only numbers and text and at least 5 characters')
    .trim()
    .isLength({min:5})
    .isAlphanumeric(),
    body('name', 'Name should not be empty').trim().not().isEmpty(),
    body('confirmPassword').trim().custom((value,{ req }) => {
        if(value!==req.body.password) {
            throw new Error('Passwords have to match');
        }
        return true;
    })
    ],
    authController.postSignup);

router.post('/login', authController.login);

router.post('/logout', authController.logout);

module.exports = router;