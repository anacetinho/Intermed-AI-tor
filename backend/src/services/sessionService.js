const db = require('../database');
const { v4: uuidv4 } = require('uuid');

class SessionService {
  createSession(participantCount, visibilityMode, initialDescription, language, model, title, workflow = 'simple', lmstudioUrl = null, lmstudioModel = null) {
    const sessionId = uuidv4();
    const createdAt = Date.now();

    // Create session
    const stmt = db.prepare(`
      INSERT INTO sessions (id, created_at, participant_count, visibility_mode, initial_description, language, model, title, workflow, status, lmstudio_url, lmstudio_model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(sessionId, createdAt, participantCount, visibilityMode, initialDescription || null, language, model, title || null, workflow, 'waiting_p2_join', lmstudioUrl || null, lmstudioModel || null);

    // Create participants with unique tokens
    const participants = [];
    const insertParticipant = db.prepare(`
      INSERT INTO participants (id, session_id, token, participant_number, is_initiator)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < participantCount; i++) {
      const participantId = uuidv4();
      const token = uuidv4();
      const isInitiator = i === 0 ? 1 : 0;
      
      insertParticipant.run(participantId, sessionId, token, i + 1, isInitiator);
      
      participants.push({
        participantNumber: i + 1,
        token: token,
        isInitiator: isInitiator === 1
      });
    }

    return {
      sessionId,
      participants
    };
  }

  getSession(sessionId) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return null;

    const participants = db.prepare(`
      SELECT id, participant_number, token, joined_at, is_initiator 
      FROM participants 
      WHERE session_id = ?
      ORDER BY participant_number
    `).all(sessionId);

