require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const Pusher = require('pusher');
const axios = require('axios');
const natural = require('natural');
const { WordTokenizer, PorterStemmer } = natural;
const tf = require('@tensorflow/tfjs-node');

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
    await db.collection('userPassions').createIndex({ userId: 1 });
    await db.collection('passionQuestions').createIndex({ id: 1 });
    await db.collection('passionProfiles').createIndex({ tags: 1 });
    
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  }
};

// ================== PASSION FINDER ENDPOINTS ================== //

// Pre-loaded passion questions
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

// Pre-loaded passion profiles
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
    // Check if questions exist
    const questionsCount = await db.collection('passionQuestions').countDocuments();
    if (questionsCount === 0) {
      await db.collection('passionQuestions').insertMany(DEFAULT_PASSION_QUESTIONS);
      console.log('Loaded default passion questions');
    }

    // Check if profiles exist
    const profilesCount = await db.collection('passionProfiles').countDocuments();
    if (profilesCount === 0) {
      await db.collection('passionProfiles').insertMany(DEFAULT_PASSION_PROFILES);
      console.log('Loaded default passion profiles');
    }
  } catch (err) {
    console.error('Error initializing passion data:', err);
  }
};

// Get passion questions
app.get('/api/passion-questions', async (req, res) => {
  try {
    const questions = await db.collection('passionQuestions').find().toArray();
    res.status(200).json(questions.length ? questions : DEFAULT_PASSION_QUESTIONS);
  } catch (err) {
    console.error('Error fetching questions:', err);
    res.status(200).json(DEFAULT_PASSION_QUESTIONS);
  }
});

// Get specific passion profile
app.get('/api/passion-data/:id', async (req, res) => {
  try {
    const profile = await db.collection('passionProfiles').findOne({
      $or: [
        { id: req.params.id },
        { category: req.params.id }
      ]
    });

    if (profile) {
      res.status(200).json(profile);
    } else {
      // Fallback to environmental activism if not found
      const fallback = await db.collection('passionProfiles').findOne({
        category: 'environment'
      }) || DEFAULT_PASSION_PROFILES[0];
      res.status(200).json(fallback);
    }
  } catch (err) {
    console.error('Error fetching passion profile:', err);
    res.status(200).json(DEFAULT_PASSION_PROFILES[0]);
  }
});

// AI-powered passion analysis
app.post('/api/analyze-passion', async (req, res) => {
  try {
    const { responses } = req.body;
    
    // Step 1: Basic tag frequency analysis
    const tagFrequency = responses.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});

    // Step 2: Find most common tags
    const sortedTags = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);

 // Step 3: Find best matching profile
try {
  const profiles = await db.collection('passionProfiles').find().toArray();
  
  if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
    console.error('No passion profiles found in database');
    throw new Error('No passion profiles available');
  }

  let bestMatch = null;
  let highestScore = 0;

  profiles.forEach(profile => {
    if (!profile.tags || !Array.isArray(profile.tags)) {
      console.warn(`Invalid tags array for profile ${profile.id}`);
      return; // Skip this profile
    }

    const score = profile.tags.reduce((sum, tag) => {
      // Ensure tag is a string and exists in frequency map
      if (typeof tag !== 'string') {
        console.warn(`Invalid tag type in profile ${profile.id}`);
        return sum;
      }
      return sum + (sortedTags.includes(tag) ? (tagFrequency[tag] || 0) : 0);
    }, 0);

    if (score > highestScore || (score === highestScore && !bestMatch)) {
      highestScore = score;
      bestMatch = profile;
    }
  });

  if (!bestMatch) {
    console.error('No matching profile found, using fallback');
    bestMatch = profiles[0]; // Fallback to first profile
  }
} catch (err) {
  console.error('Error in profile matching:', err);
  // Fallback to environmental profile
  bestMatch = await db.collection('passionProfiles').findOne({ category: 'environment' }) || 
              DEFAULT_PASSION_PROFILES[0];
}

    // Step 4: Return best match or default
    const result = bestMatch || 
      await db.collection('passionProfiles').findOne({ category: 'environment' }) || 
      DEFAULT_PASSION_PROFILES[0];

    // Step 5: Save analytics (optional)
    await db.collection('passionAnalytics').insertOne({
      tags: sortedTags,
      matchedProfile: result.id,
      timestamp: new Date()
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('AI analysis failed:', err);
    
    // Fallback to simple tag matching
    const tagFrequency = responses.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});

    const topTag = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])[0][0];

    const fallback = await db.collection('passionProfiles').findOne({
      tags: topTag
    }) || DEFAULT_PASSION_PROFILES[0];

    res.status(200).json(fallback);
  }
});

// Save user's passion results
app.post('/api/save-passion', async (req, res) => {
  try {
    const { userId, passionId, tags } = req.body;
    
    await db.collection('userPassions').updateOne(
      { userId },
      { $set: { 
        userId,
        passionId, 
        tags,
        updatedAt: new Date() 
      }},
      { upsert: true }
    );

    // Update user profile if exists
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { $set: { 
        primaryPassion: passionId,
        lastPassionUpdate: new Date()
      }}
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error saving passion:', err);
    res.status(500).json({ success: false, error: "Failed to save results" });
  }
});

// Get user's saved passion
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
    console.error('Error fetching user passion:', err);
    res.status(500).json({ success: false, error: "Failed to fetch results" });
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

// ================== DATA REFRESH FUNCTIONS ================== //

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
  
  // Initialize passion data
  await initializePassionData();
  
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