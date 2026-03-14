const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const path = require("path");

// Load env vars
dotenv.config();

const connectDB = require("./config/db");
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
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logger
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n🚀 AADHAR Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`🌐 API: http://localhost:${PORT}/api`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`❌ Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = app;
