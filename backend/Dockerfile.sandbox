FROM debian:stable-slim

# Install Icarus Verilog and dependencies
RUN apt-get update && apt-get install -y \
    iverilog \
    && rm -rf /var/lib/apt/lists/*

# Setup application folder
WORKDIR /app

# Run as non-privileged user for security
RUN useradd -m -U sandbox
USER sandbox

CMD ["iverilog"]
