require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const Pusher = require('pusher');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB configuration
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://prashantkumar182000:pk00712345@cluster0.tehdo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0&tls=true&tlsAllowInvalidCertificates=true';
const dbName = 'chatApp';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5173',
    'https://socio-99-frontend.vercel.app',
    'https://soc-ial75.netlify.app'
  ];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-Request-Id');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ================== RATE LIMITING ================== //
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false // Disable deprecated headers
});

// Apply to all API routes
app.use('/api/', apiLimiter);
// ================== RATE LIMITING ================== //

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
    await db.collection('messages').createIndex({ channel: 1, timestamp: 1 });
    await db.collection('messages').createIndex({ replyTo: 1 });
    await db.collection('mapData').createIndex({ location: '2dsphere' });
    await db.collection('connections').createIndex({ userId: 1 });
    await db.collection('connections').createIndex({ connectedUserId: 1 });
    await db.collection('userPassions').createIndex({ userId: 1 });
    await db.collection('passionQuestions').createIndex({ id: 1 });
    await db.collection('passionProfiles').createIndex({ tags: 1 });
    
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
};

// ================== PRE-LOADED DATA ================== //

const DEFAULT_PASSION_QUESTIONS = [
  {
    id: 1,
    text: "When you have free time, you're most likely to...",
    options: [
      { text: "Read books/articles", tags: ["education", "research"] },
      { text: "Volunteer locally", tags: ["community", "social"] },
      { text: "Watch documentaries", tags: ["awareness", "global"] },
      { text: "Organize events", tags: ["leadership", "activism"] }
    ]
  },
  {
    id: 2,
    text: "Which global issue concerns you most?",
    options: [
      { text: "Climate change", tags: ["environment", "sustainability"] },
      { text: "Education inequality", tags: ["education", "children"] },
      { text: "Human rights", tags: ["social", "justice"] },
      { text: "Public health", tags: ["health", "medicine"] }
    ]
  },
  {
    id: 3,
    text: "Your ideal vacation involves...",
    options: [
      { text: "Learning a new skill", tags: ["growth", "workshops"] },
      { text: "Helping a community", tags: ["service", "ngos"] },
      { text: "Exploring nature", tags: ["environment", "outdoors"] },
      { text: "Meeting activists", tags: ["networking", "change-makers"] }
    ]
  }
];

const DEFAULT_PASSION_PROFILES = [
  {
    id: "env-001",
    title: "Environmental Activist",
    subtitle: "For planet protectors and sustainability champions",
    description: "Your responses show strong alignment with environmental causes. You likely feel deeply connected to nature and are concerned about climate change, pollution, and biodiversity loss.",
    category: "environment",
    tags: ["environment", "sustainability", "climate", "nature"],
    resources: [
      {
        type: "TED Talk",
        title: "The disarming case to act right now on climate change",
        link: "https://www.ted.com/talks/greta_thunberg_the_disarming_case_to_act_right_now_on_climate_change",
        image: "https://pi.tedcdn.com/r/talkstar-photos.s3.amazonaws.com/uploads/72bda89f-9bbf-4685-910a-2f151c25f0a9/GretaThunberg_2019T-embed.jpg?"
      },
      {
        type: "Course",
        title: "Environmental Science and Sustainability",
        link: "https://www.coursera.org/learn/environmental-science",
        image: "https://d3njjcbhbojbot.cloudfront.net/api/utilities/v1/imageproxy/https://s3.amazonaws.com/coursera-course-photos/0d/c0c55059a411e8a1a4a59cf2d6a88a/Environmental_Science.jpg"
      }
    ],
    actions: [
      { text: "Join the next global climate strike", link: "https://fridaysforfuture.org" },
      { text: "Calculate your carbon footprint", link: "https://www.carbonfootprint.com/calculator.aspx" },
      { text: "Start a recycling program in your community", link: "" }
    ]
  },
  {
    id: "edu-001",
    title: "Education Reformer",
    subtitle: "For those passionate about learning equity",
    description: "Your responses indicate a strong passion for education and knowledge sharing. You likely believe education is a fundamental human right and want to make learning accessible to all.",
    category: "education",
    tags: ["education", "children", "learning", "equity"],
    resources: [
      {
        type: "Documentary",
        title: "Waiting for Superman",
        link: "https://www.imdb.com/title/tt1566648/",
        image: "https://m.media-amazon.com/images/M/MV5BMTM0NDQxMjI0OV5BMl5BanBnXkFtZTcwNzQzMjg3Mw@@._V1_.jpg"
      },
      {
        type: "Book",
        title: "The End of Education by Neil Postman",
        link: "https://www.goodreads.com/book/show/25350.The_End_of_Education",
        image: "https://i.gr-assets.com/images/S/compressed.photo.goodreads.com/books/1386924445l/25350.jpg"
      }
    ],
    actions: [
      { text: "Volunteer as an online tutor", link: "https://www.volunteermatch.org/search/opp3563734.jsp" },
      { text: "Donate school supplies to underfunded schools", link: "https://www.donorschoose.org" },
      { text: "Advocate for education policy reform", link: "" }
    ]
  }
];

