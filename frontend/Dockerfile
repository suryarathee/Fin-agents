# Use an official Node runtime as a parent image
FROM node:22-slim
# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first
# This allows Docker to cache the dependencies installation
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose port 3000 (standard for React/Vite)
EXPOSE 3000

# Start the development server
CMD ["npm", "run", "dev"]