# Ratatron Livestream Backend

Production-ready Node.js backend for mobile livestream cooking assistant with FFmpeg video compression, Google Drive integration, and WebSocket real-time quality negotiation.

## 🎯 Features

✅ **Video Compression & Optimization**
- FFmpeg integration with hardware acceleration support
- Adaptive bitrate encoding based on network conditions
- Multiple quality presets (5G, 4G, 3G, 2G, Battery Saver)
- Real-time progress tracking

✅ **Google Drive Integration**
- OAuth 2.0 authentication
- Resumable uploads for reliability
- Automatic file organization
- Video sharing via secure links

✅ **WebSocket Real-time Quality Negotiation**
- Network condition monitoring
- Battery status tracking
- Automatic quality switching
- Server-side optimization recommendations

✅ **Mobile Optimization**
- Adaptive chunk sizing based on network
- Battery-aware streaming
- Connection loss recovery
- Background mode detection

✅ **Production Ready**
- Docker & Docker Compose support
- Nginx reverse proxy configuration
- Systemd service file
- Comprehensive error handling
- Extensive logging

## 📦 Project Structure

```
ratatron-backend/
├── server.js                  # Main Node.js server
├── client-integration.js      # WebSocket client library
├── integration-example.js     # Complete usage example
├── package.json              # Dependencies
├── .env.example              # Configuration template
├── Dockerfile                # Docker image
├── docker-compose.yml        # Multi-service setup
├── nginx-config.conf         # Nginx reverse proxy
├── ratatron.service          # Systemd service
├── DEPLOYMENT_GUIDE.md       # Detailed deployment instructions
└── uploads/                  # Temporary video storage
```

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install Node.js 18+
node --version  # v18.0.0 or higher

# Install FFmpeg
ffmpeg -version

# Install Docker (optional)
docker --version
```

### 2. Setup

```bash
# Clone repository
git clone https://github.com/yourusername/ratatron-backend.git
cd ratatron-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Google credentials
```

### 3. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project "Ratatron"
3. Enable: Google Drive API
4. Create OAuth 2.0 credentials (Web Application)
5. Add redirect URI: `http://localhost:3000/api/auth/google-callback`
6. Copy Client ID and Secret to `.env`

### 4. Run

```bash
# Development
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

## 🐳 Docker Quick Start

```bash
# Development with all services
docker-compose up -d

# View logs
docker-compose logs -f ratatron-backend

# Stop
docker-compose down
```

## 📚 API Reference

### REST Endpoints

**Upload Video Chunk**
```bash
POST /api/upload-chunk
Content-Type: multipart/form-data

curl -X POST http://localhost:3000/api/upload-chunk \
  -F "chunk=@video.webm" \
  -F "sessionId=session-123" \
  -F "chunkIndex=0" \
  -F "totalChunks=10" \
  -F "preset=4g"
```

**Get Session Status**
```bash
GET /api/session/:sessionId

curl http://localhost:3000/api/session/session-123
```

**Quality Presets**
```bash
GET /api/quality-presets

curl http://localhost:3000/api/quality-presets
```

**Server Health**
```bash
GET /api/health

curl http://localhost:3000/api/health
```

**Statistics**
```bash
GET /api/stats

curl http://localhost:3000/api/stats
```

### WebSocket Events

**Connect & Init**
```javascript
const ws = new WebSocket('ws://localhost:3000');
ws.send(JSON.stringify({
  type: 'init',
  clientId: 'client-123',
  preset: '4g'
}));
```

**Send Network Stats**
```javascript
ws.send(JSON.stringify({
  type: 'network-stats',
  downlink: 5.5,
  rtt: 45,
  effectiveType: '4g',
  battery: 0.85
}));
```

**Listen for Quality Recommendations**
```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'quality-recommendation') {
    console.log(`Switch to: ${message.preset}`);
  }
};
```

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3000
NODE_ENV=production

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google-callback
GOOGLE_DRIVE_FOLDER_ID=your-folder-id

# FFmpeg
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe

# Upload
MAX_FILE_SIZE=500000000
CHUNK_RETENTION_HOURS=6
SESSION_RETENTION_HOURS=24

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/server.log
```

