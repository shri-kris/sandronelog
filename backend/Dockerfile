FROM node:20-slim

# Install Icarus Verilog
RUN apt-get update && apt-get install -y \
    iverilog \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package definitions and install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy backend source code
COPY . .

# Run as non-privileged node user for security
USER node

EXPOSE 5000

CMD ["node", "app.js"]
