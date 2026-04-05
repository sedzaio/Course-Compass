const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const courseRoutes = require('./routes/courses');
const assignmentRoutes = require('./routes/assignments');
const canvasRoutes = require('./routes/canvas');
const plannerRoutes = require('./routes/planner');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/courses', courseRoutes);
app.use('/assignments', assignmentRoutes);
app.use('/canvas', canvasRoutes);
app.use('/planner', plannerRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'HELLO WORLD, THIS IS TEAM 12. APP UNDER DEVELOPMENT, SOME API ENDPOINTS ARE AVAILABLE' });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => console.log('MongoDB connection error:', err));