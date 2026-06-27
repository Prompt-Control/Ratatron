const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { google } = require('googleapis');
const { Readable } = require('stream');
require('dotenv').config();

const execPromise = promisify(exec);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware - Allow local network connections
app.use(cors({
  origin: function(origin, callback) {
    // Allow localhost, 127.0.0.1, and local network IPs (192.168.x.x, 10.x.x.x)
    const allowedPatterns = [
      'localhost',
      '127.0.0.1',
      /^http:\/\/192\.168\.\d+\.\d+/,
      /^http:\/\/10\.\d+\.\d+\.\d+/,
      /^https:\/\//
    ];
    
    if (!origin || allowedPatterns.some(pattern => 
      typeof pattern === 'string' ? origin.includes(pattern) : pattern.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (HTML, CSS, JS)
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Configure multer for temporary chunk storage
const tempDir = path.join(__dirname, 'temp-chunks');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

// Google Drive OAuth Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

let drive = null;

// Session tracking
const sessions = new Map();
const driveUploads = new Map();
const clients = new Map();

// Quality presets
const QUALITY_PRESETS = {
  '5g': {
    resolution: '1280x720',
    bitrate: '5000k',
    fps: 60,
    preset: 'superfast',
    crf: 20,
    label: '5G/WiFi - HD Quality'
  },
  '4g': {
    resolution: '1280x720',
    bitrate: '2500k',
    fps: 30,
    preset: 'fast',
    crf: 24,
    label: '4G - Balanced'
  },
  '3g': {
    resolution: '854x480',
    bitrate: '1000k',
    fps: 24,
    preset: 'medium',
    crf: 26,
    label: '3G - Low Bandwidth'
  },
  '2g': {
    resolution: '640x360',
    bitrate: '500k',
    fps: 15,
    preset: 'slow',
    crf: 28,
    label: '2G - Minimal'
  },
  'battery': {
    resolution: '854x480',
    bitrate: '800k',
    fps: 24,
    preset: 'medium',
    crf: 27,
    label: 'Battery Saver'
  }
};

// ==================== GOOGLE DRIVE FUNCTIONS ====================

// Get authorization URL
app.get('/api/auth/google-url', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.json({ authUrl });
});

// Handle OAuth callback (GET from Google redirect)
app.get('/api/auth/google-callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code received' });
    }
    
    const { tokens } = await oauth2Client.getToken(code);
    
    oauth2Client.setCredentials(tokens);
    
    // Save tokens to file for persistence
    fs.writeFileSync('.auth-token.json', JSON.stringify(tokens));
    
    drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    // Redirect back to app with success message
    res.redirect(`/?auth=success&message=Google Drive authenticated successfully!`);
  } catch (err) {
    console.error('OAuth error:', err);
    res.redirect(`/?auth=error&message=${encodeURIComponent(err.message)}`);
  }
});

// Also keep POST handler for direct API calls
app.post('/api/auth/google-callback', async (req, res) => {
  try {
    const { code } = req.body;
    const { tokens } = await oauth2Client.getToken(code);
    
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync('.auth-token.json', JSON.stringify(tokens));
    drive = google.drive({ version: 'v3', auth: oauth2Client });
    
    res.json({ success: true, message: 'Google Drive authenticated' });
  } catch (err) {
    console.error('OAuth error:', err);
    res.status(400).json({ error: 'Authentication failed' });
  }
});

// Load saved auth token on startup
function loadAuthToken() {
  try {
    if (fs.existsSync('.auth-token.json')) {
      const tokens = JSON.parse(fs.readFileSync('.auth-token.json', 'utf8'));
      oauth2Client.setCredentials(tokens);
      drive = google.drive({ version: 'v3', auth: oauth2Client });
      console.log('✓ Google Drive authenticated from saved token');
    }
  } catch (err) {
    console.error('Failed to load auth token:', err);
  }
}

