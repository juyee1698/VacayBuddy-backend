const { postSignup, login } = require('../controllers/auth');
const httpMocks = require('node-mocks-http');
const { validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
// Mocking dependencies
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('express-validator');
jest.mock('../util/redis');
const User = require('../models/user');
jest.mock('../models/user');
const flushPromises = () => new Promise(setImmediate);
describe('postsign controller', () => {

    test('should create a new user successfully', async () => {
        console.log("start")
        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                name: 'Test User',
                email: 'test@example.com',
                password: 'password',
                confirmPassword: 'password',
            },
        });
        const next = jest.fn();
        next.mockResolvedValue({ _id: 'someUserId' })
        validationResult.mockImplementation(() => ({ isEmpty: () => true }));
       
        User.mockImplementation(() => ({
          save: next,
          findOne: next
      }));      
      bcrypt.hash.mockResolvedValue('hashedPasswordcas');
        const res = httpMocks.createResponse();
        console.log(res.statusCode)
        await postSignup(req,res);
        await flushPromises();
        console.log("*****end******")
        console.log(res.statusCode)
        expect(res.statusCode).toBe(201);
        expect(res._getJSONData()).toEqual({
            message: 'User created successfully!',
            flag: true,
            post: { _id: 'someUserId' },
        });
    });
    test('should handle internal server error', async () => {
        // Mock the behavior of the User model to throw an error
        
        User.mockImplementation(() => ({
            save: jest.fn(() => Promise.reject(new Error('Database error'))),
        }));
        validationResult.mockImplementation(() => ({ isEmpty: () => true }));
        bcrypt.hash.mockResolvedValue('hashedPasswordcas');
        

        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                name: 'Test User',
                email: 'test@example.com',
                password: 'password',
                confirmPassword: 'password',
            },
        });
        const res = httpMocks.createResponse();
        const next = jest.fn(); // Mock the next middleware function

        await postSignup(req, res, next);
        await flushPromises();
        // Verify that the next function was called with an error
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        const errorPassedToNext = next.mock.calls[0][0];
        expect(errorPassedToNext.statusCode).toBe(500);
        expect(errorPassedToNext.message).toBe('Database error');

        // Verify that the response status code is not modified
    });
    // Add more test cases for error scenarios, validation failures, etc.
});




describe('login controller', () => {

    test('should login a user successfully', async () => {
        jest.clearAllMocks();
        console.log("start")
        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                email: 'test@example.com',
                password: 'password',
            },
        });
        const next = jest.fn();
        next.mockResolvedValue({email:'sample@sample.com', _id: 'someUserId', password:'xxx' })
        User.mockImplementation(() => ({
            findOne: next
        }));   
        bcrypt.compare.mockResolvedValue(true);

   
        const res = httpMocks.createResponse();
        console.log(res.statusCode)
        await login(req,res);
        await flushPromises();
        console.log("*****end******")
        console.log(res.statusCode)
        expect(res.statusCode).toBe(200);
    });
    test('should handle internal server error', async () => {
        // Mock the behavior of the User model to throw an error
        jest.mock('../models/user');
        User.mockImplementation(() => ({
            findOne: jest.fn(() => Promise.reject(new Error('Database error'))),
        }));
        
        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                email: 'test@example.com',
                password: 'password',
            },
        });
        const res = httpMocks.createResponse();
        const next = jest.fn(); // Mock the next middleware function

        await login(req, res, next);
        await flushPromises();
        // Verify that the next function was called with an error
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        const errorPassedToNext = next.mock.calls[0][0];
        expect(errorPassedToNext.statusCode).toBe(500);
        expect(errorPassedToNext.message).toBe('Database error');

        // Verify that the response status code is not modified
    });    

    // Add more test cases for error scenarios, validation failures, etc.
});
