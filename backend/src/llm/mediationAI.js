const LLMProvider = require('./provider');

class MediationAI {
  constructor(provider, apiKey, baseURL, model) {
    this.llm = new LLMProvider(provider, apiKey, baseURL, model);
  }

  async generateRoundQuestions(sessionContext, roundNumber, participantInfo, previousRoundsData, disputes) {
    const systemPrompt = `You are an expert mediator conducting a structured conflict resolution session. 
You are currently in Round ${roundNumber} of 4. Your role is to ask thoughtful, targeted questions to gather facts and understand each participant's perspective.

Guidelines:
- Ask 2-3 specific questions per participant
- Build on information from previous rounds
- Address any disputes raised by other participants
- Focus on facts, not blame
- Be neutral and empathetic
- Questions should help clarify the situation and uncover root causes`;

    const contextMessages = this.buildContextForQuestions(
      sessionContext,
      roundNumber,
      participantInfo,
      previousRoundsData,
      disputes
    );

    const messages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
      {
        role: 'user',
        content: `Generate questions for Participant ${participantInfo.number} for Round ${roundNumber}. 
Return ONLY a JSON object with this structure:
{
  "questions": ["question 1", "question 2", "question 3"]
}
No additional text, just the JSON.`
      }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.7);
      const parsed = JSON.parse(response.trim());
      return parsed.questions || [];
    } catch (error) {
      console.error('Error generating questions:', error);
      // Fallback questions
      return [
        `Can you describe what happened from your perspective?`,
        `What do you think led to this situation?`,
        `How has this affected you?`
      ];
    }
  }

  buildContextForQuestions(sessionContext, roundNumber, participantInfo, previousRoundsData, disputes) {
    const messages = [];

    // Add initial conflict description
    if (sessionContext.initialDescription) {
      messages.push({
        role: 'user',
        content: `Initial conflict description: ${sessionContext.initialDescription}`
      });
    }

    // Add previous rounds context
    if (previousRoundsData && previousRoundsData.length > 0) {
      const roundsSummary = previousRoundsData.map(round => {
        const responses = round.responses.map(r => 
          `Participant ${r.participantNumber}: Q: "${r.question}" A: "${r.response}"`
        ).join('\n');
        return `Round ${round.roundNumber}:\n${responses}`;
      }).join('\n\n');

      messages.push({
        role: 'user',
        content: `Previous rounds information:\n${roundsSummary}`
      });
    }

    // Add disputes targeting this participant
    if (disputes && disputes.length > 0) {
      const relevantDisputes = disputes.filter(d => d.targetParticipantNumber === participantInfo.number);
      if (relevantDisputes.length > 0) {
        const disputesSummary = relevantDisputes.map(d =>
          `Participant ${d.disputingParticipantNumber} disputed: "${d.originalResponse}"\nComment: "${d.comment}"`
        ).join('\n');
        
        messages.push({
          role: 'user',
          content: `Disputes raised about Participant ${participantInfo.number}'s responses:\n${disputesSummary}\n\nAddress these disputes in your questions.`
        });
      }
    }

    return messages;
  }

  async generateFinalJudgment(sessionContext, allRoundsData, allDisputes) {
    const systemPrompt = `You are an expert mediator providing a final judgment on a conflict resolution case.
Your analysis must be thorough, fair, and evidence-based.

Structure your judgment with:
1. OVERVIEW: Brief summary of the conflict
2. INFORMATION GATHERED: Key facts from each participant
3. ANALYSIS: Deep dive into what happened and why
4. FAULT ASSESSMENT: Table showing each participant's responsibility
5. REASONING: Explanation of your conclusions
6. FINAL VERDICT: Clear statement of blame assignment and recommendations`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.buildContextForJudgment(sessionContext, allRoundsData, allDisputes),
      {
        role: 'user',
        content: `Provide a comprehensive final judgment. Return as JSON with this structure:
{
  "overview": "string",
  "informationGathered": [
    {"participant": "number", "keyPoints": ["point1", "point2"]}
  ],
  "analysis": "string",
  "faultAssessment": [
    {
      "participant": "number",
      "faultPercentage": 0-100,
      "areasOfFault": ["area1", "area2"],
      "areasOfInnocence": ["area1", "area2"]
    }
  ],
  "reasoning": "string",
  "verdict": "string",
  "recommendations": ["rec1", "rec2"]
}
Be thorough and fair. Consider all evidence and disputes.`
      }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.5);
      return JSON.parse(response.trim());
    } catch (error) {
      console.error('Error generating judgment:', error);
      throw new Error('Failed to generate judgment');
    }
  }

  buildContextForJudgment(sessionContext, allRoundsData, allDisputes) {
    const messages = [];

    // Initial description
    if (sessionContext.initialDescription) {
      messages.push({
        role: 'user',
        content: `Conflict description: ${sessionContext.initialDescription}`
      });
    }

    // All rounds data
    const fullTranscript = allRoundsData.map(round => {
      const roundData = round.responses.map(r =>
        `Participant ${r.participantNumber}:\nQ: ${r.question}\nA: ${r.response}`
      ).join('\n\n');
      return `=== ROUND ${round.roundNumber} ===\n${roundData}`;
    }).join('\n\n');

    messages.push({
      role: 'user',
      content: `Complete session transcript:\n${fullTranscript}`
    });

    // All disputes
    if (allDisputes && allDisputes.length > 0) {
      const disputesSummary = allDisputes.map(d =>
        `Round ${d.round}: Participant ${d.disputingParticipantNumber} disputed Participant ${d.targetParticipantNumber}'s response: "${d.originalResponse}"\nDispute comment: "${d.comment}"`
      ).join('\n\n');

      messages.push({
        role: 'user',
        content: `Disputes raised during the session:\n${disputesSummary}`
      });
    }

    return messages;
  }

  // New methods for 2-participant workflow

  async generateP1Summary(p1Answers, language, attachmentContents = '', images = []) {
    const isPortuguese = language === 'pt';
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE CUIDADOSAMENTE as imagens anexadas e extraia informacoes relevantes delas.' : ' CAREFULLY ANALYZE any attached images and extract relevant information from them.')
      : '';
    
    const systemPrompt = isPortuguese
      ? `Voce e um mediador de IA. RESPONDA INTEIRAMENTE EM PORTUGUES. NAO USE NENHUMA PALAVRA EM INGLES. Crie um resumo claro e neutro da perspectiva do Participante 1 para o Participante 2 revisar. Se houver documentos anexados, inclua informacoes relevantes deles (numeros, valores, datas).${imageInstruction}`
      : `You are an AI mediator. RESPOND ENTIRELY IN ENGLISH. Create a clear, neutral summary of Participant 1's perspective for Participant 2 to review. If there are attached documents, include relevant information from them (numbers, values, dates).${imageInstruction}`;
    
    const userPrompt = isPortuguese
      ? `IMPORTANTE: Escreva sua resposta inteiramente em portugues.

Participante 1 forneceu estas respostas:
- O que aconteceu: ${p1Answers.what_happened}
- O que levou a isso: ${p1Answers.what_led_to_it}
- Como isso os fez sentir: ${p1Answers.how_it_made_them_feel}
- Resultado desejado: ${p1Answers.desired_outcome}${attachmentContents}

Crie um resumo conciso e neutro (2-3 paragrafos) que o Participante 2 possa ler para entender a perspectiva do Participante 1. Se houver documentos ou imagens anexadas, mencione fatos relevantes deles.`
      : `Participant 1 provided these answers:
- What happened: ${p1Answers.what_happened}
- What led to it: ${p1Answers.what_led_to_it}
- How it made them feel: ${p1Answers.how_it_made_them_feel}
- Desired outcome: ${p1Answers.desired_outcome}${attachmentContents}

Create a concise, neutral summary (2-3 paragraphs) that Participant 2 can read to understand Participant 1's perspective. If there are attached documents or images, mention relevant facts from them.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    return await this.llm.generateCompletion(messages, 0.7, images);
  }

  async generateP2Briefing(p1Answers, language) {
    const isPortuguese = language === 'pt';
    const systemPrompt = isPortuguese
      ? `Voce e um mediador de IA. RESPONDA INTEIRAMENTE EM PORTUGUES. Crie uma mensagem breve para o Participante 2 explicando o que eles precisam fazer em seguida.`
      : `You are an AI mediator. RESPOND ENTIRELY IN ENGLISH. Create a brief message for Participant 2 explaining what they need to do next.`;
    
    const userPrompt = isPortuguese
      ? `IMPORTANTE: Escreva em portugues.

O Participante 1 enviou sua perspectiva. Crie uma mensagem breve (2-3 frases) perguntando ao Participante 2 se ele aceita participar desta sessao de mediacao. Explique que ele revisara a perspectiva do Participante 1 e fornecera a sua propria.`
      : `Participant 1 has submitted their perspective. Create a brief message (2-3 sentences) asking Participant 2 if they accept to participate in this mediation session. Explain they will review Participant 1's perspective and provide their own.`;
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    return await this.llm.generateCompletion(messages, 0.7);
  }

  async generateKeyDisputePoints(p1Answers, p2Response, visibilityMode, language, attachmentContents = '', images = []) {
    const isPortuguese = language === 'pt';
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE as imagens anexadas para extrair informacoes relevantes.' : ' ANALYZE attached images to extract relevant information.')
      : '';
    
    const systemPrompt = isPortuguese
      ? `Voce e um mediador de IA analisando um conflito. RESPONDA INTEIRAMENTE EM PORTUGUES. Identifique pontos-chave de desacordo entre os dois participantes. Se houver documentos anexados, considere os fatos deles na analise.${imageInstruction}`
      : `You are an AI mediator analyzing a conflict. RESPOND ENTIRELY IN ENGLISH. Identify key points of disagreement between the two participants. If there are attached documents, consider the facts from them in your analysis.${imageInstruction}`;
    
    const p2Content = visibilityMode === 'open' 
      ? `Participant 2's dispute/response: ${p2Response.dispute_text || ''}`
      : `Participant 2's answers:
- What happened: ${p2Response.what_happened}
- What led to it: ${p2Response.what_led_to_it}
- How it made them feel: ${p2Response.how_it_made_them_feel}
- Desired outcome: ${p2Response.desired_outcome}`;

    const userPrompt = isPortuguese
      ? `IMPORTANTE: Todos os pontos devem estar em portugues.\n\nAnalise estas duas perspectivas e identifique 3-5 pontos-chave de disputa como um array JSON:\n\nParticipante 1:\n- O que aconteceu: ${p1Answers.what_happened}\n- O que levou a isso: ${p1Answers.what_led_to_it}\n- Como isso os fez sentir: ${p1Answers.how_it_made_them_feel}\n- Resultado desejado: ${p1Answers.desired_outcome}\n\n${p2Content}${attachmentContents}\n\nRetorne JSON: {"disputePoints": ["ponto 1", "ponto 2", "ponto 3"]}`
      : `Analyze these two perspectives and identify 3-5 key dispute points as a JSON array:\n\nParticipant 1:\n- What happened: ${p1Answers.what_happened}\n- What led to it: ${p1Answers.what_led_to_it}\n- How it made them feel: ${p1Answers.how_it_made_them_feel}\n- Desired outcome: ${p1Answers.desired_outcome}\n\n${p2Content}${attachmentContents}\n\nReturn JSON: {"disputePoints": ["point 1", "point 2", "point 3"]}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.7, images);
      const parsed = JSON.parse(response.trim());
      return parsed.disputePoints || [];
    } catch (error) {
      console.error('Error generating dispute points:', error);
      const fallback = isPortuguese
        ? 'Nao foi possivel identificar pontos de disputa especificos. Contexto adicional pode ajudar a esclarecer.'
        : 'Unable to identify specific dispute points. Additional context may help clarify.';
      return [fallback];
    }
  }

  async generateScaleJudgment(sessionData, language, images = []) {
    const isPortuguese = language === 'pt';
    
    // STEP 1: Sanitize facts to remove tone bias
    console.log('[MediationAI] Step 1: Sanitizing facts for objective judgment...');
    const sanitizedFacts = await this.sanitizeFactsForJudgment(sessionData, language, images);
    console.log('[MediationAI] Sanitized facts generated:', JSON.stringify(sanitizedFacts, null, 2));
    
    // Attachment content (from Advanced workflow)
    const attachmentContents = sessionData.attachmentContents || '';
    
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE CUIDADOSAMENTE todas as imagens anexadas como evidencia visual.' : ' CAREFULLY ANALYZE all attached images as visual evidence.')
      : '';
    
    // STEP 2: Generate judgment based on sanitized facts
    console.log('[MediationAI] Step 2: Generating judgment based on sanitized facts...');
    
    const systemPrompt = isPortuguese
      ? `Você é um mediador especialista fornecendo um julgamento decisivo. RESPONDA INTEIRAMENTE EM PORTUGUÊS (exceto os códigos de veredicto que devem permanecer em inglês).

REGRA CRÍTICA: Baseie seu veredicto APENAS no REGISTRO FACTUAL SANITIZADO fornecido. 
NÃO CONSIDERE:
- Como os participantes se expressaram
- Tom, confiança ou assertividade
- Apelos emocionais ou linguagem diplomática
- Se alguém pareceu "rude" ou "educado"

AVALIE APENAS:
- Consistência lógica das afirmações factuais
- Evidências que apoiam cada posição
- Obrigações legais/éticas (contratos, votos, responsabilidades)
- Justiça dos resultados baseada em circunstâncias objetivas

IMPORTANTE: Um participante que está factualmente correto mas foi assertivo/direto NÃO deve ser penalizado por seu tom. Julgue os FATOS, não a apresentação.

Você deve escolher UM destes seis veredictos:
1. "p1_right" - Participante 1 está certo
2. "p1_more_right" - Participante 1 está mais certo que o Participante 2
3. "both_right" - Ambos os participantes estão certos
4. "neither_right" - Nenhum participante está certo
5. "p2_more_right" - Participante 2 está mais certo que o Participante 1
6. "p2_right" - Participante 2 está certo

NÃO force um tom conciliatório se uma parte está claramente em falta. Seja decisivo e baseado em evidências.${imageInstruction}`
      : `You are an expert mediator providing a decisive judgment. RESPOND ENTIRELY IN ENGLISH.

CRITICAL RULE: Base your verdict ONLY on the SANITIZED FACTUAL RECORD provided.
DO NOT CONSIDER:
- How participants expressed themselves
- Tone, confidence, or assertiveness
- Emotional appeals or diplomatic language
- Whether someone seemed "rude" or "polite"

EVALUATE ONLY:
- Logical consistency of factual claims
- Evidence supporting each position
- Legal/ethical obligations (contracts, vows, responsibilities)
- Fairness of outcomes based on objective circumstances

IMPORTANT: A participant who is factually correct but was assertive/direct should NOT be penalized for their tone. Judge the FACTS, not the presentation.

You must choose ONE of these six verdicts:
1. "p1_right" - Participant 1 is right
2. "p1_more_right" - Participant 1 is more right than Participant 2
3. "both_right" - Both participants are right
4. "neither_right" - Neither participant is right
5. "p2_more_right" - Participant 2 is more right than Participant 1
6. "p2_right" - Participant 2 is right

Do NOT force a conciliatory tone if one party is clearly at fault. Be decisive and evidence-based.${imageInstruction}`;

    // Participant context (hidden internal field for better understanding)
    const participantContextSection = this.formatContextForJudgment(sessionData.participantContext);
    
    // Format sanitized facts for the prompt
    const formatSanitizedFacts = (facts) => {
      let formatted = '';
      
      if (facts.p1_factual_claims?.length > 0) {
        formatted += isPortuguese 
          ? `\nAFIRMAÇÕES FACTUAIS DE P1:\n` 
          : `\nP1 FACTUAL CLAIMS:\n`;
        facts.p1_factual_claims.forEach((claim, i) => {
          formatted += `${i + 1}. ${claim}\n`;
        });
      }
      
      if (facts.p2_factual_claims?.length > 0) {
        formatted += isPortuguese 
          ? `\nAFIRMAÇÕES FACTUAIS DE P2:\n` 
          : `\nP2 FACTUAL CLAIMS:\n`;
        facts.p2_factual_claims.forEach((claim, i) => {
          formatted += `${i + 1}. ${claim}\n`;
        });
      }
      
      if (facts.agreed_facts?.length > 0) {
        formatted += isPortuguese 
          ? `\nFATOS ACORDADOS POR AMBOS:\n` 
          : `\nFACTS AGREED BY BOTH:\n`;
        facts.agreed_facts.forEach((fact, i) => {
          formatted += `${i + 1}. ${fact}\n`;
        });
      }
      
      if (facts.disputed_facts?.length > 0) {
        formatted += isPortuguese 
          ? `\nFATOS DISPUTADOS:\n` 
          : `\nDISPUTED FACTS:\n`;
        facts.disputed_facts.forEach((fact, i) => {
          formatted += `${i + 1}. ${fact.topic}\n`;
          formatted += `   - P1: ${fact.p1_version}\n`;
          formatted += `   - P2: ${fact.p2_version}\n`;
        });
      }
      
      if (facts.documented_evidence?.length > 0) {
        formatted += isPortuguese 
          ? `\nEVIDÊNCIA DOCUMENTADA:\n` 
          : `\nDOCUMENTED EVIDENCE:\n`;
        facts.documented_evidence.forEach((ev, i) => {
          formatted += `${i + 1}. ${ev}\n`;
        });
      }
      
      formatted += isPortuguese 
        ? `\nRESULTADO DESEJADO POR P1: ${facts.p1_desired_outcome || 'Não especificado'}\n`
        : `\nP1 DESIRED OUTCOME: ${facts.p1_desired_outcome || 'Not specified'}\n`;
      formatted += isPortuguese 
        ? `RESULTADO DESEJADO POR P2: ${facts.p2_desired_outcome || 'Não especificado'}\n`
        : `P2 DESIRED OUTCOME: ${facts.p2_desired_outcome || 'Not specified'}\n`;
      
      return formatted;
    };

    const userPrompt = isPortuguese
      ? `IMPORTANTE: Escreva toda a justificação e listas de comportamentos em português. Use apenas os códigos de veredicto em inglês (p1_right, p1_more_right, etc).
${participantContextSection}
Analise este REGISTRO FACTUAL SANITIZADO (tom e emoções já removidos) e forneça seu julgamento baseado APENAS nos fatos:

${formatSanitizedFacts(sanitizedFacts)}${attachmentContents}

LEMBRETE: Não penalize nenhum participante por parecer assertivo ou confiante. Julgue apenas a correção factual e obrigações éticas/legais.

Retorne JSON com esta estrutura EXATA:
{
  "verdict": "um de: p1_right, p1_more_right, both_right, neither_right, p2_more_right, p2_right",
  "p1_correct_behaviors": ["comportamento factualmente correto 1", "comportamento factualmente correto 2"],
  "p1_wrong_behaviors": ["comportamento factualmente incorreto 1", "comportamento factualmente incorreto 2"],
  "p2_correct_behaviors": ["comportamento factualmente correto 1", "comportamento factualmente correto 2"],
  "p2_wrong_behaviors": ["comportamento factualmente incorreto 1", "comportamento factualmente incorreto 2"],
  "justification": "Explicação abrangente de 2-3 parágrafos do seu veredicto, focando em FATOS e OBRIGAÇÕES, não em tom ou apresentação"
}`
      : `${participantContextSection}
Analyze this SANITIZED FACTUAL RECORD (tone and emotions already removed) and provide your judgment based ONLY on the facts:

${formatSanitizedFacts(sanitizedFacts)}${attachmentContents}

REMINDER: Do not penalize any participant for seeming assertive or confident. Judge only factual correctness and ethical/legal obligations.

Return JSON with this EXACT structure:
{
  "verdict": "one of: p1_right, p1_more_right, both_right, neither_right, p2_more_right, p2_right",
  "p1_correct_behaviors": ["factually correct behavior 1", "factually correct behavior 2"],
  "p1_wrong_behaviors": ["factually incorrect behavior 1", "factually incorrect behavior 2"],
  "p2_correct_behaviors": ["factually correct behavior 1", "factually correct behavior 2"],
  "p2_wrong_behaviors": ["factually incorrect behavior 1", "factually incorrect behavior 2"],
  "justification": "2-3 paragraph comprehensive explanation of your verdict, focusing on FACTS and OBLIGATIONS, not tone or presentation"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.4, images, 6000); // Low temperature for consistent verdicts, 6000 tokens for comprehensive judgment
      const parsed = JSON.parse(response.trim());
      
      // Validate verdict is one of the 6 allowed values
      const validVerdicts = ['p1_right', 'p1_more_right', 'both_right', 'neither_right', 'p2_more_right', 'p2_right'];
      if (!validVerdicts.includes(parsed.verdict)) {
        console.warn(`Invalid verdict received: ${parsed.verdict}, defaulting to neither_right`);
        parsed.verdict = 'neither_right';
      }
      
      // Include sanitized facts in response for transparency
      parsed.sanitizedFacts = sanitizedFacts;
      
      return parsed;
    } catch (error) {
      console.error('Error generating scale judgment:', error);
      const fallbackMsg = isPortuguese
        ? 'Não foi possível gerar julgamento devido a erro de processamento.'
        : 'Unable to generate judgment due to processing error.';
      return {
        verdict: 'neither_right',
        p1_correct_behaviors: [isPortuguese ? 'Não foi possível avaliar' : 'Unable to assess'],
        p1_wrong_behaviors: [isPortuguese ? 'Não foi possível avaliar' : 'Unable to assess'],
        p2_correct_behaviors: [isPortuguese ? 'Não foi possível avaliar' : 'Unable to assess'],
        p2_wrong_behaviors: [isPortuguese ? 'Não foi possível avaliar' : 'Unable to assess'],
        justification: fallbackMsg,
        sanitizedFacts: null
      };
    }
  }

  async generateP2SummaryForContext(p1Answers, p2Response, language, attachmentContents = '', images = []) {
    const isPortuguese = language === 'pt';
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE as imagens anexadas para extrair informacoes relevantes.' : ' ANALYZE attached images to extract relevant information.')
      : '';
    const systemPrompt = isPortuguese
      ? `Voce e um mediador neutro. RESPONDA INTEIRAMENTE EM PORTUGUES. Gere um resumo conciso da perspectiva e preocupacoes do Participante 2 para o Participante 1 revisar antes de adicionar contexto adicional. Se houver documentos anexados, inclua informacoes relevantes deles.${imageInstruction}`
      : `You are a neutral mediator. RESPOND ENTIRELY IN ENGLISH. Generate a concise summary of Participant 2's perspective and concerns for Participant 1 to review before adding additional context. If there are attached documents, include relevant information from them.${imageInstruction}`;

    const userPrompt = isPortuguese
      ? `IMPORTANTE: Escreva em portugues.

Com base no seguinte, crie um resumo neutro da perspectiva do Participante 2:

Perspectiva Inicial do PARTICIPANTE 1:
- O que aconteceu: ${p1Answers.what_happened}
- O que levou a isso: ${p1Answers.what_led_to_it}
- Como isso os fez sentir: ${p1Answers.how_it_made_them_feel}
- Resultado desejado: ${p1Answers.desired_outcome}

Resposta do PARTICIPANTE 2:
${p2Response.response_type === 'dispute_text' ? `- Sua resposta: ${p2Response.dispute_text}` : `- O que aconteceu: ${p2Response.what_happened}
- O que levou a isso: ${p2Response.what_led_to_it}
- Como isso os fez sentir: ${p2Response.how_it_made_them_feel}
- Resultado desejado: ${p2Response.desired_outcome}`}${attachmentContents}

Forneca um resumo de 2-3 paragrafos que capture a perspectiva, preocupacoes e como o Participante 2 ve a situacao. Se houver documentos anexados, mencione fatos relevantes.`
      : `Based on the following, create a neutral summary of Participant 2's perspective:

PARTICIPANT 1's Initial Perspective:
- What happened: ${p1Answers.what_happened}
- What led to it: ${p1Answers.what_led_to_it}
- How it made them feel: ${p1Answers.how_it_made_them_feel}
- Desired outcome: ${p1Answers.desired_outcome}

PARTICIPANT 2's Response:
${p2Response.response_type === 'dispute_text' ? `- Their response: ${p2Response.dispute_text}` : `- What happened: ${p2Response.what_happened}
- What led to it: ${p2Response.what_led_to_it}
- How it made them feel: ${p2Response.how_it_made_them_feel}
- Desired outcome: ${p2Response.desired_outcome}`}${attachmentContents}

Provide a 2-3 paragraph summary that captures Participant 2's perspective, concerns, and how they view the situation. If there are attached documents, mention relevant facts from them.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.7, images);
      return response.trim();
    } catch (error) {
      console.error('Error generating P2 summary for context:', error);
      const fallback = isPortuguese
        ? 'Nao foi possivel gerar o resumo. Por favor, revise os pontos-chave de disputa acima.'
        : 'Unable to generate summary. Please review the key dispute points above.';
      return fallback;
    }
  }

  async generateContextSummary(contextText, participantNumber, language, attachmentContents = '', images = []) {
    const isPortuguese = language === 'pt';
    const participantLabel = participantNumber === 1 ? 'Participant 1' : 'Participant 2';
    const participantLabelPT = participantNumber === 1 ? 'Participante 1' : 'Participante 2';
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE as imagens anexadas para extrair informacoes relevantes.' : ' ANALYZE attached images to extract relevant information.')
      : '';
    
    const systemPrompt = isPortuguese
      ? `Voce e um mediador neutro. RESPONDA INTEIRAMENTE EM PORTUGUES. Resuma o contexto adicional fornecido pelo ${participantLabelPT} de forma clara e neutra. Se houver documentos anexados, inclua informacoes relevantes deles.${imageInstruction}`
      : `You are a neutral mediator. RESPOND ENTIRELY IN ENGLISH. Summarize the additional context provided by ${participantLabel} in a clear, neutral way. If there are attached documents, include relevant information from them.${imageInstruction}`;

    const userPrompt = isPortuguese
      ? `IMPORTANTE: Escreva em portugues.

${participantLabelPT} forneceu o seguinte contexto adicional:

"${contextText}"${attachmentContents}

Crie um resumo neutro de 1-2 paragrafos deste contexto adicional que destaque os pontos-chave. Se houver documentos anexados, mencione fatos relevantes.`
      : `${participantLabel} provided the following additional context:

"${contextText}"${attachmentContents}

Create a 1-2 paragraph neutral summary of this additional context that highlights the key points. If there are attached documents, mention relevant facts from them.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.7, images);
      return response.trim();
    } catch (error) {
      console.error('Error generating context summary:', error);
      return contextText; // Fallback to raw text if AI fails
    }
  }

  // Advanced workflow: Generate fact list for both participants to verify
  async generateFactList(p1Answers, p2Response, attachmentDescriptions, language, p1Context = null, p2Context = null, attachmentContents = '', images = []) {
    const isPortuguese = language === 'pt';
    const hasImages = images && images.length > 0;
    const imageInstruction = hasImages 
      ? (isPortuguese ? ' ANALISE CUIDADOSAMENTE as imagens anexadas para extrair fatos verificaveis como numeros, datas, valores e outras informacoes relevantes.' : ' CAREFULLY ANALYZE attached images to extract verifiable facts such as numbers, dates, values, and other relevant information.')
      : '';
    
    const systemPrompt = isPortuguese
      ? `Voce e um mediador neutro extraindo fatos declarados. RESPONDA INTEIRAMENTE EM PORTUGUES (exceto os valores de 'source' que devem permanecer em ingles).

Sua tarefa e identificar fatos especificos declarados por cada participante que possam ser verificados ou disputados. NAO adicione interpretacoes - apenas fatos declarados.

IMPORTANTE SOBRE ANEXOS:
- Documentos/imagens anexados por Participant 1 devem gerar fatos com source="p1"
- Documentos/imagens anexados por Participant 2 devem gerar fatos com source="p2"
- Extraia fatos relevantes como numeros, datas, valores e outras informacoes verificaveis dos anexos
- Os anexos indicam "from Participant X" - use isso para determinar a source correta${imageInstruction}`
      : `You are a neutral mediator extracting stated facts. RESPOND ENTIRELY IN ENGLISH.

Your task is to identify specific facts stated by each participant that can be verified or disputed. Do NOT add interpretations - only stated facts.

IMPORTANT ABOUT ATTACHMENTS:
- Documents/images attached by Participant 1 should generate facts with source="p1"
- Documents/images attached by Participant 2 should generate facts with source="p2"
- Extract relevant facts such as numbers, dates, values, and other verifiable information from attachments
- Attachments indicate "from Participant X" - use this to determine the correct source${imageInstruction}`;

    const attachmentInfo = attachmentDescriptions && attachmentDescriptions.length > 0
      ? `\n\nAttachments/Evidence provided:\n${attachmentDescriptions.join('\n')}`
      : '';

    // Add additional context if available
    const p1ContextInfo = p1Context ? `\n- Additional context: ${p1Context}` : '';
    const p2ContextInfo = p2Context ? `\n- Additional context: ${p2Context}` : '';

    const userPrompt = isPortuguese
      ? `Analise estas perspectivas e extraia 5-10 fatos especificos que foram declarados. Cada fato deve ser uma declaracao clara que o outro participante pode concordar ou discordar.

PARTICIPANTE 1:
- O que aconteceu: ${p1Answers.what_happened}
- O que levou a isso: ${p1Answers.what_led_to_it}
- Como isso os fez sentir: ${p1Answers.how_it_made_them_feel}
- Resultado desejado: ${p1Answers.desired_outcome}${p1ContextInfo}

PARTICIPANTE 2:
${p2Response.response_type === 'dispute_text' ? `- Resposta: ${p2Response.dispute_text}` : `- O que aconteceu: ${p2Response.what_happened}
- O que levou a isso: ${p2Response.what_led_to_it}
- Como isso os fez sentir: ${p2Response.how_it_made_them_feel}
- Resultado desejado: ${p2Response.desired_outcome}`}${p2ContextInfo}${attachmentInfo}${attachmentContents}

Retorne JSON:
{
  "facts": [
    {"id": 1, "statement": "declaracao do fato", "source": "p1" ou "p2" ou "both"},
    {"id": 2, "statement": "declaracao do fato", "source": "p1" ou "p2" ou "both"}
  ]
}`
      : `Analyze these perspectives and extract 5-10 specific facts that were stated. Each fact should be a clear statement that the other participant can agree or disagree with.

PARTICIPANT 1:
- What happened: ${p1Answers.what_happened}
- What led to it: ${p1Answers.what_led_to_it}
- How it made them feel: ${p1Answers.how_it_made_them_feel}
- Desired outcome: ${p1Answers.desired_outcome}${p1ContextInfo}

PARTICIPANT 2:
${p2Response.response_type === 'dispute_text' ? `- Response: ${p2Response.dispute_text}` : `- What happened: ${p2Response.what_happened}
- What led to it: ${p2Response.what_led_to_it}
- How it made them feel: ${p2Response.how_it_made_them_feel}
- Desired outcome: ${p2Response.desired_outcome}`}${p2ContextInfo}${attachmentInfo}${attachmentContents}

Return JSON:
{
  "facts": [
    {"id": 1, "statement": "fact statement", "source": "p1" or "p2" or "both"},
    {"id": 2, "statement": "fact statement", "source": "p1" or "p2" or "both"}
  ]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.7, images);
      const parsed = JSON.parse(response.trim());
      return parsed.facts || [];
    } catch (error) {
      console.error('Error generating fact list:', error);
      const fallbackFact = isPortuguese
        ? 'Nao foi possivel extrair fatos especificos das respostas.'
        : 'Unable to extract specific facts from the responses.';
      return [{ id: 1, statement: fallbackFact, source: 'both' }];
    }
  }

  /**
   * Analyzes and extracts participant context (identities, relationships) from text.
   * This is used internally to improve judgment quality.
   * @param {Object} existingContext - Previous context analysis (null for first call)
   * @param {Object} newInput - New text input to analyze
   * @param {string} stage - Current stage ('p1_answers', 'p2_response', 'p1_context', 'p2_context')
   * @returns {Object} Updated context with participant identities and confidence scores
   */
  async analyzeParticipantContext(existingContext, newInput, stage) {
    const systemPrompt = `You are an expert analyst identifying participant identities and relationships from mediation text.
Your task is to deduce WHO each participant is (e.g., husband, wife, employee, manager, neighbor, friend, parent, child, etc.) and their RELATIONSHIP.

IMPORTANT RULES:
- Extract ONLY what can be reasonably inferred from the text
- Assign confidence scores (0.0 to 1.0) for each deduction
- If evidence is weak or contradictory, use low confidence scores
- Consider pronouns, relationship terms, and context clues
- Update your previous analysis if new information confirms or contradicts it`;

    const existingInfo = existingContext ? `
PREVIOUS ANALYSIS TO VALIDATE/UPDATE:
- P1 identity: ${existingContext.p1?.identity || 'unknown'} (confidence: ${existingContext.p1?.confidence || 0})
- P2 identity: ${existingContext.p2?.identity || 'unknown'} (confidence: ${existingContext.p2?.confidence || 0})
- Relationship: ${existingContext.relationship?.type || 'unknown'} - ${existingContext.relationship?.details || ''} (confidence: ${existingContext.relationship?.confidence || 0})
- Previous clues: ${(existingContext.clues || []).join(', ')}
` : '';

    let inputText = '';
    if (stage === 'p1_answers') {
      inputText = `P1 INITIAL ANSWERS:
- What happened: ${newInput.what_happened}
- What led to it: ${newInput.what_led_to_it}
- How it made them feel: ${newInput.how_it_made_them_feel}
- Desired outcome: ${newInput.desired_outcome}`;
    } else if (stage === 'p2_response') {
      inputText = newInput.response_type === 'dispute_text' 
        ? `P2 RESPONSE:\n- Dispute: ${newInput.dispute_text}`
        : `P2 RESPONSE:
- What happened: ${newInput.what_happened}
- What led to it: ${newInput.what_led_to_it}
- How it made them feel: ${newInput.how_it_made_them_feel}
- Desired outcome: ${newInput.desired_outcome}`;
    } else if (stage === 'p1_context' || stage === 'p2_context') {
      const pNum = stage === 'p1_context' ? 'P1' : 'P2';
      inputText = `${pNum} ADDITIONAL CONTEXT:\n${newInput}`;
    }

    const userPrompt = `${existingInfo}
NEW INPUT FROM STAGE "${stage}":
${inputText}

Analyze and return JSON with this EXACT structure:
{
  "p1": {
    "identity": "role/relationship term (e.g., 'wife', 'employee', 'neighbor')",
    "confidence": 0.0-1.0
  },
  "p2": {
    "identity": "role/relationship term (e.g., 'husband', 'manager', 'neighbor')",
    "confidence": 0.0-1.0
  },
  "relationship": {
    "type": "relationship type (e.g., 'married couple', 'workplace', 'neighbors', 'family')",
    "details": "brief description of context (e.g., 'married couple with infant')",
    "confidence": 0.0-1.0
  },
  "clues": ["list of text clues that led to these conclusions"]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.3);
      const parsed = JSON.parse(response.trim());
      
      // Validate and normalize confidence scores
      if (parsed.p1) parsed.p1.confidence = Math.min(1, Math.max(0, parseFloat(parsed.p1.confidence) || 0));
      if (parsed.p2) parsed.p2.confidence = Math.min(1, Math.max(0, parseFloat(parsed.p2.confidence) || 0));
      if (parsed.relationship) parsed.relationship.confidence = Math.min(1, Math.max(0, parseFloat(parsed.relationship.confidence) || 0));
      
      // Add timestamp
      parsed.lastUpdated = Date.now();
      parsed.lastStage = stage;
      
      return parsed;
    } catch (error) {
      console.error('Error analyzing participant context:', error);
      // Return existing context or minimal fallback
      return existingContext || {
        p1: { identity: 'unknown', confidence: 0 },
        p2: { identity: 'unknown', confidence: 0 },
        relationship: { type: 'unknown', details: '', confidence: 0 },
        clues: [],
        lastUpdated: Date.now(),
        lastStage: stage
      };
    }
  }

  /**
   * STEP 1 OF 2-STEP JUDGMENT: Sanitize facts by removing tone and emotional language
   * This creates a neutral factual record for objective judgment
   * @param {Object} sessionData - The session data containing all answers and responses
   * @param {string} language - Language code ('en' or 'pt')
   * @param {Array} images - Optional images array
   * @returns {Object} Sanitized factual record
   */
  async sanitizeFactsForJudgment(sessionData, language, images = []) {
    const isPortuguese = language === 'pt';
    
    const systemPrompt = isPortuguese
      ? `Você é um analista forense extraindo APENAS fatos objetivos e verificáveis de narrativas de disputa. RESPONDA INTEIRAMENTE EM PORTUGUÊS.

Sua tarefa: Remover TODAS as interpretações subjetivas, linguagem emocional e marcadores de tom. Preservar APENAS:
- Afirmações verificáveis (datas, valores, ações tomadas)
- Referências a evidências documentadas
- Declarações factuais com as quais ambas as partes concordam
- Afirmações factuais conflitantes (declare ambas as versões de forma neutra)

REMOVER COMPLETAMENTE:
- "Sente-se como", "parece", "desdenhoso", "respeitoso", etc.
- Julgamentos sobre atitude ou tom
- Intenções inferidas ("tentando controlar", "não se importa")
- Enquadramento emocional
- Linguagem assertiva ou agressiva
- Expressões de frustração ou raiva
- Caracterizações de personalidade

NEUTRALIZAR frases como:
- "Eu deveria decidir" → "P1 acredita que deveria ter autoridade de decisão"
- "Ela sempre ignora" → "P1 afirma que suas opiniões não são consideradas"
- "Ele é controlador" → "P2 afirma que P1 toma decisões unilateralmente"

Saída: Registro factual puro SEM comentário editorial.`
      : `You are a forensic analyst extracting ONLY objective, verifiable facts from dispute narratives. RESPOND ENTIRELY IN ENGLISH.

Your task: Remove ALL subjective interpretations, emotional language, and tone markers. Preserve ONLY:
- Verifiable claims (dates, amounts, actions taken)
- Documented evidence references
- Factual statements both parties agree on
- Conflicting factual claims (state both versions neutrally)

STRIP OUT COMPLETELY:
- "Feels like", "seems", "dismissive", "respectful", etc.
- Judgments about attitude or tone
- Inferred intentions ("trying to control", "doesn't care")
- Emotional framing
- Assertive or aggressive language
- Expressions of frustration or anger
- Personality characterizations

NEUTRALIZE phrases like:
- "I should decide" → "P1 believes they should have decision-making authority"
- "She always ignores" → "P1 claims their opinions are not considered"
- "He is controlling" → "P2 claims P1 makes unilateral decisions"

Output: Pure factual record with NO editorial commentary.`;

    const p1 = sessionData.p1Answers;
    const p2 = sessionData.p2Response;
    const p1Context = sessionData.p1Context || '';
    const p2Context = sessionData.p2Context || '';
    const attachmentContents = sessionData.attachmentContents || '';
    const factList = sessionData.factList || [];
    const factVerifications = sessionData.factVerifications || { p1: {}, p2: {} };

    // Build fact verification summary if available
    // IMPORTANT: P1 verifies P2's facts (source='p2' or 'both'), P2 verifies P1's facts (source='p1' or 'both')
    // The verifications are indexed by the FILTERED list position, not the full list position
    let factVerificationSection = '';
    if (factList.length > 0) {
      factVerificationSection = isPortuguese
        ? '\n\nVERIFICAÇÃO DE FATOS (cada participante verificou os fatos alegados pelo outro):'
        : '\n\nFACT VERIFICATION RESULTS (each participant verified facts claimed by the other):';
      
      // P1 verified facts from P2 (source = 'p2' or 'both')
      const p1VerifiableFacts = factList.filter(f => f.source === 'p2' || f.source === 'both');
      // P2 verified facts from P1 (source = 'p1' or 'both')
      const p2VerifiableFacts = factList.filter(f => f.source === 'p1' || f.source === 'both');
      
      factList.forEach((fact, originalIndex) => {
        factVerificationSection += `\n${originalIndex + 1}. "${fact.statement}" (${isPortuguese ? 'alegado por' : 'claimed by'}: ${fact.source === 'p1' ? 'P1' : fact.source === 'p2' ? 'P2' : isPortuguese ? 'ambos' : 'both'})`;
        
        // Find P1's verification using their filtered list index
        if (fact.source === 'p2' || fact.source === 'both') {
          const p1FilteredIndex = p1VerifiableFacts.findIndex(f => f.id === fact.id);
          if (p1FilteredIndex !== -1 && factVerifications.p1?.[p1FilteredIndex]) {
            const p1v = factVerifications.p1[p1FilteredIndex];
            factVerificationSection += `\n   - P1 ${isPortuguese ? 'verificação' : 'verification'}: ${p1v.status}${p1v.comment ? ` - "${p1v.comment}"` : ''}`;
          }
        }
        
        // Find P2's verification using their filtered list index
        if (fact.source === 'p1' || fact.source === 'both') {
          const p2FilteredIndex = p2VerifiableFacts.findIndex(f => f.id === fact.id);
          if (p2FilteredIndex !== -1 && factVerifications.p2?.[p2FilteredIndex]) {
            const p2v = factVerifications.p2[p2FilteredIndex];
            factVerificationSection += `\n   - P2 ${isPortuguese ? 'verificação' : 'verification'}: ${p2v.status}${p2v.comment ? ` - "${p2v.comment}"` : ''}`;
          }
        }
      });
      
      factVerificationSection += isPortuguese
        ? '\n\nIMPORTANTE: Os comentários de verificação acima contêm informações CRUCIAIS que devem ser consideradas no julgamento. Eles representam as objeções e esclarecimentos de cada participante sobre os fatos alegados.'
        : '\n\nIMPORTANT: The verification comments above contain CRUCIAL information that must be considered in the judgment. They represent each participant\'s objections and clarifications about the alleged facts.';
    }

    const userPrompt = isPortuguese
      ? `Analise as seguintes perspectivas e crie um REGISTRO FACTUAL SANITIZADO.

PARTICIPANTE 1 Respostas:
- O que aconteceu: ${p1.what_happened}
- O que levou a isso: ${p1.what_led_to_it}
- Como isso os fez sentir: ${p1.how_it_made_them_feel}
- Resultado desejado: ${p1.desired_outcome}
${p1Context ? `- Contexto adicional: ${p1Context}` : ''}

PARTICIPANTE 2 Resposta:
${p2.response_type === 'dispute_text' ? `- Disputa: ${p2.dispute_text}` : `- O que aconteceu: ${p2.what_happened}
- O que levou a isso: ${p2.what_led_to_it}
- Como isso os fez sentir: ${p2.how_it_made_them_feel}
- Resultado desejado: ${p2.desired_outcome}`}
${p2Context ? `- Contexto adicional: ${p2Context}` : ''}${factVerificationSection}${attachmentContents}

Retorne JSON com esta estrutura:
{
  "p1_factual_claims": ["afirmação factual neutra 1", "afirmação factual neutra 2"],
  "p2_factual_claims": ["afirmação factual neutra 1", "afirmação factual neutra 2"],
  "agreed_facts": ["fatos com os quais ambos concordam"],
  "disputed_facts": [
    {"topic": "tópico", "p1_version": "versão de P1", "p2_version": "versão de P2"}
  ],
  "documented_evidence": ["evidência de anexos"],
  "p1_desired_outcome": "resultado desejado neutralizado",
  "p2_desired_outcome": "resultado desejado neutralizado"
}`
      : `Analyze the following perspectives and create a SANITIZED FACTUAL RECORD.

PARTICIPANT 1 Answers:
- What happened: ${p1.what_happened}
- What led to it: ${p1.what_led_to_it}
- How it made them feel: ${p1.how_it_made_them_feel}
- Desired outcome: ${p1.desired_outcome}
${p1Context ? `- Additional context: ${p1Context}` : ''}

PARTICIPANT 2 Response:
${p2.response_type === 'dispute_text' ? `- Dispute: ${p2.dispute_text}` : `- What happened: ${p2.what_happened}
- What led to it: ${p2.what_led_to_it}
- How it made them feel: ${p2.how_it_made_them_feel}
- Desired outcome: ${p2.desired_outcome}`}
${p2Context ? `- Additional context: ${p2Context}` : ''}${factVerificationSection}${attachmentContents}

Return JSON with this structure:
{
  "p1_factual_claims": ["neutral factual statement 1", "neutral factual statement 2"],
  "p2_factual_claims": ["neutral factual statement 1", "neutral factual statement 2"],
  "agreed_facts": ["facts both parties agree on"],
  "disputed_facts": [
    {"topic": "topic", "p1_version": "P1's version", "p2_version": "P2's version"}
  ],
  "documented_evidence": ["evidence from attachments"],
  "p1_desired_outcome": "neutralized desired outcome",
  "p2_desired_outcome": "neutralized desired outcome"
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      const response = await this.llm.generateCompletion(messages, 0.3, images, 6000); // Low temperature for consistency, 6000 tokens for comprehensive analysis
      const parsed = JSON.parse(response.trim());
      return parsed;
    } catch (error) {
      console.error('Error sanitizing facts for judgment:', error);
      // Return minimal structure on error
      return {
        p1_factual_claims: [],
        p2_factual_claims: [],
        agreed_facts: [],
        disputed_facts: [],
        documented_evidence: [],
        p1_desired_outcome: sessionData.p1Answers?.desired_outcome || '',
        p2_desired_outcome: sessionData.p2Response?.desired_outcome || ''
      };
    }
  }

  /**
   * Formats participant context for injection into judgment prompt
   * @param {Object} context - The participant context object
   * @returns {string} Formatted context string for prompt
   */
  formatContextForJudgment(context) {
    if (!context || (!context.p1?.identity && !context.p2?.identity)) {
      return '';
    }

    const formatIdentity = (p, label) => {
      if (!p || !p.identity || p.identity === 'unknown') return `${label}: Unknown`;
      const marker = p.confidence < 0.5 ? '?' : '';
      return `${label}: ${p.identity}${marker} (${Math.round(p.confidence * 100)}%)`;
    };

    const formatRelationship = (rel) => {
      if (!rel || !rel.type || rel.type === 'unknown') return 'Relationship: Unknown';
      const marker = rel.confidence < 0.5 ? '?' : '';
      const details = rel.details ? ` - ${rel.details}` : '';
      return `Relationship: ${rel.type}${marker}${details} (${Math.round(rel.confidence * 100)}%)`;
    };

    return `
[INTERNAL CONTEXT - Use this to better understand the parties involved]
${formatIdentity(context.p1, 'P1')}
${formatIdentity(context.p2, 'P2')}
${formatRelationship(context.relationship)}
Key clues: ${(context.clues || []).slice(0, 5).join(', ')}
`;
  }
}

module.exports = MediationAI;