// Create or get video folder in Google Drive
async function ensureVideoFolder() {
  try {
    if (!drive) {
      throw new Error('Google Drive not authenticated');
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || 'root';
    
    // Get or create "Ratatron Videos" folder
    const result = await drive.files.list({
      q: `name='Ratatron Videos' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      spaces: 'drive',
      pageSize: 1,
      fields: 'files(id, name)'
    });

    if (result.data.files.length > 0) {
      return result.data.files[0].id;
    }

    // Create folder if it doesn't exist
    const folderRes = await drive.files.create({
      resource: {
        name: 'Ratatron Videos',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folderId]
      },
      fields: 'id'
    });

    console.log('Created Ratatron Videos folder:', folderRes.data.id);
    return folderRes.data.id;
  } catch (err) {
    console.error('Error ensuring video folder:', err);
    throw err;
  }
}

// Stream and upload file directly to Google Drive
async function streamToGoogleDrive(filePath, fileName, sessionId) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!drive) {
        throw new Error('Google Drive not authenticated');
      }

      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;
      const videoFolderId = await ensureVideoFolder();

      const fileMetadata = {
        name: fileName,
        parents: [videoFolderId],
        description: `Ratatron livestream - Session ${sessionId}`
      };

      const media = {
        mimeType: 'video/mp4',
        body: fs.createReadStream(filePath)
      };

      console.log(`Starting upload to Drive: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);

      const request = drive.files.create(
        {
          resource: fileMetadata,
          media: media,
          fields: 'id, webViewLink, size, name'
        },
        {
          onUploadProgress: (evt) => {
            const progress = Math.round((evt.bytesProcessed / fileSize) * 100);
            console.log(`Drive upload: ${fileName} - ${progress}%`);
            
            broadcastToSession(sessionId, {
              type: 'drive-upload-progress',
              progress,
              fileName,
              bytesProcessed: evt.bytesProcessed,
              totalBytes: fileSize
            });
          }
        }
      );

      const response = await request;
      
      console.log(`✓ File uploaded to Google Drive: ${response.data.name}`);
      console.log(`  Link: ${response.data.webViewLink}`);

      // Clean up local file
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.error('Error deleting local file:', err);
      }

      resolve({
        fileId: response.data.id,
        fileName: response.data.name,
        webLink: response.data.webViewLink,
        size: response.data.size
      });

    } catch (err) {
      console.error('Google Drive upload error:', err);
      reject(err);
    }
  });
}

// ==================== FFmpeg COMPRESSION ====================

async function compressVideo(inputPath, outputPath, preset = '4g', sessionId) {
  return new Promise((resolve, reject) => {
    const config = QUALITY_PRESETS[preset];
    if (!config) {
      return reject(new Error(`Unknown preset: ${preset}`));
    }

    console.log(`Compressing: ${path.basename(inputPath)} with preset: ${preset}`);

    const ffmpegCommand = `ffmpeg -i "${inputPath}" \
      -c:v libx264 \
      -b:v ${config.bitrate} \
      -s ${config.resolution} \
      -r ${config.fps} \
      -preset ${config.preset} \
      -crf ${config.crf} \
      -c:a aac \
      -b:a 128k \
      -movflags +faststart \
      "${outputPath}"`;

    const startTime = Date.now();
    const process = exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', error);
        return reject(error);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const fileSize = fs.statSync(outputPath).size;
      const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

      console.log(`✓ Compressed in ${duration}s -> ${fileSizeMB}MB`);

      broadcastToSession(sessionId, {
        type: 'compression-complete',
        fileSize: fileSizeMB,
        duration: parseFloat(duration)
      });

      resolve({
        outputPath,
        fileSize,
        preset: config.label
      });
    });

    // Report progress
    const progressInterval = setInterval(() => {
      if (fs.existsSync(outputPath)) {
        const currentSize = fs.statSync(outputPath).size;
        broadcastToSession(sessionId, {
          type: 'compression-progress',
          currentSize: (currentSize / 1024 / 1024).toFixed(2)
        });
      }
    }, 5000);

    process.on('exit', () => clearInterval(progressInterval));
  });
}

// ==================== CHUNK MANAGEMENT ====================

