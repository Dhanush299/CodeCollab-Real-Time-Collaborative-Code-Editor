// Ensure environment variables are loaded (dotenv/config automatically loads .env)
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv/config');

import express from 'express';
import { body, validationResult } from 'express-validator';
import { auth } from '../middleware/auth';

const router = express.Router();

// Initialize AI clients conditionally
let openai: any = null;
let gemini: any = null;

// Initialize OpenAI client
try {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
    console.log('Initializing OpenAI...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenAI = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('OpenAI client initialized successfully');
  }
} catch (error: any) {
  console.warn('OpenAI not available:', error?.message);
}

// Initialize Google Gemini client (free tier available)
try {
  if (process.env.GEMINI_API_KEY) {
    console.log('Initializing Gemini with API key:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('Gemini client initialized successfully');
  } else {
    console.log('GEMINI_API_KEY not found in environment variables');
  }
} catch (error: any) {
  console.error('Gemini initialization error:', error?.message);
  console.error('Stack:', error?.stack);
}

// Helper function to get AI response (tries Gemini first, then OpenAI)
async function getAIResponse(systemPrompt: string, userPrompt: string, maxTokens: number = 500) {
  // Try Gemini first (free tier)
  if (gemini) {
    try {
      const model = gemini.getGenerativeModel({ model: 'gemini-pro' });
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      return response.text();
    } catch (error: any) {
      console.warn('Gemini request failed, trying OpenAI:', error?.message);
      // Fallback to OpenAI if Gemini fails
    }
  }

  // Fallback to OpenAI
  if (openai) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.3
    });
    return completion.choices[0]?.message?.content?.trim();
  }

  throw new Error('No AI service available');
}

// Get code suggestions/completions
router.post(
  '/suggest',
  auth,
  [
    body('prompt').isString().isLength({ min: 1, max: 1000 }),
    body('language').isString(),
    body('context').optional().isString().isLength({ max: 5000 }),
    body('cursorPosition').optional().isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { prompt, language, context = '', cursorPosition } = req.body as any;

      // Check if any AI service is available
      if (!openai && !gemini) {
        return res.status(503).json({
          message: 'AI service not available. Please configure OPENAI_API_KEY or GEMINI_API_KEY in .env file',
          suggestions: []
        });
      }

      try {
        const systemPrompt = `You are an expert ${language} developer. Provide helpful code suggestions, completions, and improvements.
Always respond with valid ${language} code. Keep suggestions concise and practical.`;

        const userPrompt = `Context: ${context}
Current position: ${cursorPosition || 'end of code'}
Request: ${prompt}

Provide a code suggestion that fits the context and request.`;

        const suggestion = await getAIResponse(systemPrompt, userPrompt, 500);

        if (!suggestion) {
          return res.json({ suggestions: [] });
        }

        // Clean up the suggestion (remove code blocks if present)
        const cleanSuggestion = suggestion.replace(/^```[^\n]*\n?/, '').replace(/\n```$/, '').trim();

        res.json({
          suggestions: [
            {
              text: cleanSuggestion,
              type: 'completion',
              confidence: 0.8
            }
          ]
        });
      } catch (aiError: any) {
        console.error('AI API error:', aiError);
        res.status(503).json({
          message: 'AI service temporarily unavailable: ' + (aiError?.message || 'Unknown error'),
          suggestions: []
        });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get code explanation
router.post(
  '/explain',
  auth,
  [body('code').isString().isLength({ min: 1, max: 5000 }), body('language').isString()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { code, language } = req.body as any;

      if (!openai && !gemini) {
        return res.status(503).json({ message: 'AI service not available. Please configure OPENAI_API_KEY or GEMINI_API_KEY' });
      }

      try {
        const systemPrompt = `You are an expert ${language} developer. Explain code clearly and concisely.`;
        const userPrompt = `Explain this ${language} code:\n\n${code}`;

        const explanation = await getAIResponse(systemPrompt, userPrompt, 300);

        res.json({
          explanation: explanation || 'Unable to generate explanation'
        });
      } catch (aiError: any) {
        console.error('AI API error:', aiError);
        res.status(503).json({ message: 'AI service temporarily unavailable: ' + (aiError?.message || 'Unknown error') });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Generate code from natural language description
router.post(
  '/generate',
  auth,
  [body('description').isString().isLength({ min: 1, max: 1000 }), body('language').isString(), body('context').optional().isString().isLength({ max: 2000 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { description, language, context = '' } = req.body as any;

      if (!openai && !gemini) {
        return res.status(503).json({ message: 'AI service not available. Please configure OPENAI_API_KEY or GEMINI_API_KEY' });
      }

      try {
        const systemPrompt = `You are an expert ${language} developer. Generate clean, efficient, and well-documented ${language} code.
Follow best practices and include appropriate comments.`;

        const userPrompt = `Context: ${context}
Generate ${language} code for: ${description}`;

        const generatedCode = await getAIResponse(systemPrompt, userPrompt, 1000);

        if (!generatedCode) {
          return res.status(400).json({ message: 'Unable to generate code' });
        }

        // Clean up code blocks
        const cleanCode = generatedCode.replace(/^```[^\n]*\n?/, '').replace(/\n```$/, '').trim();

        res.json({
          code: cleanCode,
          language
        });
      } catch (aiError: any) {
        console.error('AI API error:', aiError);
        res.status(503).json({ message: 'AI service temporarily unavailable: ' + (aiError?.message || 'Unknown error') });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Debug/improve code
router.post(
  '/debug',
  auth,
  [body('code').isString().isLength({ min: 1, max: 5000 }), body('language').isString(), body('error').optional().isString().isLength({ max: 1000 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { code, language, error: errorMsg = '' } = req.body as any;

      if (!openai && !gemini) {
        return res.status(503).json({ message: 'AI service not available. Please configure OPENAI_API_KEY or GEMINI_API_KEY' });
      }

      try {
        const systemPrompt = `You are an expert ${language} developer. Help debug and improve code.
Provide specific fixes, explanations, and best practices.`;

        const userPrompt = `Debug this ${language} code${errorMsg ? ` with error: ${errorMsg}` : ''}:\n\n${code}`;

        const debugInfo = await getAIResponse(systemPrompt, userPrompt, 800);

        res.json({
          debug: debugInfo || 'Unable to analyze code'
        });
      } catch (aiError: any) {
        console.error('AI API error:', aiError);
        res.status(503).json({ message: 'AI service temporarily unavailable: ' + (aiError?.message || 'Unknown error') });
      }
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  }
);

export default router;



