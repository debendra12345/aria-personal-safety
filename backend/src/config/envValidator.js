/**
 * Environment Validator
 * 
 * Validates environment configuration on application startup.
 * Fails fast if critical security settings are missing or misconfigured.
 * 
 * N18 Fix: Ensure NODE_ENV is explicitly set and production security is the default.
 */

export function validateEnvironment() {
  const nodeEnv = process.env.NODE_ENV || '';
  
  // Fail if NODE_ENV is not explicitly set
  if (!nodeEnv) {
    throw new Error(
      'FATAL: NODE_ENV is not set. ' +
      'Production safety guards require NODE_ENV to be explicitly configured. ' +
      'Set NODE_ENV=production for production deployments or NODE_ENV=development for local development.'
    );
  }
  
  // Fail if NODE_ENV contains an unexpected value
  const validEnvironments = ['production', 'development', 'test'];
  if (!validEnvironments.includes(nodeEnv)) {
    throw new Error(
      `FATAL: NODE_ENV="${nodeEnv}" is invalid. ` +
      `Must be one of: ${validEnvironments.join(', ')}`
    );
  }
  
  // Validate critical production environment variables
  if (nodeEnv === 'production') {
    const requiredEnvVars = ['JWT_SECRET'];
    const missing = requiredEnvVars.filter(
      varName => !process.env[varName] || process.env[varName].includes('change_me')
    );
    
    if (missing.length > 0) {
      throw new Error(
        `FATAL: Missing or using default values for required production environment variables: ${missing.join(', ')}. ` +
        `Production deployments require these to be set to secure values.`
      );
    }
  }
  
  console.log(`[ENVIRONMENT VALIDATOR] NODE_ENV=${nodeEnv}`);
  console.log(`[ENVIRONMENT VALIDATOR] Production safety guards: ${nodeEnv === 'production' ? 'ENABLED' : 'DISABLED (Development Mode)'}`);
}
