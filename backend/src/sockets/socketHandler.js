const sessionService = require('../services/sessionService');
const MediationAI = require('../llm/mediationAI');
const fs = require('fs');
const path = require('path');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.activeParticipants = new Map();
    
    // Default MediationAI (from env)
    this.mediationAI = new MediationAI(
      process.env.LLM_PROVIDER,
      process.env.LLM_API_KEY,
      process.env.LLM_BASE_URL,
      process.env.LLM_MODEL
    );
  }

  // Read content from text-based attachments AND images as base64
  getAttachmentContents(sessionId, attachments) {
    const contents = [];
    // FIXED: Path must match sessions.js - ../../data/uploads from sockets/ = backend/data/uploads/
    const uploadDir = path.join(__dirname, '../../data/uploads', sessionId);
    
    console.log(`Reading attachments from: ${uploadDir}`);
    
    for (const attachment of attachments) {
      const filePath = path.join(uploadDir, attachment.file_name);
      
      try {
        if (!fs.existsSync(filePath)) {
          console.log(`File not found: ${filePath}`);
          continue;
        }
        
        // Handle text-based files
        if (attachment.file_type === 'text' || attachment.file_type === 'csv') {
          const content = fs.readFileSync(filePath, 'utf8');
          console.log(`Read text file ${attachment.original_name}: ${content.length} chars`);
          // Limit content size to prevent token overflow (max 5000 chars per file)
          const truncatedContent = content.length > 5000 
            ? content.substring(0, 5000) + '\n[... content truncated ...]' 
            : content;
          contents.push({
            name: attachment.original_name,
            type: attachment.file_type,
            participant: attachment.participant_number,
            content: truncatedContent,
            isImage: false
          });
        }
        // Handle image files - read as base64 for vision LLMs
        else if (attachment.file_type === 'image') {
          const imageBuffer = fs.readFileSync(filePath);
          const base64Data = imageBuffer.toString('base64');
          const mimeType = attachment.mime_type || 'image/jpeg';
          console.log(`Read image file ${attachment.original_name}: ${base64Data.length} base64 chars, mime: ${mimeType}`);
          contents.push({
            name: attachment.original_name,
            type: attachment.file_type,
            participant: attachment.participant_number,
            content: base64Data,
            mimeType: mimeType,
            isImage: true
          });
        }
      } catch (error) {
        console.error(`Error reading attachment ${attachment.file_name}:`, error);
      }
    }
    return contents;
  }

  // Format attachment contents for LLM prompt - returns { textContent, images }
  formatAttachmentContents(attachmentContents) {
    if (!attachmentContents || attachmentContents.length === 0) {
      return { textContent: '', images: [] };
    }
    
    let textContent = '';
    const images = [];
    
    // Separate text content and images
    const textDocs = attachmentContents.filter(doc => !doc.isImage);
    const imageDocs = attachmentContents.filter(doc => doc.isImage);
    
    // Format text documents
    if (textDocs.length > 0) {
      textContent = '\n\n=== ATTACHED DOCUMENTS ===\n';
      for (const doc of textDocs) {
        textContent += `\n--- ${doc.name} (${doc.type.toUpperCase()} from Participant ${doc.participant}) ---\n`;
        textContent += doc.content;
        textContent += '\n--- END OF DOCUMENT ---\n';
      }
    }
    
    // Prepare images for vision LLM
    for (const img of imageDocs) {
      images.push({
        name: img.name,
        participant: img.participant,
        base64: img.content,
        mimeType: img.mimeType
      });
      // Also add a text reference so LLM knows an image exists
      textContent += `\n[IMAGE ATTACHED: ${img.name} from Participant ${img.participant} - analyze this image for relevant information]\n`;
    }
    
    return { textContent, images };
  }

  // Get MediationAI instance based on session's model selection
  getMediationAI(session) {
    if (session.model === 'lmstudio') {
      // Use session-stored config, or fallback to .env values
      const lmstudioUrl = session.lmstudio_url || process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
      const lmstudioModel = session.lmstudio_model || process.env.LLM_MODEL || 'default-model';
      return new MediationAI(
        'lmstudio',
        'not-needed',
        lmstudioUrl,
        lmstudioModel
      );
    }
    // Default to environment config for Gemini models
    return this.mediationAI;
  }

  initialize() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    console.log('Client connected:', socket.id);

    // Join session
    socket.on('join-session', (data) => this.handleJoinSession(socket, data));
    
    // P1 submits initial answers
    socket.on('submit-p1-answers', (data) => this.handleP1Answers(socket, data));
    
    // P2 accepts or rejects mediation
    socket.on('p2-decision', (data) => this.handleP2Decision(socket, data));
    
    // P2 submits their response
    socket.on('submit-p2-response', (data) => this.handleP2Response(socket, data));
    
    // P1 submits additional context
    socket.on('submit-p1-context', (data) => this.handleP1Context(socket, data));
    
    // P2 submits additional context
    socket.on('submit-p2-context', (data) => this.handleP2Context(socket, data));
    
    // Fact verification (Advanced workflow)
    socket.on('submit-fact-verification', (data) => this.handleFactVerification(socket, data));
    
    // Update email for notifications (future feature)
    socket.on('update-email', (data) => this.handleUpdateEmail(socket, data));

    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

