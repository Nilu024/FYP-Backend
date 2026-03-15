const mongoose = require("mongoose");

const NeedSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Need title is required"],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      maxlength: [2000],
    },
    charity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Charity",
      required: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: [
        "Education",
        "Healthcare",
        "Poverty",
        "Environment",
        "Animal Welfare",
        "Disaster Relief",
        "Women Empowerment",
        "Child Welfare",
        "Elderly Care",
        "Disability Support",
        "Arts & Culture",
        "Sports",
        "Water & Sanitation",
        "Food Security",
        "Rural Development",
      ],
    },
    urgency: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    targetAmount: {
      type: Number,
      required: [true, "Target amount is required"],
      min: [100, "Target amount must be at least ₹100"],
    },
    raisedAmount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    images: [String],
    deadline: {
      type: Date,
    },
    // Admin verification before public
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "completed", "paused"],
      default: "pending",
    },
    rejectionReason: { type: String },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Beneficiaries
    beneficiaryCount: { type: Number, default: 0 },
    beneficiaryDescription: { type: String },
    donorCount: { type: Number, default: 0 },
    tags: [String],
    isFeatured: { type: Boolean, default: false },
    viewCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
NeedSchema.index({ charity: 1, status: 1 });
NeedSchema.index({ category: 1, status: 1 });
NeedSchema.index({ urgency: 1, status: 1 });
NeedSchema.index({ isFeatured: 1 });

// Virtual: progress percentage
NeedSchema.virtual("progressPercent").get(function () {
  if (this.targetAmount === 0) return 0;
  return Math.min(Math.round((this.raisedAmount / this.targetAmount) * 100), 100);
});

// Virtual: days remaining
NeedSchema.virtual("daysRemaining").get(function () {
  if (!this.deadline) return null;
  const diff = this.deadline - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

module.exports = mongoose.model("Need", NeedSchema);
