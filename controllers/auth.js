const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const User = require('../models/user');
const { redisConnect } = require('../util/redis');


exports.postSignup = (req, res, next) => {
    
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const confirmPassword = req.body.confirmPassword;
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        // return res.status(422).render('auth/signup', {
        //     path: '/signup',
        //     pageTitle: 'Signup',
        //     errorMessage:errors.array()[0].msg,
        //     oldInput: {name:name,email:email,password:password,confirmPassword:req.body.confirmPassword},
        //     validationErrors:errors.array()
        // });
        const error = new Error('Validation failed.');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    bcrypt
    .hash(password,12)
    .then(hashedPasswd => {
        const user = new User({
            name:name,
            email:email,
            password:hashedPasswd,
            imageUrl:'images/user/profile.jpg',
            city:'',
            country:'',
            address:'',
            phoneno:0,
            postal:0
        });
        return user.save();
    })
    .then(result => {
        res.status(201).json({
          message: 'User created successfully!',
          flag: true,
          post: result
        });
      })
    .catch(err => {
        if (!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    });
    
};

exports.login = (req, res, next) => {
    const email = req.body.email;
    const password = req.body.password;
    let loadedUser;
    User.findOne({email: email})
    .then(user => {
        if(!user) {
            const error = new Error('Sorry, A user with this email could not be found!');
            error.statusCode = 401;
            throw error;
        }
        loadedUser = user;
        return bcrypt.compare(password, user.password);
    })
    .then(isEqual => {
        if(!isEqual) {
            const error = new Error('Sorry, wrong password entered!');
            error.statusCode = 401;
            throw error;
        }
        const token = jwt.sign({
            email: loadedUser.email,
            userId: loadedUser._id.toString()
        },
        'somesuperprojectsecret',
        {expiresIn: '1h'}
        );
        res.status(200).json({
            token: token,
            userId: loadedUser._id.toString(),
            name: loadedUser.name.toString()
        });
    })
    .catch(err => {
        if(!err.statusCode) {
            err.statusCode = 500;
        }
        next(err);
    });
};

exports.logout = (req, res, next) => {
    const authHeader = req.get('Authorization');
    const token = authHeader.split(' ')[1];
    //const token = 'sometoken';
    let tokensArray;
    let updatedTokens;
    let rclient;
    redisConnect
        .then(client => {
            rclient = client;
            return rclient.get('blacklisttokens');
        })
        .then(tokensArr => {
            tokensArray = JSON.parse(tokensArr);
            tokensArray.push(token);
            updatedTokens = JSON.stringify(tokensArray);
            return rclient.set('blacklisttokens', updatedTokens);
            
        })
        .then(output => {
            res.status(200).json({
                status: "logout",
                message: "Token has been blacklisted"
            });
        })
        .catch(err => {
            console.log('Token does not exist');
            next(err);
        })
};