app.post('/api/upload-chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { sessionId, chunkIndex, totalChunks, preset } = req.body;
    
    console.log(`\n📥 Chunk upload request:`);
    console.log(`   Session: ${sessionId}`);
    console.log(`   Chunk: ${chunkIndex}/${totalChunks}`);
    console.log(`   Preset: ${preset}`);
    console.log(`   File received: ${req.file ? 'YES' : 'NO'}`);
    
    if (!req.file) {
      console.error('❌ No file in upload request');
      return res.status(400).json({ error: 'No file provided' });
    }

    const chunkSizeMB = (req.file.size / 1024 / 1024).toFixed(2);
    console.log(`   Size: ${chunkSizeMB}MB`);
    console.log(`   Path: ${req.file.path}`);

    // Initialize session if needed
    if (!sessions.has(sessionId)) {
      console.log(`✓ Creating new session: ${sessionId}`);
      sessions.set(sessionId, {
        chunks: [],
        preset,
        startTime: Date.now(),
        totalChunks: parseInt(totalChunks),
        status: 'recording',
        driveFileId: null,
        driveLink: null
      });
    }

    const session = sessions.get(sessionId);
    session.chunks.push({
      index: parseInt(chunkIndex),
      path: req.file.path,
      size: req.file.size,
      uploadedAt: Date.now()
    });

    console.log(`✓ Chunk ${chunkIndex} stored. Total chunks received: ${session.chunks.length}/${session.totalChunks}`);

    const allChunksReceived = session.chunks.length === session.totalChunks;

    res.json({
      success: true,
      chunkIndex,
      received: session.chunks.length,
      totalChunks: session.totalChunks,
      allReceived: allChunksReceived,
      nextChunkSize: calculateOptimalChunkSize(preset)
    });

    // Process when all chunks received
    if (allChunksReceived) {
      console.log(`\n🎬 All chunks received! Starting processing...`);
      processCompleteSession(sessionId);
    }

  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

function calculateOptimalChunkSize(preset) {
  const sizeMap = {
    '5g': 5 * 1024 * 1024,
    '4g': 2 * 1024 * 1024,
    '3g': 1 * 1024 * 1024,
    '2g': 500 * 1024,
    'battery': 1 * 1024 * 1024
  };
  return sizeMap[preset] || sizeMap['4g'];
}

// Stitch chunks and process
async function processCompleteSession(sessionId) {
  try {
    console.log(`Processing session ${sessionId}...`);
    
    const session = sessions.get(sessionId);
    session.status = 'processing';

    // Sort chunks by index
    session.chunks.sort((a, b) => a.index - b.index);

    // Stitch chunks
    const stitchedPath = path.join(tempDir, `stitched-${sessionId}.webm`);
    await stitchChunks(session.chunks.map(c => c.path), stitchedPath, sessionId);

    broadcastToSession(sessionId, {
      type: 'status',
      message: 'Chunks stitched, compressing...',
      stage: 'compression'
    });

    // Compress video
    const compressedPath = path.join(tempDir, `compressed-${sessionId}.mp4`);
    const compressionResult = await compressVideo(
      stitchedPath,
      compressedPath,
      session.preset,
      sessionId
    );

    broadcastToSession(sessionId, {
      type: 'status',
      message: 'Compression complete, uploading to Google Drive...',
      stage: 'upload'
    });

    // Upload directly to Google Drive
    const fileName = `Ratatron-${new Date().toISOString().split('T')[0]}-${sessionId.substring(8)}.mp4`;
    const driveResult = await streamToGoogleDrive(compressedPath, fileName, sessionId);

    // Clean up stitched file
    try {
      fs.unlinkSync(stitchedPath);
    } catch (err) {
      console.error('Error deleting stitched file:', err);
    }

    // Update session
    session.status = 'completed';
    session.driveLink = driveResult.webLink;
    session.driveFileId = driveResult.fileId;
    session.completedAt = Date.now();
    session.finalFileName = driveResult.fileName;

    console.log(`✓ Session ${sessionId} completed successfully`);

    broadcastToSession(sessionId, {
      type: 'session-complete',
      driveLink: driveResult.webLink,
      fileName: driveResult.fileName,
      fileSize: driveResult.size,
      status: 'completed'
    });

  } catch (err) {
    console.error('Session processing error:', err);
    
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'error';
      session.error = err.message;
    }

    broadcastToSession(sessionId, {
      type: 'error',
      message: 'Processing failed: ' + err.message,
      stage: 'failed'
    });
  }
}

