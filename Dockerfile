# Use official Node.js image as base
FROM node:20.11.0

# Set working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the application code to container
COPY . .

# Expose port 8080
EXPOSE 8080

# Command to run the application
CMD ["npm", "start"]
