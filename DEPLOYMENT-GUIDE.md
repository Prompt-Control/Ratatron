# RATATRON PRODUCTION DEPLOYMENT GUIDE

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [DigitalOcean Deployment](#digitalocean-deployment)
3. [AWS EC2 Deployment](#aws-ec2-deployment)
4. [Heroku Deployment](#heroku-deployment)
5. [Docker Deployment](#docker-deployment)
6. [Configuration](#configuration)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deployment, ensure you have:

✅ **Google Cloud Setup**
- OAuth 2.0 credentials (Client ID & Secret)
- Google Drive API enabled
- Correct redirect URIs configured

✅ **Domain & SSL (Recommended)**
- Custom domain (optional, can use IP)
- SSL certificate (Let's Encrypt is free)

✅ **GitHub Account (Optional)**
- For storing code and CI/CD

---

## DigitalOcean Deployment

### Step 1: Create a Droplet

1. Log in to [DigitalOcean](https://digitalocean.com)
2. Click "Create" → "Droplets"
3. Choose:
   - **Image**: Ubuntu 22.04 LTS
   - **Size**: Basic ($5/month minimum)
   - **Region**: Closest to your users
   - **SSH Key**: Add your SSH key
4. Click "Create Droplet"

### Step 2: SSH Into Server

```bash
ssh root@YOUR_DROPLET_IP
```

### Step 3: Run Automated Setup

```bash
# Download setup script
curl -o setup.sh https://raw.githubusercontent.com/yourusername/ratatron/main/deployment-setup.sh

# Make executable and run
chmod +x setup.sh
./setup.sh
```

### Step 4: Configure Environment

```bash
cd /opt/ratatron
nano .env
```

Fill in:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://YOUR_DROPLET_IP:3000/api/auth/google-callback
GOOGLE_DRIVE_FOLDER_ID=root
```

### Step 5: Start Server

```bash
pm2 start server-production.js
pm2 save
```

### Step 6: Setup SSL with Let's Encrypt (Optional)

```bash
# Install Certbot
apt-get install -y certbot python3-certbot-nginx

# Get certificate
certbot certonly --standalone -d your-domain.com

# Update .env with HTTPS URI
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google-callback
```

### Step 7: Configure Nginx

```bash
cp nginx-production.conf /etc/nginx/sites-available/ratatron
ln -s /etc/nginx/sites-available/ratatron /etc/nginx/sites-enabled/

# Test and restart
nginx -t
systemctl restart nginx
```

### Step 8: Test

```bash
curl https://your-domain.com/api/health
```

---

## AWS EC2 Deployment

### Step 1: Launch Instance

1. Go to AWS EC2 Console
2. Click "Launch Instance"
3. Choose:
   - **AMI**: Ubuntu Server 22.04 LTS
   - **Type**: t3.micro (free tier)
   - **Security Group**: Allow ports 22, 80, 443, 3000
4. Launch and create key pair

### Step 2: Connect

```bash
ssh -i your-key.pem ubuntu@your-instance-ip
```

### Step 3: Run Setup

```bash
curl -o setup.sh https://raw.githubusercontent.com/yourusername/ratatron/main/deployment-setup.sh
chmod +x setup.sh
sudo ./setup.sh
```

### Step 4-8: Same as DigitalOcean

---

## Heroku Deployment

### Step 1: Setup

```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

heroku login
heroku create your-app-name
```

### Step 2: Add Buildpacks

```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg.git
```

### Step 3: Set Environment Variables

```bash
heroku config:set GOOGLE_CLIENT_ID=your-id
heroku config:set GOOGLE_CLIENT_SECRET=your-secret
heroku config:set GOOGLE_REDIRECT_URI=https://your-app.herokuapp.com/api/auth/google-callback
heroku config:set GOOGLE_DRIVE_FOLDER_ID=root
heroku config:set NODE_ENV=production
```

### Step 4: Deploy

```bash
# Push to Heroku
git push heroku main

# View logs
heroku logs --tail
```

### Step 5: Test

```bash
curl https://your-app.herokuapp.com/api/health
```

---

## Docker Deployment

### Option A: Local Testing

```bash
# Build image
docker build -f Dockerfile-production -t ratatron:latest .

# Run with compose
docker-compose -f docker-compose-production.yml up -d

# View logs
docker-compose logs -f ratatron-backend

# Stop
docker-compose down
```

### Option B: Docker Hub Deployment

```bash
# Build and tag
docker build -f Dockerfile-production -t yourusername/ratatron:latest .

# Push to Docker Hub
docker push yourusername/ratatron:latest

# Deploy on any provider supporting Docker
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  -v ratatron-uploads:/app/uploads \
  yourusername/ratatron:latest
```

### Option C: Kubernetes

```bash
# Create namespace
kubectl create namespace ratatron

# Create secret
kubectl create secret generic google-creds \
  --from-literal=client-id=YOUR_CLIENT_ID \
  --from-literal=client-secret=YOUR_SECRET \
  -n ratatron

# Deploy
kubectl apply -f kubernetes-deployment.yaml -n ratatron
```

---

## Configuration

### Environment Variables (Complete List)

```env
# Server
PORT=3000
NODE_ENV=production

# Google OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google-callback

# Google Drive
GOOGLE_DRIVE_FOLDER_ID=root

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/server.log

# CORS
CORS_ORIGIN=https://your-domain.com,https://yourusername.github.io

# Optional: SSL
SSL_ENABLED=true
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### Nginx Configuration

The `nginx-production.conf` includes:
- Reverse proxy to Node.js
- WebSocket support
- Gzip compression
- Rate limiting
- SSL/TLS setup

---

## Monitoring & Maintenance

### Check Server Health

```bash
# HTTP health check
curl http://localhost:3000/api/health

# Debug sessions
curl http://localhost:3000/api/debug/sessions

# Check files
curl http://localhost:3000/api/debug/files
```

### View Logs

```bash
# PM2 logs
pm2 logs ratatron

# Systemd logs
journalctl -u ratatron -f

# File logs
tail -f logs/server.log
```

### Restart Server

```bash
# PM2
pm2 restart ratatron

# Systemd
systemctl restart ratatron

# Docker
docker-compose restart ratatron-backend
```

### Backup Data

```bash
# Backup Google Drive tokens
cp .auth-token.json .auth-token.json.backup

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/
```

---

## Troubleshooting

### Server Won't Start

```bash
# Check if port is in use
lsof -i :3000

# Check logs
pm2 logs ratatron

# Try different port
PORT=8000 npm start
```

### Google Auth Fails

- Verify `GOOGLE_REDIRECT_URI` in .env matches exactly in Google Console
- Check it uses `https://` in production
- Wait 5-10 minutes after changing in Google Console
- Test: `curl http://localhost:3000/api/auth/google-url`

### FFmpeg Not Working

```bash
# Verify installation
ffmpeg -version

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Check if in PATH
which ffmpeg
```

### Can't Upload to Google Drive

```bash
# Check authentication
curl http://localhost:3000/api/health

# If driveAuthenticated is false:
# 1. Click "Authenticate Google Drive" in web app
# 2. Grant permissions
# 3. Check .auth-token.json exists
```

### High Memory Usage

```bash
# Check processes
ps aux | grep node

# Monitor memory
watch -n 1 'free -h'

# Restart if needed
pm2 restart ratatron
```

### SSL Certificate Issues

```bash
# Renew Let's Encrypt certificate
certbot renew

# Check certificate expiry
openssl x509 -in /path/to/cert.pem -text -noout | grep "Not After"
```

---

## Performance Optimization

### Increase Upload Speed
```env
MAX_FILE_SIZE=1000000000  # Increase to 1GB
CHUNK_RETENTION_HOURS=2    # Faster cleanup
```

### Reduce Memory Usage
```bash
# Limit Node.js heap
NODE_OPTIONS="--max-old-space-size=512" npm start
```

### Enable Compression
- Already configured in nginx-production.conf
- Reduces bandwidth usage by 70%+

### CDN Setup
- Use Cloudflare (free tier available)
- Cache static files (HTML, JS, CSS)
- Compress and optimize delivery

---

## Security Checklist

✅ Change default passwords
✅ Use SSH keys (not passwords)
✅ Enable firewall (UFW/iptables)
✅ Install SSL certificate
✅ Set strong GOOGLE_CLIENT_SECRET
✅ Use HTTPS in production
✅ Enable rate limiting
✅ Regular backups
✅ Update dependencies: `npm update`
✅ Monitor logs for errors

---

## Support & Resources

- **Documentation**: See README.md
- **Issues**: GitHub Issues
- **Community**: [Your Forum/Discord]
- **Email**: support@your-domain.com

---

**Version:** 1.0.0
**Last Updated:** 2024-01-27
**Status:** Production Ready ✅