// Initialize passion data in MongoDB
const initializePassionData = async () => {
  try {
    const questionsCount = await db.collection('passionQuestions').countDocuments();
    if (questionsCount === 0) {
      await db.collection('passionQuestions').insertMany(DEFAULT_PASSION_QUESTIONS);
    }

    const profilesCount = await db.collection('passionProfiles').countDocuments();
    if (profilesCount === 0) {
      await db.collection('passionProfiles').insertMany(DEFAULT_PASSION_PROFILES);
    }
  } catch (err) {
    console.error('Error initializing passion data:', err);
  }
};

// ================== CHAT ENDPOINTS ================== //

app.post('/api/pusher/auth', async (req, res) => {
  try {
    const { socket_id: socketId, channel_name: channel } = req.body;
    
    // Validate required fields
    if (!socketId || !channel) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    // Additional security check (optional)
    const userId = req.user?.id; // Assuming you have user auth
    if (channel.startsWith('private-') && !userId) {
      return res.status(403).json({ error: 'Unauthorized private channel access' });
    }

    // Generate auth response
    const authResponse = pusher.authorizeChannel(socketId, channel, {
      user_id: userId?.toString(), // For presence channels
      user_info: userId ? { id: userId } : {} // Additional user data
    });

    res.json(authResponse);
  } catch (err) {
    console.error('Pusher auth failed:', err);
    res.status(403).json({ error: 'Forbidden', details: err.message });
  }
});

// Message Endpoints
app.get('/api/messages', async (req, res) => {
  try {
    const { channel } = req.query;
    const query = channel ? { channel } : {};
    
    const messages = await db.collection('messages')
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();

    res.status(200).json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { text, channel, user, replyTo } = req.body;
    
    if (!text || !channel || !user?.uid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newMessage = {
      text,
      channel,
      user,
      replyTo: replyTo || null,
      timestamp: new Date().toISOString()
    };

    const result = await db.collection('messages').insertOne(newMessage);
    const insertedMessage = { ...newMessage, _id: result.insertedId };

    pusher.trigger(`chat-${channel}`, 'new-message', insertedMessage);

    res.status(201).json(insertedMessage);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});


// ================== PASSION FINDER ENDPOINTS ================== //

app.get('/api/passion-questions', async (req, res) => {
  try {
    const questions = await db.collection('passionQuestions').find().toArray();
    res.status(200).json(questions.length ? questions : DEFAULT_PASSION_QUESTIONS);
  } catch (err) {
    res.status(200).json(DEFAULT_PASSION_QUESTIONS);
  }
});

app.get('/api/passion-data/:id', async (req, res) => {
  try {
    const profile = await db.collection('passionProfiles').findOne({
      $or: [
        { id: req.params.id },
        { category: req.params.id }
      ]
    });
    res.status(200).json(profile || DEFAULT_PASSION_PROFILES[0]);
  } catch (err) {
    res.status(200).json(DEFAULT_PASSION_PROFILES[0]);
  }
});

app.post('/api/analyze-passion', async (req, res) => {
  try {
    const { responses } = req.body;
    
    if (!Array.isArray(responses)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid responses format' 
      });
    }

    const tagFrequency = {};
    responses.forEach(tag => {
      if (typeof tag === 'string') {
        tagFrequency[tag] = (tagFrequency[tag] || 0) + 1;
      }
    });

    // Removed unused variable 'sortedTags'
    Object.keys(tagFrequency).sort((a, b) => tagFrequency[b] - tagFrequency[a]);

    const profiles = await db.collection('passionProfiles').find().toArray();
    
    let bestMatch = null;
    let highestScore = -1;

    profiles.forEach(profile => {
      if (!profile?.tags || !Array.isArray(profile.tags)) return;
      
      let score = 0;
      profile.tags.forEach(tag => {
        if (tagFrequency[tag]) score += tagFrequency[tag];
      });

      if (score > highestScore) {
        highestScore = score;
        bestMatch = profile;
      }
    });

    const result = bestMatch || DEFAULT_PASSION_PROFILES[0];

    res.status(200).json(result);
  } catch (err) {
    res.status(200).json(DEFAULT_PASSION_PROFILES[0]);
  }
});

