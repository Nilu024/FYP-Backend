const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Validate critical environment variables
const requiredEnvVars = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'JWT_SECRET',
  'MONGO_URI',
  'SMTP_EMAIL',
  'SMTP_PASSWORD'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`⚠️  Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('⚠️  Make sure these are set in your deployment environment.');
}

// Debug: Log key environment variables (only in development)
if (process.env.NODE_ENV === "development") {
  console.log("🔧 Environment check:");
  console.log(`  JWT_SECRET: ${process.env.JWT_SECRET ? "✓" : "✗"}`);
  console.log(`  MONGO_URI: ${process.env.MONGO_URI ? "✓" : "✗"}`);
  console.log(`  SMTP_EMAIL: ${process.env.SMTP_EMAIL ? "✓" : "✗"}`);
  console.log(`  SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? "✓" : "✗"}`);
  console.log(`  RAZORPAY_KEY_ID: ${process.env.RAZORPAY_KEY_ID ? "✓" : "✗"}`);
}

// Connect to DB
const connectDB = require("./config/db");

// Init Firebase Admin
require("./config/firebase");

// Security & Error handler
const errorHandler = require("./middleware/errorHandler");

// Route imports
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const charityRoutes = require("./routes/charities");
const needRoutes = require("./routes/needs");
const donationRoutes = require("./routes/donations");
const notificationRoutes = require("./routes/notifications");
const adminRoutes = require("./routes/admin");
const recommendRoutes = require("./routes/recommendations");

// Connect to DB
connectDB();

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  message: { success: false, error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Raw body parser for Razorpay webhook verification
app.use("/api/donations/webhook", express.raw({ type: "application/json" }));

// Logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../frontend/dist")));

// ==================== ROUTES ====================
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/charities", charityRoutes);
app.use("/api/needs", needRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/recommendations", recommendRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "AADHAR API is running", env: process.env.NODE_ENV });
});

// API 404 handler
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found" });
});

// Catch-all handler: send back index.html for client-side routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = Number.parseInt(process.env.PORT, 10) || 5000;
const server = app.listen(PORT, () => {
  console.log(`\nAADHAR Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`API: http://localhost:${PORT}/api`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Stop the process using that port or change PORT in backend/.env.");
    process.exit(1);
  }

  throw error;
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