// Stitch chunks together
function stitchChunks(chunkPaths, outputPath, sessionId) {
  return new Promise((resolve, reject) => {
    const fileListPath = path.join(tempDir, `filelist-${Date.now()}.txt`);
    
    const fileList = chunkPaths
      .map(chunk => `file '${chunk}'`)
      .join('\n');
    
    fs.writeFileSync(fileListPath, fileList);

    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy "${outputPath}"`;
    
    exec(ffmpegCommand, (error) => {
      try {
        fs.unlinkSync(fileListPath);
      } catch (e) {}
      
      if (error) {
        reject(error);
      } else {
        // Delete chunk files
        chunkPaths.forEach(chunk => {
          try {
            fs.unlinkSync(chunk);
          } catch (e) {
            console.error('Error deleting chunk:', e);
          }
        });
        resolve();
      }
    });
  });
}

// ==================== WEBSOCKET QUALITY NEGOTIATION ====================

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  let clientId = null;
  let currentPreset = '4g';

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'init':
          clientId = data.clientId;
          currentPreset = data.preset || '4g';
          clients.set(clientId, {
            ws,
            currentPreset,
            sessionId: data.sessionId
          });
          
          ws.send(JSON.stringify({
            type: 'init-response',
            message: 'Connected to Ratatron backend',
            availablePresets: Object.keys(QUALITY_PRESETS),
            driveAuthenticated: !!drive
          }));
          break;

        case 'network-stats':
          const recommendation = analyzeNetworkAndRecommend(
            data.downlink,
            data.rtt,
            data.effectiveType,
            data.battery
          );

          if (recommendation.preset !== currentPreset && recommendation.confidence > 0.7) {
            currentPreset = recommendation.preset;
            
            ws.send(JSON.stringify({
              type: 'quality-recommendation',
              preset: recommendation.preset,
              reason: recommendation.reason,
              confidence: recommendation.confidence,
              config: QUALITY_PRESETS[recommendation.preset]
            }));

            console.log(`Quality switch: ${recommendation.preset} (${recommendation.reason})`);
          }

          ws.send(JSON.stringify({
            type: 'server-status',
            activeSessions: sessions.size,
            driveAuthenticated: !!drive
          }));
          break;

        case 'heartbeat':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    if (clientId) {
      clients.delete(clientId);
      console.log(`Client ${clientId} disconnected`);
    }
  });
});

function analyzeNetworkAndRecommend(downlink, rtt, effectiveType, battery) {
  let preset = '4g';
  let reason = 'Default';
  let confidence = 0.5;

  if (battery && battery < 0.2) {
    return {
      preset: 'battery',
      reason: 'Low battery detected',
      confidence: 0.95
    };
  }

  if (effectiveType) {
    const typeMap = {
      '5g': { preset: '5g', confidence: 0.9 },
      '4g': { preset: '4g', confidence: 0.85 },
      '3g': { preset: '3g', confidence: 0.8 },
      '2g': { preset: '2g', confidence: 0.75 },
      'slow-2g': { preset: '2g', confidence: 0.8 }
    };

    if (typeMap[effectiveType]) {
      const rec = typeMap[effectiveType];
      preset = rec.preset;
      reason = `Network type: ${effectiveType}`;
      confidence = rec.confidence;
    }
  }

  if (downlink !== undefined) {
    if (downlink < 1) {
      preset = '2g';
      reason = `Very low downlink: ${downlink.toFixed(2)} Mbps`;
      confidence = 0.9;
    } else if (downlink < 2) {
      preset = '3g';
      reason = `Low downlink: ${downlink.toFixed(2)} Mbps`;
      confidence = 0.85;
    } else if (downlink > 10) {
      preset = '5g';
      reason = `High downlink: ${downlink.toFixed(2)} Mbps`;
      confidence = 0.8;
    }
  }

  return { preset, reason, confidence };
}

function broadcastToSession(sessionId, message) {
  clients.forEach((client) => {
    if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  });
}

// ==================== REST ENDPOINTS ====================

// Root route
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ratatron Livestream Backend</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; margin: 0; padding: 20px; background: #f9f7f5; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #FF6B35; }
        .status { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .status-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
        .status-item:last-child { border-bottom: none; }
        .value { font-weight: 600; }
        .ok { color: #2ECB71; }
        a { color: #FF6B35; text-decoration: none; }
        .endpoint { background: #f5f5f5; padding: 10px; margin: 5px 0; border-radius: 4px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🐀 Ratatron Livestream Backend</h1>
        <p>Direct Google Drive Streaming Version</p>
        
        <div class="status">
          <h2>Server Status</h2>
          <div class="status-item">
            <span>Status</span>
            <span class="value ok">✓ Running</span>
          </div>
          <div class="status-item">
            <span>Port</span>
            <span class="value">${process.env.PORT || 3000}</span>
          </div>
          <div class="status-item">
            <span>Google Drive</span>
            <span class="value ${drive ? 'ok' : ''}">${drive ? '✓ Connected' : '⚠ Not authenticated'}</span>
          </div>
        </div>

        <div class="status">
          <h2>Features</h2>
          <p>✓ Real-time video streaming to Google Drive</p>
          <p>✓ Automatic video compression</p>
          <p>✓ WebSocket quality negotiation</p>
          <p>✓ Chunked uploads with resumable support</p>
          <p>✓ Multi-quality presets</p>
        </div>

        <div class="status">
          <h2>API Endpoints</h2>
          <div class="endpoint">POST /api/upload-chunk - Upload video chunk</div>
          <div class="endpoint">GET /api/session/:sessionId - Session status</div>
          <div class="endpoint">GET /api/health - Health check</div>
          <div class="endpoint">GET /api/stats - Server statistics</div>
          <div class="endpoint">GET /api/auth/google-url - Authenticate Google Drive</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    driveAuthenticated: !!drive,
    activeSessions: sessions.size,
    connectedClients: clients.size
  });
});

app.get('/api/stats', (req, res) => {
  const completedSessions = Array.from(sessions.values()).filter(s => s.status === 'completed');
  
  res.json({
    totalSessions: sessions.size,
    completedSessions: completedSessions.length,
    connectedClients: clients.size,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/quality-presets', (req, res) => {
  const formattedPresets = {};
  Object.entries(QUALITY_PRESETS).forEach(([key, value]) => {
    formattedPresets[key] = {
      label: value.label,
      resolution: value.resolution,
      bitrate: value.bitrate,
      fps: value.fps
    };
  });
  res.json(formattedPresets);
});

app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions.has(sessionId)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = sessions.get(sessionId);
  res.json({
    sessionId,
    status: session.status,
    startTime: session.startTime,
    completedAt: session.completedAt,
    chunksReceived: session.chunks.length,
    totalChunks: session.totalChunks,
    preset: session.preset,
    driveLink: session.driveLink,
    driveFileId: session.driveFileId,
    fileName: session.finalFileName,
    error: session.error
  });
});

// Debug endpoint - check all sessions
app.get('/api/debug/sessions', (req, res) => {
  const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
    sessionId: id,
    status: session.status,
    chunksReceived: session.chunks.length,
    totalChunks: session.totalChunks,
    preset: session.preset,
    driveConnected: session.driveLink ? 'Yes' : 'No',
    error: session.error
  }));

  res.json({
    totalSessions: sessions.size,
    driveAuthenticated: !!drive,
    sessions: sessionList
  });
});

// Debug endpoint - check temp files
app.get('/api/debug/files', (req, res) => {
  try {
    const files = fs.readdirSync(tempDir);
    const fileDetails = files.map(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
        created: new Date(stats.birthtimeMs).toLocaleString()
      };
    });

    res.json({
      tempDirectory: tempDir,
      fileCount: files.length,
      files: fileDetails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CLEANUP ====================

// Cleanup old temp files
setInterval(() => {
  try {
    const files = fs.readdirSync(tempDir);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtimeMs < oneHourAgo) {
        fs.unlinkSync(filePath);
        console.log(`Cleaned up: ${file}`);
      }
    });
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 60 * 60 * 1000);

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

loadAuthToken();

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   Ratatron Livestream Backend                  ║
║   Direct Google Drive Streaming Version        ║
╚════════════════════════════════════════════════╝

✓ Server running on http://localhost:${PORT}
✓ WebSocket endpoint: ws://localhost:${PORT}
✓ Temp directory: ${tempDir}
${drive ? '✓ Google Drive authenticated' : '⚠ Google Drive not authenticated'}

Ready to stream directly to Google Drive!
`);
});

module.exports = app;
