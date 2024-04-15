const request = require('supertest');
const express = require('express');
const router = require('../routes/o2auth_google'); // Assuming your route file is named googleAuth.js
// Mock the google-auth-library module
const OAuth2Client = require('google-auth-library').OAuth2Client;
jest.mock('google-auth-library');

jest.mock('../models/user');
jest.mock('../util/file')
jest.mock('../util/path')
jest.mock('../util/redis');

// Create a new Express app
// Mount the router under /auth
const app = express();
app.use(express.json());
app.use('/o2auth', router); 
describe('Google OAuth route', () => {
    
    test('should respond with a JWT token and user ID', async () => {
        console.log("ok")
        // Mock the behavior of verifyIdToken method
        const verifyIdTokenMock = jest.fn();
        verifyIdTokenMock.mockResolvedValue({
            getPayload: () => ({
                sub: 'user-subject-id',
                email: 'user@example.com',
                name: 'Test User',
                picture: 'https://example.com/user.jpg'
            })
        });
        
        OAuth2Client.mockImplementation(() => ({
            verifyIdToken: verifyIdTokenMock,
        }));
        // Mock the behavior of the OAuth2Client constructor
        
       
        const User = require('../models/user');
        const userData = { email: 'user@example.com', _id: 'user-id' };
        User.findOne.mockResolvedValue(userData);

        const response = await request(app)
            .post('/o2auth/google')
            .send({ access_token: 'valid_access_token' });



        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('userId');
        expect(response.body).toHaveProperty('name');

        // Additional assertions if needed
        expect(verifyIdTokenMock).toHaveBeenCalledTimes(1);
        expect(verifyIdTokenMock).toHaveBeenCalledWith({
            idToken: 'valid_access_token',
            audience: process.env.o2auth_client_id
        });
    });

    test('should respond with 401 for invalid access token', async () => {
        // Implement the test with invalid access token as before
        const verifyIdTokenMock = jest.fn();
        verifyIdTokenMock.mockResolvedValue({
        });
        const wow = jest.fn()

        
        OAuth2Client.mockImplementation(() => ({
            verifyIdToken: verifyIdTokenMock,

        }));
        // Mock the behavior of the OAuth2Client constructor
        

        const response = await request(app)
            .post('/o2auth/google')
            .send({ access_token: 'valid_access_token' });



        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('message'); 
    });
});