async handleUpdateEmail(socket, data) {
    try {
      const { participantId, email } = data;
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        socket.emit('error', { message: 'Invalid email format' });
        return;
      }
      
      // Update email in database
      await sessionService.updateParticipantEmail(participantId, email);
      
      // Send success response
      socket.emit('email-updated', { success: true });
      
      console.log(`Updated email for participant ${participantId}: ${email}`);
    } catch (error) {
      console.error('Error updating email:', error);
      socket.emit('error', { message: 'Failed to update email' });
    }
  }

  // Email notification handlers
  async notifyParticipantByEmail(participantEmail, eventType, data) {
    try {
      switch(eventType) {
        case 'session_invitation':
          await emailService.sendSessionInvitation(
            participantEmail, 
            data.sessionId, 
            data.p2Token
          );
          break;
        
        case 'response_received':
          await emailService.sendResponseNotification(
            participantEmail,
            data.sessionId,
            data.participantNumber
          );
          break;
          
        case 'judgment_ready':
          await emailService.sendJudgmentReadyNotification(
            participantEmail,
            data.sessionId
          );
          break;
          
        case 'session_rejected':
          await emailService.sendSessionRejectedNotification(
            participantEmail,
            data.sessionId
          );
          break;
      }
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  handleDisconnect(socket) {
  }

  async handleJoinSession(socket, data) {
    try {
      const { sessionId, participantId } = data;
      
      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.participantId = participantId;

      // Track active participants
      if (!this.activeParticipants.has(sessionId)) {
        this.activeParticipants.set(sessionId, new Set());
      }
      this.activeParticipants.get(sessionId).add(participantId);

      const session = sessionService.getSession(sessionId);
      const participant = session.participants.find(p => p.id === participantId);
      
      if (participant) {
        socket.participantNumber = participant.participant_number;
      }

      this.io.to(sessionId).emit('participant-joined', {
        participantNumber: socket.participantNumber,
        totalJoined: this.activeParticipants.get(sessionId).size,
        totalExpected: 2
      });

      socket.emit('joined-successfully', {
        sessionId,
        participantNumber: socket.participantNumber,
        visibilityMode: session.visibility_mode,
        status: session.status,
        language: session.language,
        title: session.title,
        initialDescription: session.initial_description,
        workflow: session.workflow
      });

      // If in fact verification stage, send the fact list
      if (session.status === 'fact_verification' && session.workflow === 'advanced') {
        const allFacts = sessionService.getFactList(sessionId);
        const factVerifications = sessionService.getFactVerifications(sessionId);
        const myVerification = socket.participantNumber === 1 
          ? factVerifications.p1 
          : factVerifications.p2;
        
        if (allFacts) {
          // Filter facts - each participant only verifies the OTHER's claims
          const filteredFacts = socket.participantNumber === 1
            ? allFacts.filter(f => f.source === 'p2' || f.source === 'both')
            : allFacts.filter(f => f.source === 'p1' || f.source === 'both');
          socket.emit('fact-list-ready', { factList: filteredFacts });
        }
        
        if (myVerification) {
          socket.emit('fact-verification-submitted');
          // If other hasn't submitted, show waiting
          const otherVerification = socket.participantNumber === 1 
            ? factVerifications.p2 
            : factVerifications.p1;
          if (!otherVerification) {
            socket.emit('waiting-other-verification');
          }
        }
      }
    } catch (error) {
      console.error('Error joining session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  }

  async handleP1Answers(socket, data) {
    console.log('handleP1Answers called with data:', JSON.stringify(data));
    try {
      const { sessionId, participantId, answers } = data;
      console.log(`Processing P1 answers for session ${sessionId}, participant ${participantId}`);

      // Save P1's answers
      sessionService.saveP1InitialAnswers(sessionId, participantId, answers);

      // Get session to access language and model
      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      // Generate AI summary and briefing for P2
      const p1Answers = sessionService.getP1InitialAnswers(sessionId);
      console.log('P1 answers retrieved:', JSON.stringify(p1Answers));
      
      // Analyze participant context (hidden field for internal use)
      console.log('Analyzing participant context from P1 answers...');
      const existingContext = sessionService.getParticipantContext(sessionId);
      const participantContext = await mediationAI.analyzeParticipantContext(existingContext, p1Answers, 'p1_answers');
      sessionService.saveParticipantContext(sessionId, participantContext);
      console.log('Participant context saved:', JSON.stringify(participantContext));
      
      // Get attachments uploaded with P1 answers and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);
      console.log(`P1 answers: found ${attachments.length} attachments, ${attachmentContents.length} with readable content, ${attachmentImages.length} images`);
      
      console.log('Calling LLM to generate P1 summary...');
      const summary = await mediationAI.generateP1Summary(p1Answers, language, formattedAttachments, attachmentImages);
      console.log('P1 summary generated:', summary?.substring(0, 100) + '...');
      
      console.log('Calling LLM to generate P2 briefing...');
      const briefing = await mediationAI.generateP2Briefing(p1Answers, language);
      console.log('P2 briefing generated:', briefing?.substring(0, 100) + '...');
      
      sessionService.saveAISummaryForP1(sessionId, summary, briefing);
      console.log('AI summary saved to database');
      
      // Update session status to waiting_p2_acceptance
      sessionService.updateSessionStatus(sessionId, 'waiting_p2_acceptance');

      // Get P2 participant info for link generation
      const participants = sessionService.getSession(sessionId).participants;
      const p2 = participants.find(p => p.participant_number === 2);
      
      if (p2) {
        const p2Link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/session/${sessionId}/${p2.token}`;
        
        // Notify P1 that their submission was received and send P2 link
        socket.emit('p1-answers-submitted', {
          p2Link,
          p2Token: p2.token
        });
      } else {
        socket.emit('p1-answers-submitted');
      }
      
      // Notify P2 (if connected) that summary is ready
      this.io.to(sessionId).emit('p2-summary-ready', {
        summary,
        briefing
      });

      // Send email notification to P2 if they have an email address
      const p2Participant = participants.find(p => p.participant_number === 2);
      if (p2Participant && p2Participant.email) {
        this.notifyParticipantByEmail(p2Participant.email, 'session_invitation', {
          sessionId,
          p2Token: p2Participant.token
        });
      }
    } catch (error) {
      console.error('Error handling P1 answers:', error);
      socket.emit('error', { message: 'Failed to submit answers' });
    }
  }

  async handleP2Decision(socket, data) {
    try {
      const { sessionId, participantId, decision } = data;
      console.log(`handleP2Decision: session=${sessionId}, decision=${decision}`);

      sessionService.setP2Decision(sessionId, participantId, decision);

      // Notify both participants
      this.io.to(sessionId).emit('p2-decision-made', { decision });

      if (decision === 'rejected') {
        // Session is over, update status
        sessionService.updateSessionStatus(sessionId, 'rejected');
      } else if (decision === 'accepted') {
        // P2 accepted, update status to p2_answering
        sessionService.updateSessionStatus(sessionId, 'p2_answering');
        console.log(`Session ${sessionId} status updated to p2_answering`);
      }

    } catch (error) {
      console.error('Error handling P2 decision:', error);
      socket.emit('error', { message: 'Failed to record decision' });
    }
  }

  async handleP2Response(socket, data) {
    console.log('handleP2Response called with data:', JSON.stringify(data));
    try {
      const { sessionId, participantId, response } = data;
      console.log(`Processing P2 response for session ${sessionId}`);

      // Save P2's response
      sessionService.saveP2Response(sessionId, participantId, response);

      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      // Get P1's answers and P2's response
      const p1Answers = sessionService.getP1InitialAnswers(sessionId);
      const p2Response = sessionService.getP2Response(sessionId);

      // Update participant context with P2's response
      console.log('Updating participant context with P2 response...');
      const existingContext = sessionService.getParticipantContext(sessionId);
      const participantContext = await mediationAI.analyzeParticipantContext(existingContext, p2Response, 'p2_response');
      sessionService.saveParticipantContext(sessionId, participantContext);
      console.log('Participant context updated:', JSON.stringify(participantContext));

      // Get all attachments so far and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);
      console.log(`P2 response: found ${attachments.length} attachments, ${attachmentContents.length} with readable content, ${attachmentImages.length} images`);

      // Generate key dispute points with attachment context
      const disputePoints = await mediationAI.generateKeyDisputePoints(
        p1Answers,
        p2Response,
        session.visibility_mode,
        language,
        formattedAttachments,
        attachmentImages
      );

      sessionService.saveDisputePoints(sessionId, disputePoints);
      
      // Generate AI summary of P2's perspective for P1's context phase (with attachment context)
      console.log('Generating AI summary of P2 perspective for P1...');
      const p2SummaryForP1 = await mediationAI.generateP2SummaryForContext(p1Answers, p2Response, language, formattedAttachments, attachmentImages);
      console.log('P2 summary for P1 generated');

      // Notify P2 that their response was submitted
      socket.emit('p2-response-submitted');

      // Send dispute points, P2 response, and AI summary to P1
      const p1Socket = await this.getParticipantSocket(sessionId, 1);
      if (p1Socket) {
        p1Socket.emit('dispute-points-ready', {
          disputePoints,
          p2Response: session.visibility_mode === 'open' ? p2Response : null,
          p2SummaryForContext: p2SummaryForP1
        });
      }

    } catch (error) {
      console.error('Error handling P2 response:', error);
      socket.emit('error', { message: 'Failed to submit response' });
    }
  }

  async handleP1Context(socket, data) {
    console.log('handleP1Context called');
    try {
      const { sessionId, participantId, contextText } = data;

      sessionService.saveP1Context(sessionId, participantId, contextText);
      
      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      // Update participant context with P1's additional context
      console.log('Updating participant context with P1 context...');
      const existingContext = sessionService.getParticipantContext(sessionId);
      const participantContext = await mediationAI.analyzeParticipantContext(existingContext, contextText, 'p1_context');
      sessionService.saveParticipantContext(sessionId, participantContext);
      console.log('Participant context updated:', JSON.stringify(participantContext));

      // Get all attachments so far and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);
      console.log(`P1 context: found ${attachments.length} attachments, ${attachmentContents.length} with readable content, ${attachmentImages.length} images`);

      // Generate AI summary of P1's context for P2 (with attachment context)
      console.log('Generating AI summary of P1 context for P2...');
      const p1ContextSummary = await mediationAI.generateContextSummary(contextText, 1, language, formattedAttachments, attachmentImages);
      console.log('P1 context summary generated');

      // Notify P1 their context was submitted
      socket.emit('p1-context-submitted');

      // Notify P2 that P1's context is available with AI summary
      const p2Socket = await this.getParticipantSocket(sessionId, 2);
      if (p2Socket) {
        p2Socket.emit('p1-context-ready', { contextSummary: p1ContextSummary });
      }

    } catch (error) {
      console.error('Error handling P1 context:', error);
      socket.emit('error', { message: 'Failed to submit context' });
    }
  }

  async handleP2Context(socket, data) {
    try {
      const { sessionId, participantId, contextText } = data;

      sessionService.saveP2Context(sessionId, participantId, contextText);

      const session = sessionService.getSession(sessionId);
      const mediationAI = this.getMediationAI(session);

      // Update participant context with P2's additional context (final refinement)
      console.log('Updating participant context with P2 context (final)...');
      const existingContext = sessionService.getParticipantContext(sessionId);
      const participantContext = await mediationAI.analyzeParticipantContext(existingContext, contextText, 'p2_context');
      sessionService.saveParticipantContext(sessionId, participantContext);
      console.log('Final participant context:', JSON.stringify(participantContext));

      // Notify P2 their context was submitted
      socket.emit('p2-context-submitted');

      // Check if this is advanced workflow - need fact verification before judgment
      if (session.workflow === 'advanced') {
        // Generate fact list for verification
        await this.generateFactListForVerification(sessionId);
      } else {
        // Simple workflow - generate final judgment directly
        await this.generateFinalJudgment(sessionId);
      }

    } catch (error) {
      console.error('Error handling P2 context:', error);
      socket.emit('error', { message: 'Failed to submit context' });
    }
  }

  async generateFactListForVerification(sessionId) {
    try {
      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      const p1Answers = sessionService.getP1InitialAnswers(sessionId);
      const p2Response = sessionService.getP2Response(sessionId);
      const p1Context = sessionService.getP1Context(sessionId);
      const p2Context = sessionService.getP2Context(sessionId);
      
      // Get attachments and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentDescriptions = attachments.map(a => 
        `[${a.file_type}] ${a.original_name} (from Participant ${a.participant_number})`
      );
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);

      // Generate fact list with full attachment content
      const facts = await mediationAI.generateFactList(
        p1Answers,
        p2Response,
        attachmentDescriptions,
        language,
        p1Context,
        p2Context,
        formattedAttachments,
        attachmentImages
      );

      sessionService.saveFactList(sessionId, facts);
      sessionService.updateSessionStatus(sessionId, 'fact_verification');

      // Filter facts by source - each participant only verifies the OTHER's claims
      const factsForP1 = facts.filter(f => f.source === 'p2' || f.source === 'both');
      const factsForP2 = facts.filter(f => f.source === 'p1' || f.source === 'both');
      
      console.log('Fact list generated for session:', sessionId);
      console.log(`Total facts: ${facts.length}, For P1: ${factsForP1.length}, For P2: ${factsForP2.length}`);

      // Send filtered lists to each participant
      const p1Socket = await this.getParticipantSocket(sessionId, 1);
      const p2Socket = await this.getParticipantSocket(sessionId, 2);
      
      if (p1Socket) {
        p1Socket.emit('fact-list-ready', { factList: factsForP1 });
      }
      if (p2Socket) {
        p2Socket.emit('fact-list-ready', { factList: factsForP2 });
      }

    } catch (error) {
      console.error('Error generating fact list:', error);
      // Fallback to generating judgment directly
      await this.generateFinalJudgment(sessionId);
    }
  }

  async handleFactVerification(socket, data) {
    try {
      const { sessionId, participantId, verifications } = data;
      const participantNumber = socket.participantNumber;
      
      console.log('handleFactVerification called:', { sessionId, participantId, participantNumber });

      sessionService.saveFactVerification(sessionId, participantNumber, verifications);
      console.log(`Fact verification saved for participant ${participantNumber}`);

      // Notify the participant their verification was submitted
      socket.emit('fact-verification-submitted');

      // Check if both participants have submitted
      const bothComplete = sessionService.bothFactVerificationsComplete(sessionId);
      console.log(`Both verifications complete: ${bothComplete}`);
      
      if (bothComplete) {
        // Both done - generate final judgment with fact verification data
        console.log('Both participants verified facts, generating judgment...');
        await this.generateFinalJudgmentWithFacts(sessionId);
      } else {
        // Only notify the submitting participant to wait (not both)
        socket.emit('waiting-other-verification');
      }

    } catch (error) {
      console.error('Error handling fact verification:', error);
      socket.emit('error', { message: 'Failed to submit fact verification' });
    }
  }

  async generateFinalJudgmentWithFacts(sessionId) {
    try {
      console.log('generateFinalJudgmentWithFacts called for session:', sessionId);
      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      // Gather all data including fact verifications
      const p1Answers = sessionService.getP1InitialAnswers(sessionId);
      const p2Response = sessionService.getP2Response(sessionId);
      const p1Context = sessionService.getP1Context(sessionId);
      const p2Context = sessionService.getP2Context(sessionId);
      const factList = sessionService.getFactList(sessionId);
      const factVerifications = sessionService.getFactVerifications(sessionId);
      const participantContext = sessionService.getParticipantContext(sessionId);

      // Get attachments and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);

      const sessionData = {
        p1Answers,
        p2Response,
        p1Context,
        p2Context,
        factList,
        factVerifications,
        participantContext,
        attachmentContents: formattedAttachments,
        attachmentImages: attachmentImages
      };

      // Generate judgment (enhanced with fact verification data)
      const judgment = await mediationAI.generateScaleJudgment(sessionData, language, attachmentImages);

      // Save judgment
      sessionService.saveJudgment(sessionId, judgment);
      sessionService.updateSessionStatus(sessionId, 'completed');

      // Notify both participants
      this.io.to(sessionId).emit('judgment-ready', { judgment });

    } catch (error) {
      console.error('Error generating judgment with facts:', error);
      this.io.to(sessionId).emit('error', { message: 'Failed to generate judgment' });
    }
  }

  async generateFinalJudgment(sessionId) {
    try {
      const session = sessionService.getSession(sessionId);
      const language = session.language || 'en';
      const mediationAI = this.getMediationAI(session);

      // Gather all data
      const p1Answers = sessionService.getP1InitialAnswers(sessionId);
      const p2Response = sessionService.getP2Response(sessionId);
      const p1Context = sessionService.getP1Context(sessionId);
      const p2Context = sessionService.getP2Context(sessionId);
      const participantContext = sessionService.getParticipantContext(sessionId);

      // Get attachments and read their content
      const attachments = sessionService.getAttachments(sessionId);
      const attachmentContents = this.getAttachmentContents(sessionId, attachments);
      const { textContent: formattedAttachments, images: attachmentImages } = this.formatAttachmentContents(attachmentContents);

      const sessionData = {
        p1Answers,
        p2Response,
        p1Context,
        p2Context,
        participantContext,
        attachmentContents: formattedAttachments,
        attachmentImages: attachmentImages
      };

      // Generate judgment
      const judgment = await mediationAI.generateScaleJudgment(sessionData, language, attachmentImages);

      // Save judgment
      sessionService.saveJudgment(sessionId, judgment);
      sessionService.updateSessionStatus(sessionId, 'completed');

      // Notify both participants
      this.io.to(sessionId).emit('judgment-ready', { judgment });

    } catch (error) {
      console.error('Error generating judgment:', error);
      this.io.to(sessionId).emit('error', { message: 'Failed to generate judgment' });
    }
  }

  async handleUpdateEmail(socket, data) {
    try {
      const { participantId, email } = data;
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        socket.emit('error', { message: 'Invalid email format' });
        return;
      }
      
      // Update email in database
      await sessionService.updateParticipantEmail(participantId, email);
      
      // Send success response
      socket.emit('email-updated', { success: true });
      
      console.log(`Updated email for participant ${participantId}: ${email}`);
    } catch (error) {
      console.error('Error updating email:', error);
      socket.emit('error', { message: 'Failed to update email' });
    }
  }

  async getParticipantSocket(sessionId, participantNumber) {
    const sockets = await this.io.in(sessionId).fetchSockets();
    return sockets.find(s => s.participantNumber === participantNumber);
  }

  handleDisconnect(socket) {
    if (socket.sessionId && socket.participantId) {
      const participants = this.activeParticipants.get(socket.sessionId);
      if (participants) {
        participants.delete(socket.participantId);
        
        this.io.to(socket.sessionId).emit('participant-disconnected', {
          participantNumber: socket.participantNumber
        });
      }
    }
    console.log('Client disconnected:', socket.id);
  }
}

module.exports = SocketHandler;
