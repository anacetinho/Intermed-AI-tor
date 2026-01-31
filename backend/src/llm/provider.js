const axios = require('axios');

// Helper to strip markdown code blocks from LLM responses
function stripMarkdownCodeBlocks(text) {
  if (!text) return text;
  // Remove ```json ... ``` or ``` ... ``` wrappers
  let cleaned = text.trim();
  // Match ```json or ``` at start and ``` at end
  const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  return cleaned;
}

class LLMProvider {
  constructor(provider, apiKey, baseURL, model) {
    // Normalize provider to lowercase to handle case-insensitive input
    this.provider = provider ? provider.toLowerCase() : provider;
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.model = model;
  }

  // Main completion method - now supports images for vision models and custom max_tokens
  async generateCompletion(messages, temperature = 0.7, images = [], maxTokens = 2000) {
    switch (this.provider) {
      case 'openai':
      case 'lmstudio':
        return this.openAICompatible(messages, temperature, images, maxTokens);
      case 'claude':
        return this.claudeCompletion(messages, temperature, images, maxTokens);
      case 'gemini':
        return this.geminiCompletion(messages, temperature, images, maxTokens);
      default:
        throw new Error(`Unsupported LLM provider: ${this.provider}`);
    }
  }

  async openAICompatible(messages, temperature, images = [], maxTokens = 2000) {
    try {
      // Convert messages to support vision if images provided
      let processedMessages = messages;
      if (images && images.length > 0) {
        processedMessages = this.convertMessagesForOpenAIVision(messages, images);
      }
      
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: processedMessages,
          temperature: temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      return stripMarkdownCodeBlocks(response.data.choices[0].message.content);
    } catch (error) {
      console.error('OpenAI-compatible API error:', error.response?.data || error.message);
      throw new Error('Failed to get LLM response');
    }
  }

  // Convert messages to OpenAI vision format with images
  convertMessagesForOpenAIVision(messages, images) {
    return messages.map(msg => {
      if (msg.role === 'user') {
        // Build content array with text and images
        const content = [{ type: 'text', text: msg.content }];
        
        // Add images to the user message
        for (const img of images) {
          content.push({
            type: 'image_url',
            image_url: {
              url: `data:${img.mimeType};base64,${img.base64}`,
              detail: 'auto'
            }
          });
        }
        
        return { role: msg.role, content };
      }
      return msg;
    });
  }

  async claudeCompletion(messages, temperature, images = [], maxTokens = 2000) {
    try {
      // Claude uses a different format - system message separate
      const systemMessage = messages.find(m => m.role === 'system');
      let conversationMessages = messages.filter(m => m.role !== 'system');

      // Convert messages to support vision if images provided
      if (images && images.length > 0) {
        conversationMessages = this.convertMessagesForClaudeVision(conversationMessages, images);
      }

      const response = await axios.post(
        `${this.baseURL}/messages`,
        {
          model: this.model,
          max_tokens: maxTokens,
          temperature: temperature,
          system: systemMessage?.content || '',
          messages: conversationMessages
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );
      return stripMarkdownCodeBlocks(response.data.content[0].text);
    } catch (error) {
      console.error('Claude API error:', error.response?.data || error.message);
      throw new Error('Failed to get LLM response');
    }
  }

  // Convert messages to Claude vision format with images
  convertMessagesForClaudeVision(messages, images) {
    return messages.map(msg => {
      if (msg.role === 'user') {
        const content = [{ type: 'text', text: msg.content }];
        
        for (const img of images) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType,
              data: img.base64
            }
          });
        }
        
        return { role: msg.role, content };
      }
      return msg;
    });
  }

  async geminiCompletion(messages, temperature, images = [], maxTokens = 2000) {
    try {
      // Gemini uses a different format - convert messages to parts
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      // Add system message as first user message if present
      const systemMessage = messages.find(m => m.role === 'system');
      if (systemMessage) {
        contents.unshift({
          role: 'user',
          parts: [{ text: `System instructions: ${systemMessage.content}` }]
        });
      }

      // Add images to the last user message for Gemini
      if (images && images.length > 0) {
        const lastUserIndex = contents.length - 1;
        for (let i = lastUserIndex; i >= 0; i--) {
          if (contents[i].role === 'user') {
            for (const img of images) {
              contents[i].parts.push({
                inline_data: {
                  mime_type: img.mimeType,
                  data: img.base64
                }
              });
            }
            break;
          }
        }
      }

      const response = await axios.post(
        `${this.baseURL}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          contents: contents,
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return stripMarkdownCodeBlocks(response.data.candidates[0].content.parts[0].text);
    } catch (error) {
      console.error('Gemini API error:', error.response?.data || error.message);
      throw new Error('Failed to get LLM response');
    }
  }
}

module.exports = LLMProvider;
