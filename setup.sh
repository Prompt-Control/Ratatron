#!/bin/bash

# RATATRON DEPLOYMENT SETUP SCRIPT
# Automates server setup for DigitalOcean, AWS, or any Linux server

echo "╔════════════════════════════════════════════════╗"
echo "║  RATATRON LIVESTREAM - DEPLOYMENT SETUP        ║"
echo "╚════════════════════════════════════════════════╝"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${YELLOW}Starting installation...${NC}\n"

# Update system
echo -e "${YELLOW}1. Updating system packages...${NC}"
apt-get update
apt-get upgrade -y

# Install Node.js
echo -e "${YELLOW}2. Installing Node.js 18...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install npm
echo -e "${YELLOW}3. Installing npm...${NC}"
apt-get install -y npm

# Install FFmpeg
echo -e "${YELLOW}4. Installing FFmpeg...${NC}"
apt-get install -y ffmpeg

# Install Git
echo -e "${YELLOW}5. Installing Git...${NC}"
apt-get install -y git

# Install PM2 (process manager)
echo -e "${YELLOW}6. Installing PM2...${NC}"
npm install -g pm2

# Create app directory
echo -e "${YELLOW}7. Creating app directory...${NC}"
mkdir -p /opt/ratatron
cd /opt/ratatron

# Clone repository (you can also upload files manually)
echo -e "${YELLOW}8. Downloading Ratatron files...${NC}"
# If using GitHub:
# git clone https://github.com/yourusername/ratatron-backend.git .
# For now, assume files are uploaded

# Install dependencies
echo -e "${YELLOW}9. Installing Node dependencies...${NC}"
npm install

# Create directories
echo -e "${YELLOW}10. Creating directories...${NC}"
mkdir -p uploads logs temp-chunks public

# Copy client to public folder
echo -e "${YELLOW}11. Setting up public folder...${NC}"
if [ -f "client-production.html" ]; then
    cp client-production.html public/index.html
fi

# Create .env file from template
echo -e "${YELLOW}12. Creating .env configuration...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env-production-template" ]; then
        cp .env-production-template .env
        echo -e "${YELLOW}    ⚠️  IMPORTANT: Edit .env and add your Google credentials${NC}"
        echo -e "${YELLOW}    nano .env${NC}"
    fi
fi

# Set permissions
echo -e "${YELLOW}13. Setting permissions...${NC}"
chown -R nobody:nogroup /opt/ratatron
chmod -R 755 /opt/ratatron

# Setup PM2
echo -e "${YELLOW}14. Configuring PM2...${NC}"
cd /opt/ratatron
pm2 start server-production.js --name "ratatron" --env production
pm2 startup
pm2 save

# Install Nginx (optional)
echo -e "${YELLOW}15. Installing Nginx (optional)...${NC}"
apt-get install -y nginx

# Enable UFW firewall
echo -e "${YELLOW}16. Configuring firewall...${NC}"
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp

# Verify installation
echo -e "\n${GREEN}✓ Installation complete!${NC}\n"

# System status
echo -e "${YELLOW}System Status:${NC}"
echo -e "Node.js: $(node --version)"
echo -e "npm: $(npm --version)"
echo -e "FFmpeg: $(ffmpeg -version | head -n 1)"
echo -e "PM2 Processes:"
pm2 list

# Next steps
echo -e "\n${YELLOW}NEXT STEPS:${NC}"
echo "1. Edit .env file with Google credentials:"
echo "   nano /opt/ratatron/.env"
echo ""
echo "2. Start the server:"
echo "   pm2 start ratatron"
echo ""
echo "3. Check logs:"
echo "   pm2 logs ratatron"
echo ""
echo "4. Test the server:"
echo "   curl http://localhost:3000/api/health"
echo ""
echo "5. Access your app:"
echo "   http://YOUR_SERVER_IP:3000"
echo ""
echo -e "${GREEN}Setup complete! Your Ratatron server is ready.${NC}\n"
