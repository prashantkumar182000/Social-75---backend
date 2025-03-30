# 🔧 Social 75 - Backend [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Render Deployment](https://img.shields.io/badge/Deployed%20on-Render-46d3ff?style=for-the-badge)](https://socio-99.onrender.com)
[![Node.js](https://img.shields.io/badge/Node.js-18-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-black?style=for-the-badge&logo=express)](https://expressjs.com/)

The backend service for Social 75 platform, providing APIs for content management, user interactions, and real-time features.

## 🚀 Key Features

- **RESTful API**: JSON endpoints for all frontend needs
- **Real-time Updates**: Pusher integration for live chat
- **Data Aggregation**: TED Talks and NGO databases
- **Geospatial Queries**: MongoDB location-based services
- **Scheduled Jobs**: Hourly data refreshes
- **Robust Error Handling**: Comprehensive error responses

## 🛠 Tech Stack

| Category           | Technologies Used |
|--------------------|-------------------|
| Runtime            | Node.js 18        |
| Framework          | Express 4         |
| Database           | MongoDB Atlas     |
| Real-time          | Pusher            |
| External APIs      | TED Talks API     |
| Cloud Services     | Cloudinary        |
| Hosting            | Render            |

## 📦 API Endpoints

| Endpoint            | Method | Description                     |
|---------------------|--------|---------------------------------|
| `/api/content`      | GET    | Get TED Talks content          |
| `/api/action-hub`   | GET    | Get NGO/organization data      |
| `/api/map`          | GET    | Get location markers           |
| `/api/map`          | POST   | Add new location               |
| `/api/send-message` | POST   | Send chat message              |
| `/api/messages`     | GET    | Get chat history               |

## ⚙️ Environment Variables

```env
MONGO_URI=mongodb+srv://...
PUSHER_APP_ID=your_id
PUSHER_KEY=your_key
PUSHER_SECRET=your_secret
CLOUDINARY_CLOUD_NAME=your_name
TED_API_KEY=your_key
PORT=10000
```

## 🚀 Deployment

1. **Render Web Service**:
   - Connected to GitHub repository
   - Auto-deploys on `main` branch push
   - Free tier with automatic scaling

2. **Manual Deployment**:
```bash
npm install
npm start
```

## 🧑‍💻 Development Setup

1. Clone repository:
```bash
git clone https://github.com/prashantkumar182000/Social-75---backend.git
cd Social-75---backend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

## 📂 Project Structure

```
backend/
├── controllers/    # Business logic
├── routes/         # API endpoints
├── models/         # Data models
├── services/       # External integrations
├── server.js       # Main application
└── package.json    # Dependencies
```

## 🔒 Security

- CORS configured for production domain
- Environment variables for sensitive data
- Rate limiting implemented
- Input validation on all endpoints

## 🤝 Contributing

Contributions are welcome! Please follow the standard GitHub flow:

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🌟 Special Thanks

- [MongoDB Atlas](https://www.mongodb.com/atlas) for database hosting
- [Pusher](https://pusher.com/) for real-time features
- [Render](https://render.com/) for reliable hosting
```