## 🎬 Usage Example

```javascript
import RatatronApp from './integration-example.js';

// Initialize
const app = new RatatronApp({
  serverUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000'
});

await app.init();

// Request camera
await app.requestCameraAccess();

// Authenticate Google Drive
await app.authenticateGoogleDrive();

// Start recording
await app.startRecording();

// Listen for events
document.addEventListener('ratatron-event', (event) => {
  const { type, data } = event.detail;
  
  if (type === 'quality-change') {
    console.log(`Quality: ${data.preset}`);
  }
  if (type === 'session-complete') {
    console.log(`Video: ${data.driveLink}`);
  }
});

// Stop recording
await app.stopRecording();
```

## 🌐 Deployment

### AWS EC2

```bash
# SSH into instance
ssh -i key.pem ubuntu@instance.com

# Install dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm ffmpeg

# Clone and start
git clone https://github.com/yourusername/ratatron-backend.git
cd ratatron-backend
npm install
npm start
```

### Docker

```bash
docker build -t ratatron-backend .
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  -v uploads:/app/uploads \
  ratatron-backend
```

### Systemd

```bash
# Install
sudo cp ratatron.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ratatron
sudo systemctl start ratatron

# Manage
sudo systemctl status ratatron
sudo journalctl -u ratatron -f
```

### Kubernetes

```bash
kubectl create secret generic google-creds \
  --from-literal=client-id=$GOOGLE_CLIENT_ID
kubectl apply -f k8s/deployment.yaml
```

## 📊 Quality Presets

| Preset | Network | Bitrate | Resolution | FPS | Data/hr | Best For |
|--------|---------|---------|------------|-----|---------|----------|
| 5G | 5G/WiFi | 5000k | 1280×720 | 60 | 2.25GB | Archive |
| 4G | LTE | 2500k | 1280×720 | 30 | **1.1GB** | Default |
| 3G | UMTS | 1000k | 854×480 | 24 | 450MB | Low BW |
| 2G | EDGE | 500k | 640×360 | 15 | 225MB | Emergency |
| Battery | Low Power | 800k | 854×480 | 24 | 360MB | Battery |

## 🔒 Security

✅ OAuth 2.0 for Google authentication
✅ CORS protection
✅ Rate limiting
✅ File size validation
✅ HTTPS/WSS required in production
✅ Secure token storage

## 📈 Performance

- **Compression Speed**: Real-time encoding at target bitrate
- **Upload Speed**: Chunked uploads with resumable support
- **Quality**: Automatic adaptation based on network
- **Latency**: <50ms WebSocket communication

## 🐛 Troubleshooting

### FFmpeg not found
```bash
which ffmpeg
# If empty, install:
brew install ffmpeg  # macOS
sudo apt-get install ffmpeg  # Linux
```

### Google Drive upload fails
- Check `.env` credentials
- Verify folder ID
- Check Drive API is enabled
- Review rate limits (15 requests/second)

### WebSocket connection issues
- Ensure server running: `curl http://localhost:3000/api/health`
- Check firewall/NAT
- Verify WSS in production (requires HTTPS)

### High memory usage
- Reduce chunk retention time
- Enable Redis caching
- Use load balancer for scaling
- Monitor with: `ps aux | grep node`

## 📝 Logging

```bash
# View logs
tail -f logs/server.log

# With Docker
docker logs -f ratatron-backend

# With Systemd
sudo journalctl -u ratatron -f

# Set log level
export LOG_LEVEL=debug
```

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Make changes
4. Write tests
5. Submit pull request

## 📄 License

MIT - See LICENSE file

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/ratatron-backend/issues)
- **Documentation**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Email**: support@yourdomain.com

## 🎓 Learn More

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [Google Drive API](https://developers.google.com/drive/api)
- [WebSocket Specification](https://tools.ietf.org/html/rfc6455)
- [Node.js Best Practices](https://nodejs.org/en/docs/guides/)

---

**Made with ❤️ for mobile livestream cooking**

Current Version: 1.0.0 | Last Updated: 2024
