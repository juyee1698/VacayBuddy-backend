const request = require('supertest');
const express = require('express');
const { bookFlight } = require('../controllers/booking');
const { redisConnect } = require('../util/redis'); // Assuming this is the actual path
jest.mock('../util/redis'); // Mock the Redis utility

const app = express();
app.use(express.json());
app.post('/book-flight', bookFlight);

describe('Book Flight Controller Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should return 422 if input validation fails', async () => {
    const response = await request(app)
      .post('/book-flight')
      .send({}); // Sending an empty body should fail validation

    expect(response.status).toBe(422);
    expect(response.body.errorCode).toBe('client_err');
  });

  it('should handle decryption errors gracefully', async () => {
    // Send a request with a malformed journeyContinuationId to trigger decryption failure
    const response = await request(app)
      .post('/book-flight')
      .send({ journeyContinuationId: 'malformed_id' });

    expect(response.status).toBe(500); // Assuming that decryption error returns HTTP 500
    expect(response.body.errorCode).toBe('internal_server_err');
  });

  it('should return error if Redis fetch fails', async () => {
    // Mock the redisConnect to simulate a Redis fetch failure
    redisConnect.get.mockRejectedValue(new Error('Redis fetch error'));

    const response = await request(app)
      .post('/book-flight')
      .send({ journeyContinuationId: 'valid_encrypted_id' });

    expect(response.status).toBe(500);
    expect(response.body.errorCode).toBe('redis_err');
  });

  it('should return flight booking information on success', async () => {
    // Mock successful Redis fetch
    redisConnect.get.mockResolvedValue(JSON.stringify({
      originLocation: 'Test Origin',
      destinationLocation: 'Test Destination',
      // Add other fields as needed
    }));

    const response = await request(app)
      .post('/book-flight')
      .send({ journeyContinuationId: 'valid_encrypted_id' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Flight booking information for checkout retrieved successfully!');
    // Validate other parts of the response as needed
  });
});
