require('dotenv').config(); // Load environment variables from .env
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Pusher = require('pusher');
const { MongoClient } = require('mongodb');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {  // Add '0.0.0.0' as the host
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

// MongoDB connection string
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://prashantkumar182000:pk00712345@cluster0.tehdo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0&tls=true&tlsAllowInvalidCertificates=true';
const dbName = 'chatApp'; // Database name
const collectionName = 'messages'; // Collection name

// Allow all origins and methods for testing
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(bodyParser.json());

// Initialize Pusher
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '1962195', // Use environment variable or fallback
  key: process.env.PUSHER_KEY || 'b499431d9b73ef39d7a6', // Use environment variable or fallback
  secret: process.env.PUSHER_SECRET || '696fa215743b578ca737', // Use environment variable or fallback
  cluster: 'ap2',
  useTLS: true,
});

// Connect to MongoDB
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

    // Ensure the mapData collection exists
    await db.collection('mapData').createIndex({ location: '2dsphere' });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1); // Exit the process if MongoDB connection fails
  }
};

// TED Talks API Configuration
const TED_API_KEY = process.env.TED_API_KEY || 'f1b84ba8d5msh39123d7aaeb4059p193333jsn35da293d6c7d'; // Your RapidAPI key
const TED_API_HOST = process.env.TED_API_HOST || 'ted-talks-api.p.rapidapi.com';

// Fetch TED Talks data
const fetchTEDTalks = async () => {
  try {
    const response = await axios.get('https://ted-talks-api.p.rapidapi.com/talks', {
      params: {
        from_record_date: '2017-01-01',
        min_duration: '300',
        audio_lang: 'en',
        subtitle_lang: 'he',
        speaker: 'yuval_noah_harari',
        topic: 'politics',
      },
      headers: {
        'x-rapidapi-key': TED_API_KEY,
        'x-rapidapi-host': TED_API_HOST,
      },
    });

    // Extract the results array from the API response
    const talks = response.data.result.results.map((talk) => ({
      id: talk.id,
      title: talk.title,
      type: 'Video',
      description: talk.description,
      duration: talk.duration,
      speaker: talk.speaker,
      thumbnail: talk.thumbnail,
      url: talk.url,
    }));

    // Update MongoDB collection
    await db.collection('tedTalks').deleteMany({});
    await db.collection('tedTalks').insertMany(talks);
    console.log('TED Talks data refreshed successfully');
  } catch (err) {
    console.error('Failed to fetch TED Talks:', err);
  }
};

// NGO Data Fetching
const refreshNGOData = async () => {
  try {
    const response = await axios.get(
      'https://projects.propublica.org/nonprofits/api/v2/search.json?q=environment',
    );
    const ngos = response.data.organizations.map((org) => ({
      id: org.ein, // Use EIN as unique ID
      name: org.name,
      type: 'NGO',
      description: org.ntee_code || 'No description available',
      website: org.website || 'Not available',
      location: `${org.city}, ${org.state}`, // Combine city and state
      mission: org.ntee_classification || 'No mission statement available',
    }));

    // Update MongoDB collection
    await db.collection('ngos').deleteMany({});
    await db.collection('ngos').insertMany(ngos);
    console.log('NGO data refreshed successfully');
  } catch (err) {
    console.error('NGO refresh failed:', err);
  }
};

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Endpoint to fetch map data
app.get('/api/map', async (req, res) => {
  try {
    const mapData = await db.collection('mapData').find().toArray();
    res.status(200).json(mapData);
  } catch (err) {
    console.error('Failed to fetch map data:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch map data' });
  }
});

// Endpoint to add a new location to the map
app.post('/api/map', async (req, res) => {
  const { location, interest, category } = req.body;

  if (!location || !interest || !category) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const newLocation = {
      location,
      interest,
      category,
      timestamp: new Date().toISOString()
    };

    await db.collection('mapData').insertOne(newLocation);
    res.status(201).json({ success: true, message: 'Location added successfully', data: newLocation });
  } catch (err) {
    console.error('Failed to add location:', err);
    res.status(500).json({ success: false, message: 'Failed to add location' });
  }
});

// Pusher endpoint for sending messages
app.post('/api/send-message', async (req, res) => {
  const message = req.body;
  console.log('Received message:', message);

  // Save message to MongoDB
  try {
    await db.collection(collectionName).insertOne(message);
    console.log('Message saved to MongoDB');
  } catch (err) {
    console.error('Failed to save message to MongoDB:', err);
    return res.status(500).json({ success: false, message: 'Failed to save message' });
  }

  // Trigger a 'message' event on the 'chat' channel
  pusher.trigger('chat', 'message', message, (err) => {
    if (err) {
      console.error('Pusher trigger error:', err);
      return res.status(500).json({ success: false, message: 'Failed to send message' });
    }
    res.status(200).json({ success: true, message: 'Message sent' });
  });
});

// Endpoint to fetch all messages
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await db.collection(collectionName).find().toArray();
    res.status(200).json(messages);
  } catch (err) {
    console.error('Failed to fetch messages:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// Endpoint to fetch TED Talks
app.get('/api/content', async (req, res) => {
  try {
    const talks = await db.collection('tedTalks').find().toArray();
    res.status(200).json(talks);
  } catch (err) {
    console.error('Failed to fetch TED Talks:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch content' });
  }
});

// Endpoint to fetch NGO data
app.get('/api/action-hub', async (req, res) => {
  try {
    const ngos = await db.collection('ngos').find().toArray();
    res.status(200).json(ngos);
  } catch (err) {
    console.error('Failed to fetch NGOs:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch NGOs' });
  }
});

// Start the server and initialize data
const startServer = async () => {
  await connectToMongoDB();
  await fetchTEDTalks(); // Initial TED Talks fetch
  await refreshNGOData(); // Initial NGO data fetch

  // Schedule periodic refreshes
  setInterval(fetchTEDTalks, 3600000); // Refresh TED Talks every hour
  setInterval(refreshNGOData, 3600000); // Refresh NGO data every hour

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

// Start the server
startServer();