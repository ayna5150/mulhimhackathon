/**
 * Configuration management for SmartShield backend
 * 
 * This module centralizes all configuration settings including:
 * - Server configuration
 * - Database settings
 * - Model provider settings
 * - Security and privacy settings
 * - Detection thresholds
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  // Server configuration
  port: number;
  nodeEnv: string;
  baseUrl: string;
  
  // Database configuration
  databaseUrl: string;
  redisUrl: string;
  
  // Supabase configuration
  useSupabase: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceKey?: string;
  
  // Authentication
  jwtSecret: string;
  
  // Model provider configuration
  modelProvider: 'gemini' | 'openai' | 'local';
  modelName: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  
  // Extension configuration
  extensionBackendUrl: string;
  
  // Analytics and privacy
  retentionDays: number;
  privacyMode: boolean;
  piiRedaction: boolean;
  
  // Security and monitoring
  sentryDsn?: string;
  corsOrigins: string[];
  
  // Detection thresholds
  lowThreshold: number;
  highThreshold: number;
  reportThreshold: number;
  
  // Rate limiting
  rateLimitRequests: number;
  rateLimitWindow: number;
  
  // Prompt templates
  analysisPromptTemplate: string;
  chatPromptTemplate: string;
}

/**
 * Validate required environment variables
 */
function validateConfig(): void {
  const required = [
    'JWT_SECRET',
    'DATABASE_URL'
  ];

  // If using Supabase, validate Supabase-specific variables
  if (process.env.DATABASE_URL?.includes('supabase.co')) {
    required.push('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_KEY');
  }

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate model provider configuration
  const modelProvider = process.env.MODEL_PROVIDER as string;
  if (modelProvider && !['gemini', 'openai', 'local'].includes(modelProvider)) {
    throw new Error(`Invalid MODEL_PROVIDER: ${modelProvider}. Must be one of: gemini, openai, local`);
  }

  // Validate thresholds
  const lowThreshold = parseFloat(process.env.LOW_THRESHOLD || '0.3');
  const highThreshold = parseFloat(process.env.HIGH_THRESHOLD || '0.7');
  const reportThreshold = parseFloat(process.env.REPORT_THRESHOLD || '0.8');

  if (lowThreshold >= highThreshold || highThreshold >= reportThreshold) {
    throw new Error('Invalid thresholds: LOW_THRESHOLD < HIGH_THRESHOLD < REPORT_THRESHOLD');
  }
}

/**
 * Parse comma-separated CORS origins
 */
function parseCorsOrigins(origins: string): string[] {
  return origins.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Load and validate configuration
 */
export const config: Config = (() => {
  try {
    validateConfig();

    return {
      // Server configuration
      port: parseInt(process.env.PORT || '4000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      baseUrl: process.env.BASE_URL || 'http://localhost:4000',
      
      // Database configuration
      databaseUrl: process.env.DATABASE_URL!,
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      
      // Supabase configuration
      useSupabase: process.env.USE_SUPABASE === 'true',
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
      supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
      
      // Authentication
      jwtSecret: process.env.JWT_SECRET!,
      
      // Model provider configuration
      modelProvider: (process.env.MODEL_PROVIDER as 'gemini' | 'openai' | 'local') || 'gemini',
      modelName: process.env.MODEL_NAME || 'gemini-free',
      geminiApiKey: process.env.GEMINI_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      
      // Extension configuration
      extensionBackendUrl: process.env.EXTENSION_BACKEND_URL || 'http://localhost:4000',
      
      // Analytics and privacy
      retentionDays: parseInt(process.env.RETENTION_DAYS || '365', 10),
      privacyMode: process.env.PRIVACY_MODE !== 'false',
      piiRedaction: process.env.PII_REDACTION !== 'false',
      
      // Security and monitoring
      sentryDsn: process.env.SENTRY_DSN,
      corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:4000'),
      
      // Detection thresholds
      lowThreshold: parseFloat(process.env.LOW_THRESHOLD || '0.3'),
      highThreshold: parseFloat(process.env.HIGH_THRESHOLD || '0.7'),
      reportThreshold: parseFloat(process.env.REPORT_THRESHOLD || '0.8'),
      
      // Rate limiting
      rateLimitRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10),
      rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
      
      // Prompt templates
      analysisPromptTemplate: process.env.ANALYSIS_PROMPT_TEMPLATE || `You are a cybersecurity expert specializing in phishing detection. Analyze the following content and determine if it's a phishing attempt.

URL: {url}
Content: {content}

Please respond with a JSON object containing:
{
  "score": 0.0-1.0 (0 = definitely clean, 1 = definitely phishing),
  "label": "suspicious" | "clean" | "uncertain",
  "reasons": ["reason1", "reason2", ...],
  "explanation": "Brief explanation of the analysis",
  "confidence": 0.0-1.0
}

Look for common phishing indicators:
- Urgent language demanding immediate action
- Requests for sensitive information (passwords, SSN, credit cards)
- Suspicious URLs or domains
- Poor grammar/spelling
- Threats or consequences for not acting
- Impersonation of legitimate organizations
- Unusual formatting or styling
- Suspicious file attachments

Respond with ONLY the JSON object, no additional text.`,
      
      chatPromptTemplate: process.env.CHAT_PROMPT_TEMPLATE || `You are a helpful cybersecurity assistant. A user has flagged the following content as potentially suspicious and is asking for an explanation:

CONTEXT:
{context}

USER QUESTION: {question}

Please provide a clear, helpful explanation. If the content appears to be phishing, explain why and what the user should do. If it appears legitimate, explain why and provide reassurance.

Keep your response concise but informative (2-3 sentences max).`
    };
  } catch (error) {
    console.error('Configuration validation failed:', error);
    process.exit(1);
  }
})();

/**
 * Get model provider specific configuration
 */
export function getModelConfig(): { provider: string; apiKey?: string; modelName: string } {
  switch (config.modelProvider) {
    case 'gemini':
      return {
        provider: 'gemini',
        apiKey: config.geminiApiKey,
        modelName: config.modelName
      };
    case 'openai':
      return {
        provider: 'openai',
        apiKey: config.openaiApiKey,
        modelName: config.modelName
      };
    case 'local':
      return {
        provider: 'local',
        modelName: config.modelName
      };
    default:
      throw new Error(`Unsupported model provider: ${config.modelProvider}`);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugMode(): boolean {
  return config.nodeEnv === 'development' && process.env.DEBUG_MODE === 'true';
}

/**
 * Get detection threshold configuration
 */
export function getThresholds() {
  return {
    low: config.lowThreshold,
    high: config.highThreshold,
    report: config.reportThreshold
  };
}
