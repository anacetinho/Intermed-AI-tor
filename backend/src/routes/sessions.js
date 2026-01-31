const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sessionService = require('../services/sessionService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../data/uploads', req.params.sessionId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'text/plain', 'text/csv',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper to determine file type category
const getFileTypeCategory = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype === 'text/plain') return 'text';
  if (mimetype === 'text/csv') return 'csv';
  if (mimetype === 'application/pdf') return 'pdf';
  return 'document';
};

// Create new session
router.post('/sessions', (req, res) => {
  try {
    const { visibilityMode, initialDescription, language, model, title, workflow, lmstudioUrl, lmstudioModel } = req.body;

    if (!visibilityMode || !['open', 'blind'].includes(visibilityMode)) {
      return res.status(400).json({ error: 'Invalid visibility mode' });
    }

    if (!language || !['en', 'pt'].includes(language)) {
      return res.status(400).json({ error: 'Invalid language. Must be "en" or "pt"' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Model is required' });
    }

    // Validate workflow if provided
    const validWorkflows = ['simple', 'advanced', 'dynamic'];
    const sessionWorkflow = workflow && validWorkflows.includes(workflow) ? workflow : 'simple';

    const result = sessionService.createSession(
      2, // Hardcoded to 2 participants
      visibilityMode,
      initialDescription,
      language,
      model,
      title,
      sessionWorkflow,
      lmstudioUrl,
      lmstudioModel
    );

    res.json(result);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session details
router.get('/sessions/:sessionId', (req, res) => {
  try {
    const session = sessionService.getSession(req.params.sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Join session with token
router.get('/sessions/:sessionId/join/:token', (req, res) => {
  try {
    const participant = sessionService.joinSession(req.params.token);
    
    res.json({
      participantId: participant.id,
      participantNumber: participant.participant_number,
      sessionId: participant.session_id,
      status: participant.status,
      visibilityMode: participant.visibility_mode,
      currentRound: participant.current_round,
      isInitiator: participant.is_initiator === 1,
      language: participant.language,
      title: participant.title,
      initialDescription: participant.initial_description,
      p2AcceptanceStatus: participant.p2_acceptance_status,
      aiSummaryP1: participant.ai_summary_p1,
      aiBriefingP2: participant.ai_briefing_p2,
      workflow: participant.workflow
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(400).json({ error: error.message });
  }
});

// P2 accepts or rejects the mediation
router.post('/sessions/:sessionId/p2-decision', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantId, decision } = req.body;

    if (!decision || !['accepted', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision. Must be "accepted" or "rejected"' });
    }

    sessionService.setP2Decision(sessionId, participantId, decision);
    
    res.json({ success: true, decision });
  } catch (error) {
    console.error('Error recording P2 decision:', error);
    res.status(400).json({ error: error.message });
  }
});

// Generate P2 link after P1 completes initial answers
router.post('/sessions/:sessionId/generate-p2-link', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantId } = req.body;

    // Verify P1 has submitted answers (session has AI summary)
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.ai_summary_p1) {
      return res.status(400).json({ error: 'P1 must complete initial answers first' });
    }

    // Get P2 participant
    const p2 = sessionService.getParticipantByNumber(sessionId, 2);
    if (!p2) {
      return res.status(404).json({ error: 'P2 participant not found' });
    }

    const p2Link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/session/${sessionId}/${p2.token}`;

    res.json({ 
      token: p2.token,
      link: p2Link,
      participantNumber: 2
    });
  } catch (error) {
    console.error('Error generating P2 link:', error);
    res.status(500).json({ error: 'Failed to generate P2 link' });
  }
});

// Get judgment
router.get('/sessions/:sessionId/judgment', (req, res) => {
  try {
    const judgment = sessionService.getJudgment(req.params.sessionId);
    
    if (!judgment) {
      return res.status(404).json({ error: 'Judgment not available yet' });
    }

    // Also include factList and factVerifications for the facts table
    const factList = sessionService.getFactList(req.params.sessionId);
    const factVerifications = sessionService.getFactVerifications(req.params.sessionId);
    const session = sessionService.getSession(req.params.sessionId);

    res.json({
      ...judgment,
      factList: factList || [],
      factVerifications: factVerifications || { p1: {}, p2: {} },
      session: {
        language: session?.language || 'en',
        title: session?.title || ''
      }
    });
  } catch (error) {
    console.error('Error getting judgment:', error);
    res.status(500).json({ error: 'Failed to get judgment' });
  }
});

// Upload attachment (Advanced workflow)
router.post('/sessions/:sessionId/upload', upload.single('file'), (req, res) => {
  try {
    const { sessionId } = req.params;
    const { participantId, stage } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const validStages = ['p1_initial', 'p2_response', 'p1_context', 'p2_context'];
    if (!stage || !validStages.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    // Check session exists
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // File uploads now allowed in both simple and advanced workflows

    const fileInfo = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      fileType: getFileTypeCategory(req.file.mimetype),
      mimeType: req.file.mimetype,
      fileSize: req.file.size
    };

    const attachmentId = sessionService.saveAttachment(sessionId, participantId, stage, fileInfo);

    res.json({
      id: attachmentId,
      ...fileInfo,
      stage
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get attachments for session
router.get('/sessions/:sessionId/attachments', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { stage } = req.query;

    const attachments = sessionService.getAttachments(sessionId, stage || null);
    res.json(attachments);
  } catch (error) {
    console.error('Error getting attachments:', error);
    res.status(500).json({ error: 'Failed to get attachments' });
  }
});

// Serve attachment file
router.get('/sessions/:sessionId/attachments/:attachmentId/file', (req, res) => {
  try {
    const { sessionId, attachmentId } = req.params;

    const attachment = sessionService.getAttachmentById(attachmentId);
    if (!attachment || attachment.session_id !== sessionId) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const filePath = path.join(__dirname, '../../data/uploads', sessionId, attachment.file_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Delete attachment
router.delete('/sessions/:sessionId/attachments/:attachmentId', (req, res) => {
  try {
    const { sessionId, attachmentId } = req.params;

    const attachment = sessionService.getAttachmentById(attachmentId);
    if (!attachment || attachment.session_id !== sessionId) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete file from disk
    const filePath = path.join(__dirname, '../../data/uploads', sessionId, attachment.file_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    sessionService.deleteAttachment(attachmentId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// Get P1 initial answers (for open mode)
router.get('/sessions/:sessionId/p1-answers', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = sessionService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Only allow in open mode
    if (session.visibility_mode !== 'open') {
      return res.status(403).json({ error: 'P1 answers only available in open mode' });
    }
    
    const p1Answers = sessionService.getP1InitialAnswers(sessionId);
    if (!p1Answers) {
      return res.status(404).json({ error: 'P1 answers not found' });
    }
    
    res.json({
      whatHappened: p1Answers.what_happened,
      whatLedToIt: p1Answers.what_led_to_it,
      howItMadeThemFeel: p1Answers.how_it_made_them_feel,
      desiredOutcome: p1Answers.desired_outcome
    });
  } catch (error) {
    console.error('Error getting P1 answers:', error);
    res.status(500).json({ error: 'Failed to get P1 answers' });
  }
});

// Get participant context (for debug mode)
router.get('/sessions/:sessionId/participant-context', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const context = sessionService.getParticipantContext(sessionId);
    res.json(context || {});
  } catch (error) {
    console.error('Error getting participant context:', error);
    res.status(500).json({ error: 'Failed to get participant context' });
  }
});

module.exports = router;
