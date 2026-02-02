import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import User from '../models/User';
import { auth } from '../middleware/auth';

const router = express.Router();

// Register user
router.post(
  '/register',
  [body('username').isLength({ min: 3, max: 50 }).trim().escape(), body('email').isEmail().normalizeEmail(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    console.log('Registration attempt:', req.body);
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, email, password } = req.body as any;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        return res.status(400).json({
          message: (existingUser as any).email === email ? 'Email already registered' : 'Username already taken'
        });
      }

      // Hash password before creating user
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const user = new User({
        username,
        email,
        password: hashedPassword,
        role: 'editor' // Default role
      });

      await user.save();

      // Generate JWT token
      const token = jwt.sign({ userId: (user as any)._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

      // Update last login
      (user as any).lastLogin = new Date();
      await user.save();

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: (user as any)._id,
          username: (user as any).username,
          email: (user as any).email,
          role: (user as any).role
        }
      });
    } catch (error: any) {
      console.error('Registration error:', error?.message);
      console.error('Stack:', error?.stack);
      res.status(500).json({ message: 'Server error during registration' });
    }
  }
);

// Login user
router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body as any;

      // Find user by email
      const user: any = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      // Generate JWT token
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error during login' });
    }
  }
);

// Get current user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById((req as any).user._id).select('-password');
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put(
  '/profile',
  auth,
  [body('username').optional().isLength({ min: 3, max: 50 }).trim().escape(), body('email').optional().isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const updates: any = {};
      const allowedUpdates = ['username', 'email'];

      allowedUpdates.forEach((field) => {
        if ((req.body as any)[field] !== undefined) {
          updates[field] = (req.body as any)[field];
        }
      });

      // Check if username or email is already taken by another user
      if (updates.username || updates.email) {
        const existingUser = await User.findOne({
          $or: [updates.username ? { username: updates.username } : {}, updates.email ? { email: updates.email } : {}].filter(
            (condition) => Object.keys(condition).length > 0
          ),
          _id: { $ne: (req as any).user._id }
        });

        if (existingUser) {
          return res.status(400).json({ message: 'Username or email already taken' });
        }
      }

      const user = await User.findByIdAndUpdate((req as any).user._id, updates, { new: true, runValidators: true }).select('-password');

      res.json({
        message: 'Profile updated successfully',
        user
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Find user by email (for collaborator lookup)
router.get('/user-by-email', auth, async (req, res) => {
  try {
    const { email } = req.query as any;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('username email role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;



