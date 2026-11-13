// Express global error handler middleware
export const errorHandler = (err, req, res, next) => {
  console.error('🔴 [GLOBAL ERROR HANDLER]:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // Only expose stack traces in development mode
  // Production must NEVER leak implementation details
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(statusCode).json({
    success: false,
    message: message,
    error: isDevelopment ? err.stack : undefined
  });
};

export default errorHandler;
