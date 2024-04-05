const crypto = require('crypto');
const { readdirSync } = require('fs');

function getbcrypt(){
    const bcrypt = require('bcryptjs');
    return bcrypt
}
function getValidationResult(){
    const { validationResult } = require('express-validator');
    return validationResult;
}

const jwt = require('jsonwebtoken');
function getUserDB(){
    const User = require('../models/user');
    return User
}

function getreddis(){
    const { redisConnect } = require('../util/redis');
    return redisConnect
}


exports.getSignup = (req, res, next) => {
    let message = req.flash('error');
    console.log(message);
    if(message.length>0) {
        message=message[0];
    }
    else {
        message=null;
    }
    res.render('auth/signup', {
      path: '/signup',
      pageTitle: 'Signup',
      errorMessage:message,
      oldInput: {name:'',email:'',password:'',confirmPassword:''},
      validationErrors:[]
    });
};

exports.postSignup = (req, res, next) => {
    //console.log(req);
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const confirmPassword = req.body.confirmPassword;
    const errors = getValidationResult()(req);
    if(!errors.isEmpty()) {
        const error = new Error('Validation failed.');
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }

    getbcrypt()
    .hash(password,12)
    .then(hashedPasswd => {
        const user = new getUserDB()({
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
    console.log("start login",email,password)
    const User = getUserDB()()
    User.findOne({email: email}).then(user => {
        if(!user) {
            const error = new Error('Sorry, A user with this email could not be found!');
            error.statusCode = 401;
            throw error;
        }
        loadedUser = user;
        return getbcrypt().compare(password, user.password);
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
            userId: loadedUser._id.toString()
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
    getreddis()
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