    return {
      ...session,
      participants
    };
  }

  joinSession(token) {
    const participant = db.prepare(`
      SELECT p.*, s.status, s.visibility_mode, s.current_round, s.language, s.title, s.initial_description, s.p2_acceptance_status, s.ai_summary_p1, s.ai_briefing_p2, s.workflow
      FROM participants p
      JOIN sessions s ON p.session_id = s.id
      WHERE p.token = ?
    `).get(token);

    if (!participant) {
      throw new Error('Invalid token');
    }

    // Update joined_at if first time
    if (!participant.joined_at) {
      db.prepare('UPDATE participants SET joined_at = ? WHERE token = ?')
        .run(Date.now(), token);
    }

    return participant;
  }

  getAllParticipantsJoined(sessionId) {
    const participants = db.prepare(`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN joined_at IS NOT NULL THEN 1 ELSE 0 END) as joined
      FROM participants
      WHERE session_id = ?
    `).get(sessionId);

    return participants.total === participants.joined;
  }

  startSession(sessionId) {
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?')
      .run('active', sessionId);
  }

  getCurrentRound(sessionId) {
    const session = db.prepare('SELECT current_round FROM sessions WHERE id = ?')
      .get(sessionId);
    return session ? session.current_round : 0;
  }

  advanceRound(sessionId) {
    const session = db.prepare('SELECT current_round FROM sessions WHERE id = ?')
      .get(sessionId);
    
    const newRound = session.current_round + 1;
    
    db.prepare('UPDATE sessions SET current_round = ? WHERE id = ?')
      .run(newRound, sessionId);

    // Create round record
    const roundId = db.prepare(`
      INSERT INTO rounds (session_id, round_number, started_at)
      VALUES (?, ?, ?)
    `).run(sessionId, newRound, Date.now()).lastInsertRowid;

    return { roundNumber: newRound, roundId };
  }

  completeRound(sessionId, roundNumber) {
    db.prepare(`
      UPDATE rounds 
      SET completed_at = ?
      WHERE session_id = ? AND round_number = ?
    `).run(Date.now(), sessionId, roundNumber);
  }

  saveQuestion(roundId, participantId, questionText) {
    const questionId = db.prepare(`
      INSERT INTO questions (round_id, participant_id, question_text, asked_at)
      VALUES (?, ?, ?, ?)
    `).run(roundId, participantId, questionText, Date.now()).lastInsertRowid;

    return questionId;
  }

  saveResponse(questionId, participantId, responseText) {
    const responseId = db.prepare(`
      INSERT INTO responses (question_id, participant_id, response_text, submitted_at)
      VALUES (?, ?, ?, ?)
    `).run(questionId, participantId, responseText, Date.now()).lastInsertRowid;

    return responseId;
  }

  saveDispute(responseId, disputingParticipantId, comment) {
    const disputeId = db.prepare(`
      INSERT INTO disputes (response_id, disputing_participant_id, dispute_comment, created_at)
      VALUES (?, ?, ?, ?)
    `).run(responseId, disputingParticipantId, comment, Date.now()).lastInsertRowid;

    return disputeId;
  }

  getRoundData(sessionId, roundNumber) {
    const round = db.prepare(`
      SELECT * FROM rounds 
      WHERE session_id = ? AND round_number = ?
    `).get(sessionId, roundNumber);

    if (!round) return null;

    const questions = db.prepare(`
      SELECT q.*, p.participant_number, r.response_text, r.id as response_id, r.submitted_at
      FROM questions q
      JOIN participants p ON q.participant_id = p.id
      LEFT JOIN responses r ON q.id = r.question_id
      WHERE q.round_id = ?
      ORDER BY p.participant_number
    `).all(round.id);

    return {
      ...round,
      questions
    };
  }

  getAllRoundsData(sessionId) {
    const rounds = [];
    const currentRound = this.getCurrentRound(sessionId);

    for (let i = 1; i <= currentRound; i++) {
      const roundData = this.getRoundData(sessionId, i);
      if (roundData) {
        const formattedResponses = roundData.questions.map(q => ({
          participantNumber: q.participant_number,
          question: q.question_text,
          response: q.response_text || '',
          responseId: q.response_id
        }));

        rounds.push({
          roundNumber: i,
          responses: formattedResponses
        });
      }
    }

    return rounds;
  }

  getAllDisputes(sessionId) {
    const disputes = db.prepare(`
      SELECT 
        d.*, 
        r.response_text,
        p1.participant_number as disputing_participant_number,
        p2.participant_number as target_participant_number,
        rounds.round_number
      FROM disputes d
      JOIN responses r ON d.response_id = r.id
      JOIN participants p1 ON d.disputing_participant_id = p1.id
      JOIN participants p2 ON r.participant_id = p2.id
      JOIN questions q ON r.question_id = q.id
      JOIN rounds ON q.round_id = rounds.id
      WHERE rounds.session_id = ?
      ORDER BY d.created_at
    `).all(sessionId);

    return disputes.map(d => ({
      round: d.round_number,
      disputingParticipantNumber: d.disputing_participant_number,
      targetParticipantNumber: d.target_participant_number,
      originalResponse: d.response_text,
      comment: d.dispute_comment
    }));
  }

  saveJudgment(sessionId, judgment) {
    db.prepare('UPDATE sessions SET judgment = ?, status = ? WHERE id = ?')
      .run(JSON.stringify(judgment), 'completed', sessionId);
  }

  getJudgment(sessionId) {
    const session = db.prepare('SELECT judgment FROM sessions WHERE id = ?')
      .get(sessionId);
    
    return session && session.judgment ? JSON.parse(session.judgment) : null;
  }

  checkAllResponsesSubmitted(sessionId, roundNumber) {
    // Get total questions expected for this round
    const questionsResult = db.prepare(`
      SELECT COUNT(*) as total_questions
      FROM questions q
      JOIN rounds r ON q.round_id = r.id
      WHERE r.session_id = ? AND r.round_number = ?
    `).get(sessionId, roundNumber);

    // Get total responses submitted for this round
    const responsesResult = db.prepare(`
      SELECT COUNT(DISTINCT resp.id) as total_responses
      FROM responses resp
      JOIN questions q ON resp.question_id = q.id
      JOIN rounds r ON q.round_id = r.id
      WHERE r.session_id = ? AND r.round_number = ?
    `).get(sessionId, roundNumber);

    const totalQuestions = questionsResult.total_questions || 0;
    const totalResponses = responsesResult.total_responses || 0;
    
    console.log(`Round ${roundNumber}: ${totalResponses}/${totalQuestions} responses submitted`);
    
    // If there are no questions, something went wrong - don't consider the round complete
    if (totalQuestions === 0) {
      console.warn(`Round ${roundNumber} has no questions! This indicates a problem with question generation.`);
      return false;
    }

    return totalQuestions === totalResponses;
  }

  // New methods for the 2-participant workflow

  saveP1InitialAnswers(sessionId, participantId, answers) {
    const stmt = db.prepare(`
      INSERT INTO p1_initial_answers (session_id, participant_id, what_happened, what_led_to_it, how_it_made_them_feel, desired_outcome, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const answerId = stmt.run(
      sessionId,
      participantId,
      answers.whatHappened,
      answers.whatLedToIt,
      answers.howItMadeThemFeel,
      answers.desiredOutcome,
      Date.now()
    ).lastInsertRowid;

    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('waiting_p2_acceptance', sessionId);
    return answerId;
  }

  getP1InitialAnswers(sessionId) {
    return db.prepare(`SELECT * FROM p1_initial_answers WHERE session_id = ?`).get(sessionId);
  }

  setP2Decision(sessionId, participantId, decision) {
    const participant = db.prepare(`SELECT participant_number FROM participants WHERE id = ? AND session_id = ?`).get(participantId, sessionId);
    if (!participant || participant.participant_number !== 2) {
      throw new Error('Only participant 2 can make this decision');
    }
    db.prepare('UPDATE sessions SET p2_acceptance_status = ?, status = ? WHERE id = ?')
      .run(decision, decision === 'accepted' ? 'p2_answering' : 'rejected', sessionId);
  }

  saveAISummaryForP1(sessionId, summary, briefing) {
    db.prepare('UPDATE sessions SET ai_summary_p1 = ?, ai_briefing_p2 = ? WHERE id = ?')
      .run(summary, briefing, sessionId);
  }

  getAISummaryForP2(sessionId) {
    return db.prepare('SELECT ai_summary_p1, ai_briefing_p2 FROM sessions WHERE id = ?').get(sessionId);
  }

  saveP2Response(sessionId, participantId, response) {
    const { responseType, disputeText, whatHappened, whatLedToIt, howItMadeThemFeel, desiredOutcome } = response;
    const stmt = db.prepare(`
      INSERT INTO p2_responses (session_id, participant_id, response_type, dispute_text, what_happened, what_led_to_it, how_it_made_them_feel, desired_outcome, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const responseId = stmt.run(sessionId, participantId, responseType, disputeText || null, whatHappened || null, whatLedToIt || null, howItMadeThemFeel || null, desiredOutcome || null, Date.now()).lastInsertRowid;
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('waiting_p1_context', sessionId);
    return responseId;
  }

  getP2Response(sessionId) {
    return db.prepare(`SELECT * FROM p2_responses WHERE session_id = ?`).get(sessionId);
  }

  saveDisputePoints(sessionId, disputePoints) {
    db.prepare('UPDATE sessions SET dispute_points = ? WHERE id = ?').run(JSON.stringify(disputePoints), sessionId);
  }

  getDisputePoints(sessionId) {
    const session = db.prepare('SELECT dispute_points FROM sessions WHERE id = ?').get(sessionId);
    return session && session.dispute_points ? JSON.parse(session.dispute_points) : null;
  }

  saveP1Context(sessionId, participantId, contextText) {
    db.prepare('UPDATE sessions SET p1_context = ?, status = ? WHERE id = ?').run(contextText, 'waiting_p2_context', sessionId);
  }

  getP1Context(sessionId) {
    const session = db.prepare('SELECT p1_context FROM sessions WHERE id = ?').get(sessionId);
    return session ? session.p1_context : null;
  }

  saveP2Context(sessionId, participantId, contextText) {
    db.prepare('UPDATE sessions SET p2_context = ?, status = ? WHERE id = ?').run(contextText, 'generating_judgment', sessionId);
  }

  getP2Context(sessionId) {
    const session = db.prepare('SELECT p2_context FROM sessions WHERE id = ?').get(sessionId);
    return session ? session.p2_context : null;
  }

  updateSessionStatus(sessionId, status) {
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run(status, sessionId);
  }

  updateParticipantEmail(participantId, email) {
    db.prepare('UPDATE participants SET email = ? WHERE id = ?').run(email, participantId);
  }

  getParticipants(sessionId) {
    return db.prepare(`
      SELECT * FROM participants 
      WHERE session_id = ? 
      ORDER BY participant_number
    `).all(sessionId);
  }

  getParticipantByNumber(sessionId, participantNumber) {
    return db.prepare(`
      SELECT * FROM participants 
      WHERE session_id = ? AND participant_number = ?
    `).get(sessionId, participantNumber);
  }

  // Attachment methods for Advanced workflow
  saveAttachment(sessionId, participantId, stage, fileInfo) {
    const stmt = db.prepare(`
      INSERT INTO attachments (session_id, participant_id, stage, file_name, original_name, file_type, mime_type, file_size, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      sessionId,
      participantId,
      stage,
      fileInfo.fileName,
      fileInfo.originalName,
      fileInfo.fileType,
      fileInfo.mimeType,
      fileInfo.fileSize,
      Date.now()
    ).lastInsertRowid;
  }

  getAttachments(sessionId, stage = null) {
    if (stage) {
      return db.prepare(`
        SELECT a.*, p.participant_number 
        FROM attachments a
        JOIN participants p ON a.participant_id = p.id
        WHERE a.session_id = ? AND a.stage = ?
        ORDER BY a.uploaded_at
      `).all(sessionId, stage);
    }
    return db.prepare(`
      SELECT a.*, p.participant_number 
      FROM attachments a
      JOIN participants p ON a.participant_id = p.id
      WHERE a.session_id = ?
      ORDER BY a.uploaded_at
    `).all(sessionId);
  }

  getAttachmentById(attachmentId) {
    return db.prepare(`SELECT * FROM attachments WHERE id = ?`).get(attachmentId);
  }

  deleteAttachment(attachmentId) {
    db.prepare(`DELETE FROM attachments WHERE id = ?`).run(attachmentId);
  }

  // Fact verification methods for Advanced workflow
  saveFactList(sessionId, factList) {
    db.prepare('UPDATE sessions SET fact_list = ? WHERE id = ?')
      .run(JSON.stringify(factList), sessionId);
  }

  getFactList(sessionId) {
    const session = db.prepare('SELECT fact_list FROM sessions WHERE id = ?').get(sessionId);
    return session && session.fact_list ? JSON.parse(session.fact_list) : null;
  }

  saveFactVerification(sessionId, participantNumber, verifications) {
    const column = participantNumber === 1 ? 'p1_fact_verifications' : 'p2_fact_verifications';
    db.prepare(`UPDATE sessions SET ${column} = ? WHERE id = ?`)
      .run(JSON.stringify(verifications), sessionId);
  }

  getFactVerifications(sessionId) {
    const session = db.prepare('SELECT p1_fact_verifications, p2_fact_verifications FROM sessions WHERE id = ?').get(sessionId);
    return {
      p1: session && session.p1_fact_verifications ? JSON.parse(session.p1_fact_verifications) : null,
      p2: session && session.p2_fact_verifications ? JSON.parse(session.p2_fact_verifications) : null
    };
  }

  bothFactVerificationsComplete(sessionId) {
    const verifications = this.getFactVerifications(sessionId);
    return verifications.p1 !== null && verifications.p2 !== null;
  }

  // Hidden participant context methods (internal AI reasoning)
  saveParticipantContext(sessionId, context) {
    db.prepare('UPDATE sessions SET participant_context = ? WHERE id = ?')
      .run(JSON.stringify(context), sessionId);
  }

  getParticipantContext(sessionId) {
    const session = db.prepare('SELECT participant_context FROM sessions WHERE id = ?').get(sessionId);
    return session && session.participant_context ? JSON.parse(session.participant_context) : null;
  }
}

module.exports = new SessionService();


