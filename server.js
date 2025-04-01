require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const Pusher = require('pusher');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB configuration
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://prashantkumar182000:pk00712345@cluster0.tehdo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0&tls=true&tlsAllowInvalidCertificates=true';
const dbName = 'chatApp';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: ['http://localhost:5173', 'https://socio-99-frontend.vercel.app', 'https://social-75.vercel.app/'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Pusher configuration
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '1962195',
  key: process.env.PUSHER_KEY || 'b499431d9b73ef39d7a6',
  secret: process.env.PUSHER_SECRET || '696fa215743b578ca737',
  cluster: 'ap2',
  useTLS: true,
});

// MongoDB connection
let db;
const connectToMongoDB = async () => {
  try {
    const client = new MongoClient(mongoUri, {
      tls: true,
      tlsAllowInvalidCertificates: true,
    });
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(dbName);

    // Create indexes
    await db.collection('mapData').createIndex({ location: '2dsphere' });
    await db.collection('connections').createIndex({ userId: 1 });
    await db.collection('connections').createIndex({ connectedUserId: 1 });
    await db.collection('messages').createIndex({ channel: 1, timestamp: 1 });
    await db.collection('messages').createIndex({ replyTo: 1 });
    
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
};

// ================== ENHANCED CHAT ENDPOINTS ================== //

// Get messages by channel
app.get('/api/messages', async (req, res) => {
  try {
    const { channel = 'general' } = req.query;
    const messages = await db.collection('messages')
      .find({ channel })
      .sort({ timestamp: 1 })
      .toArray();
    
    // Structure replies as nested
    const messagesWithReplies = messages.filter(m => !m.replyTo);
    for (const message of messagesWithReplies) {
      message.replies = messages.filter(m => m.replyTo?.toString() === message._id.toString());
    }

    res.status(200).json(messagesWithReplies);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// Send message (with channel and reply support)
app.post('/api/send-message', async (req, res) => {
  try {
    const { text, user, channel = 'general', replyTo } = req.body;
    
    const message = {
      text,
      user: {
        uid: user.uid,
        name: user.name || user.email.split('@')[0],
        avatar: user.avatar || ''
      },
      channel,
      replyTo: replyTo ? new ObjectId(replyTo) : null,
      timestamp: new Date().toISOString()
    };

    const result = await db.collection('messages').insertOne(message);
    const insertedMessage = { ...message, _id: result.insertedId };

    // Trigger Pusher event for real-time update
    pusher.trigger(`chat-${channel}`, 'new-message', insertedMessage);

    res.status(200).json({ 
      success: true, 
      message: insertedMessage 
    });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message' 
    });
  }
});

// ================== EXISTING ENDPOINTS (UNCHANGED) ================== //

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Map Data endpoints
app.get('/api/map', async (req, res) => {
  try {
    const mapData = await db.collection('mapData').find().toArray();
    res.status(200).json(mapData);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch map data' });
  }
});

app.post('/api/map', async (req, res) => {
  try {
    const { location, interest, category } = req.body;
    const newLocation = {
      location,
      interest,
      category,
      timestamp: new Date().toISOString()
    };
    await db.collection('mapData').insertOne(newLocation);
    res.status(201).json({ success: true, data: newLocation });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to add location' });
  }
});

// Connection endpoints
app.post('/api/connections', async (req, res) => {
  try {
    const { userId, connectedUserId } = req.body;
    
    const existingConnection = await db.collection('connections').findOne({
      $or: [
        { userId, connectedUserId },
        { userId: connectedUserId, connectedUserId: userId }
      ]
    });

    if (existingConnection) {
      return res.status(400).json({ 
        success: false, 
        message: 'Connection already exists' 
      });
    }

    const newConnection = {
      userId,
      connectedUserId,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    const result = await db.collection('connections').insertOne(newConnection);
    
    pusher.trigger(`user-${connectedUserId}`, 'connection', {
      type: 'request',
      connection: { ...newConnection, _id: result.insertedId }
    });

    res.status(201).json({ 
      success: true, 
      connection: { ...newConnection, _id: result.insertedId }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/connections/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    const connection = await db.collection('connections').findOne({ 
      _id: new ObjectId(id) 
    });
    
    if (!connection) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }

    const updatedConnection = {
      ...connection,
      status,
      updatedAt: new Date().toISOString()
    };

    await db.collection('connections').updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedConnection }
    );

    // Notify both users
    [connection.userId, connection.connectedUserId].forEach(userId => {
      pusher.trigger(`user-${userId}`, 'connection', {
        type: 'update',
        connection: updatedConnection
      });
    });

    res.status(200).json({ success: true, connection: updatedConnection });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/users/:userId/connections', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const connections = await db.collection('connections').find({
      $or: [{ userId }, { connectedUserId: userId }]
    }).toArray();

    // Enrich with user data
    const enrichedConnections = await Promise.all(
      connections.map(async conn => {
        const [user, connectedUser] = await Promise.all([
          db.collection('users').findOne({ _id: new ObjectId(conn.userId) }),
          db.collection('users').findOne({ _id: new ObjectId(conn.connectedUserId) })
        ]);
        return { ...conn, user, connectedUser };
      })
    );

    res.status(200).json(enrichedConnections);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Content endpoints
const TED_API_KEY = process.env.TED_API_KEY || '12a5ce8dcamshf1e298383db9dd5p1d32bfjsne685c7209647';
const TED_API_HOST = process.env.TED_API_HOST || 'ted-talks-api.p.rapidapi.com';

app.get('/api/content', async (req, res) => {
  try {
    const talks = await db.collection('tedTalks').find().toArray();
    res.status(200).json(talks);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch content' });
  }
});

// NGO endpoints
app.get('/api/action-hub', async (req, res) => {
  try {
    const ngos = await db.collection('ngos').find().toArray();
    res.status(200).json(ngos);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch NGOs' });
  }
});

// Data refresh functions (unchanged)
const refreshTEDTalks = async () => {
  try {
    const response = await axios.get('https://ted-talks-api.p.rapidapi.com/talks', {
      headers: {
        'x-rapidapi-key': TED_API_KEY,
        'x-rapidapi-host': TED_API_HOST
      },
      params: {
        from_record_date: '2017-01-01',
        min_duration: '300',
        audio_lang: 'en'
      }
    });

    const talks = response.data.result.results.map(talk => ({
      id: talk.id,
      title: talk.title,
      description: talk.description,
      duration: talk.duration,
      speaker: talk.speaker,
      url: talk.url,
      thumbnail: talk.thumbnail
    }));

    await db.collection('tedTalks').deleteMany({});
    await db.collection('tedTalks').insertMany(talks);
    console.log('TED Talks updated');
  } catch (err) {
    console.error('TED Talks refresh failed:', err.message);
  }
};

const refreshNGOs = async () => {
  try {
    const response = await axios.get(
      'https://projects.propublica.org/nonprofits/api/v2/search.json?q=environment'
    );
    
    const ngos = response.data.organizations.map(org => ({
      id: org.ein,
      name: org.name,
      mission: org.ntee_classification || 'No mission available',
      location: `${org.city}, ${org.state}`,
      website: org.website || '',
      category: 'environment'
    }));

    await db.collection('ngos').deleteMany({});
    await db.collection('ngos').insertMany(ngos);
    console.log('NGO data updated');
  } catch (err) {
    console.error('NGO refresh failed:', err.message);
  }
};

// Server startup
const startServer = async () => {
  await connectToMongoDB();
  
  // Initial data load
  await Promise.all([refreshTEDTalks(), refreshNGOs()]);
  
  // Scheduled refreshes
  setInterval(refreshTEDTalks, 3600000); // 1 hour
  setInterval(refreshNGOs, 3600000); // 1 hour

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  }).on('error', err => {
    console.error('Server error:', err);
    process.exit(1);
  });
};

startServer();