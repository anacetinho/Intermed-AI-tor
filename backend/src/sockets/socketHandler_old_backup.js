const sessionService = require('../services/sessionService');
const MediationAI = require('../llm/mediationAI');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.mediationAI = new MediationAI(
      process.env.LLM_PROVIDER,
      process.env.LLM_API_KEY,
      process.env.LLM_BASE_URL,
      process.env.LLM_MODEL
    );
    this.activeParticipants = new Map(); // sessionId -> Set of participantIds
  }

  initialize() {
    this.io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);

      socket.on('join-session', async (data) => {
        await this.handleJoinSession(socket, data);
      });

      socket.on('submit-response', async (data) => {
        await this.handleSubmitResponse(socket, data);
      });

      socket.on('mark-dispute', async (data) => {
        await this.handleMarkDispute(socket, data);
      });

      socket.on('start-session', async (data) => {
        await this.handleStartSession(socket, data);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        this.handleDisconnect(socket);
      });
    });
  }

  async handleJoinSession(socket, data) {
    try {
      const { sessionId, participantId, participantNumber } = data;

      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.participantId = participantId;
      socket.participantNumber = participantNumber;

      // Track active participants
      if (!this.activeParticipants.has(sessionId)) {
        this.activeParticipants.set(sessionId, new Set());
      }
      this.activeParticipants.get(sessionId).add(participantId);

      const session = sessionService.getSession(sessionId);
      
      // Notify all participants
      this.io.to(sessionId).emit('participant-joined', {
        participantNumber,
        totalJoined: this.activeParticipants.get(sessionId).size,
        totalExpected: session.participant_count
      });

      // Check if all joined and session can start
      if (sessionService.getAllParticipantsJoined(sessionId)) {
        this.io.to(sessionId).emit('all-participants-ready');
      }

      socket.emit('joined-successfully', {
        sessionId,
        participantNumber,
        visibilityMode: session.visibility_mode,
        currentRound: session.current_round,
        status: session.status
      });
    } catch (error) {
      console.error('Error joining session:', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  }

  async handleStartSession(socket, data) {
    try {
      const { sessionId } = data;
      
      sessionService.startSession(sessionId);
      
      // Start Round 1
      await this.startNewRound(sessionId);
    } catch (error) {
      console.error('Error starting session:', error);
      socket.emit('error', { message: 'Failed to start session' });
    }
  }

  async startNewRound(sessionId) {
    try {
      const session = sessionService.getSession(sessionId);
      const { roundNumber, roundId } = sessionService.advanceRound(sessionId);

      this.io.to(sessionId).emit('round-started', { roundNumber });

      // Generate questions for each participant
      const previousRoundsData = sessionService.getAllRoundsData(sessionId);
      const disputes = sessionService.getAllDisputes(sessionId);

      for (const participant of session.participants) {
        let questions;
        
        try {
          // Try to generate questions with AI
          questions = await this.mediationAI.generateRoundQuestions(
            {
              initialDescription: session.initial_description
            },
            roundNumber,
            { number: participant.participant_number },
            previousRoundsData.filter(r => r.roundNumber < roundNumber),
            disputes.filter(d => d.targetParticipantNumber === participant.participant_number)
          );
        } catch (llmError) {
          console.error('Error generating questions with LLM, using fallback questions:', llmError.message);
          
          // Fallback to generic questions based on round number
          questions = this.getFallbackQuestions(roundNumber);
        }

        // Save questions and emit to participant
        const questionData = [];
        for (const questionText of questions) {
          const questionId = sessionService.saveQuestion(
            roundId,
            participant.id,
            questionText
          );
          questionData.push({ questionId, questionText });
        }

        // Send questions to specific participant
        const sockets = await this.io.in(sessionId).fetchSockets();
        const participantSocket = sockets.find(s => s.participantId === participant.id);
        
        if (participantSocket) {
          participantSocket.emit('questions-received', {
            roundNumber,
            questions: questionData
          });
        }
      }
    } catch (error) {
      console.error('Error starting new round:', error);
      this.io.to(sessionId).emit('error', { message: 'Failed to start round' });
    }
  }

  getFallbackQuestions(roundNumber) {
    const fallbackQuestions = {
      1: [
        "Can you describe what happened from your perspective?",
        "What do you think led to this situation?",
        "How has this affected you?"
      ],
      2: [
        "What do you think the other person's concerns might be?",
        "Is there anything you might have done differently?",
        "What would an ideal resolution look like for you?"
      ],
      3: [
        "What common ground can you see between your perspectives?",
        "What are you willing to compromise on?",
        "What is most important to you in resolving this?"
      ],
      4: [
        "What specific steps can you take to move forward?",
        "How can both parties work together to prevent this in the future?",
        "What commitment are you willing to make?"
      ]
    };

    return fallbackQuestions[roundNumber] || [
      "Please share your thoughts on the current situation.",
      "What concerns do you have?",
      "What would help resolve this matter?"
    ];
  }

  async handleSubmitResponse(socket, data) {
    try {
      const { sessionId, questionId, responseText, roundNumber } = data;
      const participantId = socket.participantId;

      // Save response
      const responseId = sessionService.saveResponse(questionId, participantId, responseText);

      const session = sessionService.getSession(sessionId);

      // If visibility is open, broadcast response to all
      if (session.visibility_mode === 'open') {
        this.io.to(sessionId).emit('response-submitted', {
          responseId,
          participantNumber: socket.participantNumber,
          questionId,
          responseText,
          roundNumber
        });
      }

      // Check if all participants have responded for this round
      const allResponded = sessionService.checkAllResponsesSubmitted(sessionId, roundNumber);

      if (allResponded) {
        sessionService.completeRound(sessionId, roundNumber);
        this.io.to(sessionId).emit('round-complete', { roundNumber });

        // Start next round or generate judgment
        if (roundNumber < 4) {
          // Wait a bit before starting next round
          setTimeout(() => {
            this.startNewRound(sessionId);
          }, 2000);
        } else {
          // Generate final judgment
          await this.generateJudgment(sessionId);
        }
      }
    } catch (error) {
      console.error('Error submitting response:', error);
      socket.emit('error', { message: 'Failed to submit response' });
    }
  }

  async handleMarkDispute(socket, data) {
    try {
      const { sessionId, responseId, comment } = data;
      const disputingParticipantId = socket.participantId;

      sessionService.saveDispute(responseId, disputingParticipantId, comment);

      // Notify all participants
      this.io.to(sessionId).emit('dispute-marked', {
        responseId,
        disputingParticipantNumber: socket.participantNumber,
        comment
      });
    } catch (error) {
      console.error('Error marking dispute:', error);
      socket.emit('error', { message: 'Failed to mark dispute' });
    }
  }

  async generateJudgment(sessionId) {
    try {
      this.io.to(sessionId).emit('generating-judgment');

      const session = sessionService.getSession(sessionId);
      const allRoundsData = sessionService.getAllRoundsData(sessionId);
      const allDisputes = sessionService.getAllDisputes(sessionId);

      const judgment = await this.mediationAI.generateFinalJudgment(
        {
          initialDescription: session.initial_description,
          participantCount: session.participant_count
        },
        allRoundsData,
        allDisputes
      );

      sessionService.saveJudgment(sessionId, judgment);

      this.io.to(sessionId).emit('judgment-ready', { judgment });
    } catch (error) {
      console.error('Error generating judgment:', error);
      this.io.to(sessionId).emit('error', { message: 'Failed to generate judgment' });
    }
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
  }
}

module.exports = SocketHandler;
