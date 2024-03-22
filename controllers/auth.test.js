const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { redisConnect } = require('../util/redis');
const User = require('../models/user');
const { getSignup, postSignup, login, logout } = require('../controllers/auth');

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('express-validator');
jest.mock('../util/redis');
jest.mock('../models/user');

describe('Auth Controller - auth.js', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });
  describe('getSignup', () => {
    it('should render the signup page with the correct view and variables', () => {
      const req = { flash: jest.fn().mockReturnValue([]) };
      const res = { render: jest.fn() };
      const next = jest.fn();

      getSignup(req, res, next);
      
      expect(res.render).toHaveBeenCalledWith('auth/signup', expect.objectContaining({
        path: '/signup',
        pageTitle: 'Signup',
        errorMessage: null
      }));
    });
  });
  describe('postSignup', () => {
    it('Should successfully register a user', async () => {
      const req = {
        body: {
          name: 'John Doe',
          email: 'john@example.com',
          password: 'Password123',
          confirmPassword: 'Password123'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      validationResult.mockImplementation(() => ({ isEmpty: () => true }));
      bcrypt.hash.mockResolvedValue('hashedPassword');
      User.prototype.save.mockResolvedValue({
        _id: '123',
        email: 'john@example.com'
      });

      await postSignup(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('Should handle validation errors for registration', async () => {
      const req = {
        body: {
          name: '',
          email: 'invalid',
          password: '123',
          confirmPassword: '1234'
        }
      };
      const res = {};
      const next = jest.fn();

      validationResult.mockImplementation(() => ({
        isEmpty: () => false,
        array: () => [{ msg: 'Invalid data' }]
      }));

      await postSignup(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(422);
    });
  });

  describe('login', () => {
    it('Should authenticate a user with valid credentials', async () => {
      const req = {
        body: {
          email: 'john@example.com',
          password: 'Password123'
        }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      User.findOne.mockResolvedValue({
        _id: '123',
        email: 'john@example.com',
        password: bcrypt.hashSync('Password123', 12)
      });
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('fakeToken');

      await login(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('Should reject a user with invalid credentials', async () => {
      const req = {
        body: {
          email: 'john@example.com',
          password: 'wrongPassword'
        }
      };
      const res = {};
      const next = jest.fn();

      User.findOne.mockResolvedValue({
        email: 'john@example.com',
        password: bcrypt.hashSync('Password123', 12)
      });
      bcrypt.compare.mockResolvedValue(false);

      await login(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].statusCode).toBe(401);
    });
  });

  // Logout test cases would typically involve mocking the redis connection
  // and ensuring that tokens are correctly blacklisted upon logout.

  // Additional tests for handling user profile and preferences updates would be needed
  // if such functionalities were present in the provided `auth.js` file.
});
