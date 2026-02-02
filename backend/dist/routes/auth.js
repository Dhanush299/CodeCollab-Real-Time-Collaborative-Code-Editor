"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const express_validator_1 = require("express-validator");
const User_1 = __importDefault(require("../models/User"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Register user
router.post('/register', [(0, express_validator_1.body)('username').isLength({ min: 3, max: 50 }).trim().escape(), (0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').isLength({ min: 6 })], async (req, res) => {
    console.log('Registration attempt:', req.body);
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { username, email, password } = req.body;
        // Check if user already exists
        const existingUser = await User_1.default.findOne({
            $or: [{ email }, { username }]
        });
        if (existingUser) {
            return res.status(400).json({
                message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
            });
        }
        // Hash password before creating user
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        // Create new user
        const user = new User_1.default({
            username,
            email,
            password: hashedPassword,
            role: 'editor' // Default role
        });
        await user.save();
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
        // Update last login
        user.lastLogin = new Date();
        await user.save();
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error('Registration error:', error?.message);
        console.error('Stack:', error?.stack);
        res.status(500).json({ message: 'Server error during registration' });
    }
});
// Login user
router.post('/login', [(0, express_validator_1.body)('email').isEmail().normalizeEmail(), (0, express_validator_1.body)('password').exists()], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { email, password } = req.body;
        // Find user by email
        const user = await User_1.default.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        // Generate JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });
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
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});
// Get current user profile
router.get('/profile', auth_1.auth, async (req, res) => {
    try {
        const user = await User_1.default.findById(req.user._id).select('-password');
        res.json({ user });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Update user profile
router.put('/profile', auth_1.auth, [(0, express_validator_1.body)('username').optional().isLength({ min: 3, max: 50 }).trim().escape(), (0, express_validator_1.body)('email').optional().isEmail().normalizeEmail()], async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const updates = {};
        const allowedUpdates = ['username', 'email'];
        allowedUpdates.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        // Check if username or email is already taken by another user
        if (updates.username || updates.email) {
            const existingUser = await User_1.default.findOne({
                $or: [updates.username ? { username: updates.username } : {}, updates.email ? { email: updates.email } : {}].filter((condition) => Object.keys(condition).length > 0),
                _id: { $ne: req.user._id }
            });
            if (existingUser) {
                return res.status(400).json({ message: 'Username or email already taken' });
            }
        }
        const user = await User_1.default.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-password');
        res.json({
            message: 'Profile updated successfully',
            user
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
// Find user by email (for collaborator lookup)
router.get('/user-by-email', auth_1.auth, async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        const user = await User_1.default.findOne({ email: String(email).toLowerCase().trim() }).select('username email role');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});
exports.default = router;
