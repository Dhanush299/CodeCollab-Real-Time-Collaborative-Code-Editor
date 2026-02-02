# CodeCollab - Real-time Collaborative Code Editor

A full-stack web application for collaborative code editing with real-time features, code execution, and AI assistance.

## Features

### 🔐 Authentication & User Management
- User registration and login with JWT authentication
- Role-based access control (Viewer, Editor, Admin)
- Secure session management

### 📁 Repository Management
- Create and manage code repositories
- File and folder organization
- Repository sharing and collaboration

### ✏️ Code Editor
- Monaco Editor (VS Code editor) integration
- Syntax highlighting for 10+ languages
- File tree navigation
- Real-time file saving

### 🚀 Code Execution
- Execute code in multiple languages:
  - JavaScript, TypeScript, Python, Java
  - C, C++, Ruby, PHP, Go, Rust
- Input/output handling
- Execution time tracking
- Safe sandboxed execution

### 👥 Real-time Collaboration
- Create collaborative rooms
- Real-time chat messaging
- User presence tracking
- Room-based collaboration sessions

### 🎨 Planned Features
- Shared cursor positions
- Collaborative drawing/whiteboard
- AI code completion and suggestions
- Repository download as ZIP

## Tech Stack

### Backend
- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **Socket.io** for real-time features
- **JWT** for authentication
- **VM2** for safe code execution

### Frontend
- **React** with hooks
- **Monaco Editor** for code editing
- **Socket.io-client** for real-time communication
- **Axios** for API calls
- **React Router** for navigation

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. **Set up MongoDB:**

   **Option A: MongoDB Atlas (Cloud - Recommended)**
   - Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
   - Create a free account and cluster
   - Get your connection string from "Connect" > "Connect your application"
   - It will look like: `mongodb+srv://username:password@cluster.mongodb.net/codecollab`

   **Option B: Local MongoDB**
   - Download and install [MongoDB Community Server](https://www.mongodb.com/try/download/community)
   - Start MongoDB service (`mongod`)

4. Create environment file:
```bash
# The .env file is already created with default values
# Edit backend/.env if needed
```

Edit `backend/.env` with your configuration:
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/codecollab  # or your Atlas URI
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
OPENAI_API_KEY=your-openai-api-key-optional
FRONTEND_URL=http://localhost:3000
```

4. Start the backend server:
```bash
npm start
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile

### Repository Endpoints
- `GET /api/repositories` - Get user repositories
- `POST /api/repositories` - Create repository
- `GET /api/repositories/:id` - Get repository details
- `PUT /api/repositories/:id` - Update repository
- `DELETE /api/repositories/:id` - Delete repository

### File Endpoints
- `GET /api/files/repository/:repositoryId` - Get repository files
- `POST /api/files` - Create file/folder
- `GET /api/files/:id` - Get file details
- `PUT /api/files/:id` - Update file
- `DELETE /api/files/:id` - Delete file

### Execution Endpoints
- `POST /api/execute` - Execute code

### Room Endpoints
- `POST /api/rooms` - Create room
- `GET /api/rooms/:roomId` - Get room details
- `POST /api/rooms/:roomId/join` - Join room
- `GET /api/rooms/:roomId/messages` - Get chat messages

## Usage Flow

1. **Register/Login**: Create an account or log in
2. **Dashboard**: View and manage your repositories
3. **Repository**: Create files and folders, edit code
4. **Execute Code**: Run your code with input/output
5. **Collaborate**: Create rooms for real-time collaboration
6. **Chat**: Communicate with collaborators in real-time

## Development

### Project Structure
```
codecollab/
├── backend/
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── middleware/      # Authentication middleware
│   ├── utils/           # Utility functions
│   └── server.js        # Main server file
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── context/     # React context
│   │   └── services/    # API services
│   └── public/          # Static assets
└── README.md
```

### Adding New Features
1. Define API endpoints in backend routes
2. Create React components for UI
3. Add Socket.io events for real-time features
4. Update authentication middleware if needed

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or issues, please open an issue on GitHub or contact the development team.
