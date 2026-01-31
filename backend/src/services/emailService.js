const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configure SMTP transporter using environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Test the connection
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('Email transporter error:', error);
      } else {
        console.log('Email transporter ready to send messages');
      }
    });
  }

  async sendEmail(to, subject, htmlContent, textContent = '') {
    try {
      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: to,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { 
        success: false, 
        error: error.message,
        to: to,
        subject: subject
      };
    }
  }

  async sendSessionInvitation(participantEmail, sessionId, p2Token) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const sessionLink = `${baseUrl}/session/${sessionId}/${p2Token}`;
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0056b3;">You've been invited to a mediation session</h2>
            <p>Hello,</p>
            <p>You've been invited to participate in a mediation session through IntermediAItor.</p>
            <p>Click the link below to join the session:</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <a href="${sessionLink}" 
                 style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Join Mediation Session
              </a>
            </div>
            
            <p>This session will help resolve your conflict with the assistance of AI.</p>
            <p>Important: This link is unique to you and should not be shared with others.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      You've been invited to a mediation session through IntermediAItor.
      
      Click the link below to join:
      ${sessionLink}
      
      This session will help resolve your conflict with the assistance of AI.
      Important: This link is unique to you and should not be shared with others.
      
      This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.
    `;
    
    return await this.sendEmail(participantEmail, 'You\'ve been invited to a mediation session', htmlContent, textContent);
  }

  async sendResponseNotification(participantEmail, sessionId, participantNumber) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const sessionLink = `${baseUrl}/session/${sessionId}`;
    
    let subject, htmlContent, textContent;
    
    if (participantNumber === 1) {
      subject = 'Participant 2 has responded to your mediation request';
      htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0056b3;">Participant 2 has responded</h2>
              <p>Hello,</p>
              <p>Participant 2 has completed their response to your mediation request in session ${sessionId}.</p>
              <p>You can now add additional context and help the AI reach a resolution.</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <a href="${sessionLink}" 
                   style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Session
                </a>
              </div>
              
              <p>Thank you for participating in IntermediAItor.</p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="font-size: 12px; color: #666;">This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.</p>
            </div>
          </body>
        </html>
      `;
      
      textContent = `
        Participant 2 has responded to your mediation request.
        
        You can now add additional context and help the AI reach a resolution.
        
        View session: ${sessionLink}
        
        Thank you for participating in IntermediAItor.
        
        This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.
      `;
    } else {
      subject = 'Participant 1 has added context to your mediation';
      htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #0056b3;">Participant 1 has added context</h2>
              <p>Hello,</p>
              <p>Participant 1 has provided additional context to your mediation request in session ${sessionId}.</p>
              <p>You can now add your own context and help the AI reach a resolution.</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <a href="${sessionLink}" 
                   style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Session
                </a>
              </div>
              
              <p>Thank you for participating in IntermediAItor.</p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="font-size: 12px; color: #666;">This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.</p>
            </div>
          </body>
        </html>
      `;
      
      textContent = `
        Participant 1 has added context to your mediation.
        
        You can now add your own context and help the AI reach a resolution.
        
        View session: ${sessionLink}
        
        Thank you for participating in IntermediAItor.
        
        This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.
      `;
    }
    
    return await this.sendEmail(participantEmail, subject, htmlContent, textContent);
  }

  async sendJudgmentReadyNotification(participantEmail, sessionId) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const judgmentLink = `${baseUrl}/judgment/${sessionId}`;
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #0056b3;">Judgment is ready</h2>
            <p>Hello,</p>
            <p>The AI has completed its analysis of your mediation session ${sessionId} and the judgment is now available.</p>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <a href="${judgmentLink}" 
                 style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Judgment
              </a>
            </div>
            
            <p>The AI has analyzed all information provided by both participants and generated a comprehensive judgment.</p>
            <p>Thank you for participating in IntermediAItor.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      Judgment is ready for your mediation session.
      
      The AI has completed its analysis of your mediation session ${sessionId} and the judgment is now available.
      
      View judgment: ${judgmentLink}
      
      The AI has analyzed all information provided by both participants and generated a comprehensive judgment.
      
      Thank you for participating in IntermediAItor.
      
      This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.
    `;
    
    return await this.sendEmail(participantEmail, 'Judgment is ready for your mediation session', htmlContent, textContent);
  }

  async sendSessionRejectedNotification(participantEmail, sessionId) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const sessionLink = `${baseUrl}/session/${sessionId}`;
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #d9534f;">Mediation session declined</h2>
            <p>Hello,</p>
            <p>The mediation session ${sessionId} has been declined by the other participant.</p>
            
            <div style="background-color: #fdf2f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <a href="${sessionLink}" 
                 style="display: inline-block; background-color: #d9534f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Session Details
              </a>
            </div>
            
            <p>The other participant has chosen not to continue with this mediation.</p>
            <p>You can start a new session if you'd like to attempt resolution again.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      Mediation session declined.
      
      The mediation session ${sessionId} has been declined by the other participant.
      
      View session details: ${sessionLink}
      
      The other participant has chosen not to continue with this mediation.
      You can start a new session if you'd like to attempt resolution again.
      
      This email was sent by IntermediAItor. If you did not request this mediation, please ignore this message.
    `;
    
    return await this.sendEmail(participantEmail, 'Mediation session declined', htmlContent, textContent);
  }
}

module.exports = new EmailService();