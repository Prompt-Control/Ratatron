# 🚀 RATATRON QUICK START - DEPLOYMENT IN 15 MINUTES

## **Option 1: DigitalOcean (Recommended - $5/month)**

### Step 1: Create Droplet (2 minutes)
1. Go to [DigitalOcean.com](https://digitalocean.com)
2. Create new Droplet
3. Choose: **Ubuntu 22.04 LTS**
4. Size: **Basic - $5/month**
5. Add SSH key (or use password)
6. Click Create

### Step 2: SSH Into Server (1 minute)
```bash
ssh root@YOUR_DROPLET_IP
```

### Step 3: Run Setup Script (5 minutes)
```bash
# Download and run setup
curl -fsSL https://raw.githubusercontent.com/yourusername/ratatron/main/deployment-setup.sh | bash

# Or if you have it locally:
bash deployment-setup.sh
```

### Step 4: Configure (3 minutes)
```bash
nano .env
# Fill in:
# GOOGLE_CLIENT_ID=...
# GOOGLE_CLIENT_SECRET=...
# GOOGLE_REDIRECT_URI=https://YOUR_IP:3000/api/auth/google-callback
```

### Step 5: Start Server (1 minute)
```bash
npm start
```

### Step 6: Test (3 minutes)
Visit: `http://YOUR_DROPLET_IP:3000`

**Done! You're live!** 🎉

---

## **Option 2: Heroku (Free tier, limited)**

### Step 1: Create Account & App (1 minute)
```bash
heroku login
heroku create your-app-name
```

### Step 2: Add Buildpacks (1 minute)
```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg.git
```

### Step 3: Set Environment (2 minutes)
```bash
heroku config:set GOOGLE_CLIENT_ID=...
heroku config:set GOOGLE_CLIENT_SECRET=...
heroku config:set GOOGLE_REDIRECT_URI=https://your-app.herokuapp.com/api/auth/google-callback
```

### Step 4: Deploy (1 minute)
```bash
git push heroku main
```

### Step 5: Test (1 minute)
Visit: `https://your-app.herokuapp.com`

---

## **Option 3: Docker (Any Cloud Provider)**

### Step 1: Build Image
```bash
docker build -t ratatron-backend:latest .
```

### Step 2: Push to Registry
```bash
docker tag ratatron-backend:latest yourusername/ratatron:latest
docker push yourusername/ratatron:latest
```

### Step 3: Deploy
Most cloud providers support Docker:
- AWS ECR
- Google Cloud Run
- Azure Container Instances
- DigitalOcean App Platform

---

## **FILES YOU NEED**

```
deployment/
├── server-production.js          ← Backend
├── client-production.html        ← Frontend (put in public/)
├── package-production.json       ← Dependencies (rename to package.json)
├── .env-production-template      ← Environment (rename to .env, fill values)
├── Dockerfile                    ← Docker image
├── docker-compose-production.yml ← Local testing
├── nginx-production.conf         ← Reverse proxy
├── ratatron-systemd.service      ← Linux service
├── deployment-setup.sh           ← Auto-setup script
└── DEPLOYMENT-GUIDE.md           ← Detailed guide
```

---

## **SETUP CHECKLIST**

Before deploying:
- [ ] Google Cloud Project created
- [ ] OAuth credentials obtained
- [ ] Redirect URI set in Google Console
- [ ] `.env` file filled with credentials
- [ ] FFmpeg installed on server
- [ ] Node.js 18+ installed
- [ ] Port 3000 open (or change in .env)

---

## **COMMON COMMANDS**

```bash
# Check if running
curl http://localhost:3000/api/health

# View logs
tail -f logs/server.log

# Stop server
pm2 stop ratatron

# Restart
pm2 restart ratatron

# Check processes
pm2 list
```

---

## **TROUBLESHOOTING**

### Server won't start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Use different port
PORT=8000 npm start
```

### Google auth fails
- Check GOOGLE_REDIRECT_URI in .env matches Google Console
- Make sure it has https:// in production
- Wait 5-10 minutes for Google to sync changes

### FFmpeg not found
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg
```

### Can't upload to Google Drive
- Run: `curl http://localhost:3000/api/health`
- Check driveAuthenticated: true/false
- Re-authenticate if false

---

## **NEXT STEPS**

1. ✓ Choose deployment option above
2. ✓ Follow the 5 steps for your option
3. ✓ Run the health check
4. ✓ Test recording a video
5. ✓ Check Google Drive for video file

**Questions?** Check DEPLOYMENT-GUIDE.md for detailed instructions.

---

**Version:** 1.0.0
**Last Updated:** 2024-01-27
**Status:** Production Ready ✅
