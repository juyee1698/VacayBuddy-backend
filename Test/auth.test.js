const { getSignup, postSignup, login, logout } = require('./auth');
const User = require('../models/user');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

jest.mock('../models/user');
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('express-validator');

describe('Auth Controller', () => {

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
    beforeEach(() => {
      validationResult.mockImplementation(() => ({ isEmpty: () => true }));
    });

    it('should create a new user and return 201 status code', async () => {
      const req = {
        body: {
          name: 'Test',
          email: 'test@example.com',
          password: '123456',
          confirmPassword: '123456'
        }
      };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      bcrypt.hash.mockResolvedValue('hashedPassword');
      User.prototype.save.mockResolvedValue('userObject');

      await postSignup(req, res, next);

      expect(User.prototype.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('login', () => {
    it('should throw an error if a user with the provided email does not exist', async () => {
      const req = { body: { email: 'test@example.com', password: 'password' } };
      const next = jest.fn();

      User.findOne.mockResolvedValue(null);

      await login(req, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

    describe('logout', () => {
    it('should blacklist the token and return a success message', async () => {
    });
  });
});
