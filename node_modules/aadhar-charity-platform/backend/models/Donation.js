const mongoose = require("mongoose");

const DonationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    charity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Charity",
      required: true,
    },
    need: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Need",
    },
    amount: {
      type: Number,
      required: [true, "Donation amount is required"],
      min: [10, "Minimum donation is ₹10"],
    },
    currency: { type: String, default: "INR" },
    message: {
      type: String,
      maxlength: [500],
    },
    isAnonymous: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["upi", "card", "netbanking", "wallet", "other"],
    },
    // Razorpay fields
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    transactionId: { type: String, unique: true, sparse: true },
    receiptNumber: { type: String, unique: true, sparse: true },
    taxExempt: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

DonationSchema.index({ donor: 1, createdAt: -1 });
DonationSchema.index({ charity: 1, status: 1 });
DonationSchema.index({ need: 1, status: 1 });

// Auto-generate receipt number
DonationSchema.pre("save", function (next) {
  if (!this.receiptNumber && this.status === "completed") {
    this.receiptNumber = `AADHAR-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model("Donation", DonationSchema);