app.post('/api/save-passion', async (req, res) => {
  try {
    const { userId, passionId, tags } = req.body;
    
    if (!userId || !passionId || !tags) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    const result = await db.collection('userPassions').updateOne(
      { userId },
      { $set: { 
        userId,
        passionId, 
        tags,
        updatedAt: new Date() 
      }},
      { upsert: true }
    );

    res.status(200).json({ success: result.acknowledged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/user-passion/:userId', async (req, res) => {
  try {
    const result = await db.collection('userPassions').findOne({ 
      userId: req.params.userId 
    });

    if (result) {
      const profile = await db.collection('passionProfiles').findOne({
        id: result.passionId
      });
      res.status(200).json({ ...result, profile });
    } else {
      res.status(404).json({ success: false, message: "No passion results saved" });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch results" });
  }
});

// ================== MAP ENDPOINTS ================== //

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

// ================== CONNECTION ENDPOINTS ================== //

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
    const connections = await db.collection('connections').find({
      $or: [{ userId: req.params.userId }, { connectedUserId: req.params.userId }]
    }).toArray();

    res.status(200).json(connections);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ================== CONTENT ENDPOINTS ================== //

// Updated refreshTEDTalks function in server.js
const refreshTEDTalks = async () => {
  try {
    const response = await axios.get('https://ted-talks-api.p.rapidapi.com/talks', {
      headers: {
        'x-rapidapi-key': process.env.TED_API_KEY || '12a5ce8dcamshf1e298383db9dd5p1d32bfjsne685c7209647',
        'x-rapidapi-host': process.env.TED_API_HOST || 'ted-talks-api.p.rapidapi.com'
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

app.get('/api/content', async (req, res) => {
  try {
    let talks = [];
    
    // 1. Try database first
    try {
      talks = await db.collection('tedTalks')
        .find()
        .sort({ updatedAt: -1 })
        .limit(50)
        .toArray();
        
      if (talks.length > 0) {
        return res.json(talks); // Return immediately if DB has data
      }
    } catch (dbError) {
      console.error('Database fetch failed:', dbError);
      // Continue to API fallback
    }

    // 2. Try RapidAPI if DB is empty
    try {
      const apiResponse = await axios.get('https://ted-talks-api.p.rapidapi.com/talks', {
        headers: {
          'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
          'X-RapidAPI-Host': 'ted-talks-api.p.rapidapi.com'
        },
        params: { 
          limit: '20',
          sort: 'newest',
          fields: 'title,description,speaker,duration,url,thumbnail'
        },
        timeout: 5000
      });

      // Transform API response to match your schema
      talks = apiResponse.data.map(talk => ({
        title: talk.title,
        speaker: talk.speaker || 'Unknown Speaker',
        duration: talk.duration || 0,
        description: talk.description || '',
        url: talk.url,
        thumbnail: talk.thumbnail,
        updatedAt: new Date().toISOString()
      }));

      // Cache the API results in DB
      if (talks.length > 0) {
        await db.collection('tedTalks').insertMany(talks);
      }
      
      return res.json(talks);
    } catch (apiError) {
      console.error('API fetch failed:', apiError);
      return res.status(200).json([]); // Return empty array instead of dummy data
    }
    
  } catch (err) {
    console.error('Content endpoint error:', err);
    res.status(200).json([]); // Final fallback (empty array)
  }
});

// ================== NGO ENDPOINTS ================== //

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

app.get('/api/action-hub', async (req, res) => {
  try {
    const ngos = await db.collection('ngos').find().toArray();
    res.status(200).json(ngos);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch NGOs' });
  }
});

// ================== SERVER STARTUP ================== //

const startServer = async () => {
  await connectToMongoDB();
  await initializePassionData();
  await Promise.all([refreshTEDTalks(), refreshNGOs()]);
  
  setInterval(refreshTEDTalks, 3600000);
  setInterval(refreshNGOs, 3600000);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  }).on('error', err => {
    console.error('Server error:', err);
    process.exit(1);
  });
};

startServer();
