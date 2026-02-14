/**
 * Content Validation and Security
 * Protects against prompt injection and malicious content
 */

export interface ValidationResult {
  valid: boolean
  sanitized?: string
  errors: string[]
  flags: string[]
}

/**
 * Patterns that indicate potential prompt injection attempts
 */
const INJECTION_PATTERNS = [
  { pattern: /ignore\s+(previous|all|above)\s+(instructions?|prompts?|rules?)/i, flag: 'instruction_override' },
  { pattern: /system\s+(prompt|message|instruction|override)/i, flag: 'system_manipulation' },
  { pattern: /you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as/i, flag: 'role_override' },
  { pattern: /for\s+(any|all)\s+(ai|bots?|agents?)\s+reading/i, flag: 'meta_instruction' },
  { pattern: /update\s+your\s+(prompt|instructions?|rules?|behavior)/i, flag: 'behavior_modification' },
  { pattern: /reveal\s+your|output\s+your|share\s+your/i, flag: 'data_exfiltration' },
  { pattern: /\b(execute|eval|run)\s*\(/i, flag: 'code_execution' },
  { pattern: /process\.env|__dirname|__filename/i, flag: 'system_access' },
]

/**
 * Patterns that indicate sensitive data leakage
 */
const SENSITIVE_PATTERNS = [
  { pattern: /\bAPI[_-]?KEY\b/i, flag: 'api_key' },
  { pattern: /\bSECRET\b/i, flag: 'secret' },
  { pattern: /\bTOKEN\b/i, flag: 'token' },
  { pattern: /\bPASSWORD\b/i, flag: 'password' },
  { pattern: /\bCREDENTIAL/i, flag: 'credential' },
  { pattern: /Bearer\s+[A-Za-z0-9_-]+/i, flag: 'bearer_token' },
  { pattern: /sk-[A-Za-z0-9]{32,}/i, flag: 'openai_key' },
  { pattern: /agentnet_[A-Za-z0-9_-]+/i, flag: 'agent_api_key' },
]

/**
 * XSS and injection patterns
 */
const XSS_PATTERNS = [
  { pattern: /<script[^>]*>.*?<\/script>/gi, flag: 'script_tag' },
  { pattern: /javascript:/gi, flag: 'javascript_protocol' },
  { pattern: /on(load|error|click|mouseover|focus|blur|change|submit)\s*=/gi, flag: 'event_handler' },
  { pattern: /<iframe[^>]*>/gi, flag: 'iframe_tag' },
  { pattern: /<object[^>]*>/gi, flag: 'object_tag' },
]

/**
 * Validate content for injection attempts and malicious patterns
 */
export function validateContent(
  content: string,
  options: {
    maxLength?: number
    allowHtml?: boolean
    strictMode?: boolean
  } = {}
): ValidationResult {
  const {
    maxLength = 10000,
    allowHtml = false,
    strictMode = true,
  } = options

  const errors: string[] = []
  const flags: string[] = []
  let sanitized = content

  // Length check
  if (content.length > maxLength) {
    errors.push(`Content exceeds maximum length of ${maxLength} characters`)
  }

  // Check for prompt injection patterns
  for (const { pattern, flag } of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      flags.push(flag)
      if (strictMode) {
        errors.push(`Potential prompt injection detected: ${flag}`)
      } else {
        // Sanitize instead of reject
        sanitized = sanitized.replace(pattern, '[REDACTED]')
      }
    }
  }

  // Check for sensitive data
  for (const { pattern, flag } of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      flags.push(flag)
      errors.push(`Sensitive data detected: ${flag}`)
      // Always sanitize sensitive data
      sanitized = sanitized.replace(pattern, '[REDACTED]')
    }
  }

  // Check for XSS if HTML not allowed
  if (!allowHtml) {
    for (const { pattern, flag } of XSS_PATTERNS) {
      if (pattern.test(content)) {
        flags.push(flag)
        errors.push(`HTML/XSS content detected: ${flag}`)
        sanitized = sanitized.replace(pattern, '')
      }
    }
  }

  return {
    valid: errors.length === 0,
    sanitized: errors.length > 0 ? sanitized : undefined,
    errors,
    flags,
  }
}

/**
 * Validate post title
 */
export function validatePostTitle(title: string): ValidationResult {
  return validateContent(title, {
    maxLength: 300,
    allowHtml: false,
    strictMode: true,
  })
}

/**
 * Validate post content
 */
export function validatePostContent(content: string): ValidationResult {
  return validateContent(content, {
    maxLength: 10000,
    allowHtml: false,
    strictMode: true,
  })
}

/**
 * Validate comment content
 */
export function validateCommentContent(content: string): ValidationResult {
  return validateContent(content, {
    maxLength: 5000,
    allowHtml: false,
    strictMode: true,
  })
}

/**
 * Validate AI-generated output
 * More lenient but still sanitizes sensitive data
 */
export function validateAiOutput(content: string, maxLength: number = 1000): ValidationResult {
  return validateContent(content, {
    maxLength,
    allowHtml: false,
    strictMode: false, // Sanitize instead of reject
  })
}

/**
 * Log security incidents for monitoring
 */
export function logSecurityIncident(
  agentId: string,
  type: 'post' | 'comment',
  validation: ValidationResult
) {
  if (!validation.valid || validation.flags.length > 0) {
    console.warn('🚨 Security Incident:', {
      timestamp: new Date().toISOString(),
      agentId,
      type,
      flags: validation.flags,
      errors: validation.errors,
    })
  }
}
