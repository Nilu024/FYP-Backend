const nodemailer = require("nodemailer");
const User = require("../models/User");
const { haversineDistance } = require("./knnService");

const APP_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const getEmailConfig = () => {
  const smtpService = process.env.SMTP_SERVICE?.trim() || "";
  const smtpHost = process.env.SMTP_HOST?.trim() || "smtp.gmail.com";
  const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
  const smtpSecure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === "true"
    : smtpPort === 465;
  const smtpUser =
    process.env.SMTP_EMAIL?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "";
  const smtpPass =
    process.env.SMTP_PASSWORD?.replace(/\s+/g, "").trim() ||
    process.env.SMTP_PASS?.replace(/\s+/g, "").trim() ||
    "";
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "AADHAR";
  const fromAddress =
    process.env.EMAIL_FROM_ADDRESS?.trim() ||
    smtpUser;

  return {
    smtpService,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    fromName,
    fromAddress,
  };
};

const createTransporter = () => {
  const config = getEmailConfig();
  const transportConfig = {
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  };

  if (config.smtpService) {
    transportConfig.service = config.smtpService;
  } else {
    transportConfig.host = config.smtpHost;
  }

  return nodemailer.createTransport(transportConfig);
};

const getFromHeader = () => {
  const { fromName, fromAddress } = getEmailConfig();
  return `"${fromName}" <${fromAddress}>`;
};

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const fmt = (n = 0) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const baseTemplate = ({ title, preheader, body, ctaText, ctaUrl }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f4f0; color: #1a1a1a; font-family: Arial, Helvetica, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    .card { background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 32px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #f97316 0%, #fb923c 50%, #10b981 100%); color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; line-height: 1.2; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px; }
    .content { padding: 32px 24px; }
    .body-text { font-size: 15px; line-height: 1.7; color: #4a4a4a; margin: 0 0 16px; }
    .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin: 20px 0; }
    .cta-wrap { text-align: center; margin-top: 24px; }
    .cta-btn { display: inline-block; padding: 14px 28px; border-radius: 12px; background: #f97316; color: #ffffff; text-decoration: none; font-weight: 700; }
    .footer { padding: 20px 24px; background: #faf9f7; border-top: 1px solid #f0ede8; color: #8a8a8a; font-size: 12px; line-height: 1.6; text-align: center; }
    .otp { text-align: center; font-size: 42px; letter-spacing: 8px; font-weight: 800; color: #059669; margin: 12px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>${escapeHtml(title)}</h1>
        ${preheader ? `<p>${escapeHtml(preheader)}</p>` : ""}
      </div>
      <div class="content">
        ${body}
        ${ctaText && ctaUrl ? `<div class="cta-wrap"><a class="cta-btn" href="${ctaUrl}">${escapeHtml(ctaText)}</a></div>` : ""}
      </div>
      <div class="footer">
        AADHAR<br />
        Connect. Care. Change.<br />
        <a href="${APP_URL}" style="color:#f97316;text-decoration:none;">Visit platform</a>
      </div>
    </div>
  </div>
</body>
</html>
`;

const sendEmail = async ({ to, subject, html, text }) => {
  const config = getEmailConfig();

  // Debug logging for email configuration
  if (process.env.NODE_ENV === "development") {
    console.log("Email config:", {
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser ? "***" : "MISSING",
      smtpPass: config.smtpPass ? "***" : "MISSING",
      fromAddress: config.fromAddress,
    });
  }

  if (!config.smtpUser || !config.smtpPass) {
    const missing = [];
    if (!config.smtpUser) missing.push("SMTP_EMAIL/SMTP_USER");
    if (!config.smtpPass) missing.push("SMTP_PASSWORD/SMTP_PASS");
    console.warn(`Email not configured. Missing ${missing.join(", ")}. Skipping send to ${to}`);
    return false;
  }

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: getFromHeader(),
      to,
      subject,
      html,
      text,
    });
    console.log(`Email sent successfully to ${to}`);
    return true;
  } catch (err) {
    console.error(`Email failed to ${to}:`, err.message, {
      code: err.code,
      command: err.command,
      response: err.response,
      smtpService: config.smtpService || null,
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpSecure: config.smtpSecure,
      smtpUser: config.smtpUser,
    });
    return false;
  }
};

const sendOTPEmail = async (user, otp) => {
  const firstName = escapeHtml(user.name?.split(" ")[0] || "there");
  const safeOtp = escapeHtml(otp);

  const body = `
    <p class="body-text">Hi ${firstName},</p>
    <p class="body-text">Please verify your email address to complete registration on AADHAR.</p>
    <div class="info-box">
      <div class="otp">${safeOtp}</div>
      <p class="body-text" style="margin-bottom:0;text-align:center;">This verification code expires in 10 minutes.</p>
    </div>
    <p class="body-text">If you did not create this account, you can safely ignore this email.</p>
  `;

  return sendEmail({
    to: user.email,
    subject: `Your AADHAR verification code is ${otp}`,
    html: baseTemplate({
      title: "Verify Your Email",
      preheader: `Use code ${otp} to finish signup`,
      body,
    }),
    text: `Hi ${user.name}, your AADHAR verification code is ${otp}. It expires in 10 minutes.`,
  });
};

const sendWelcomeEmail = async (user) => {
  const firstName = escapeHtml(user.name?.split(" ")[0] || "friend");
  const body = `
    <p class="body-text">Welcome to AADHAR, ${firstName}.</p>
    <p class="body-text">Your email is verified and your account is ready. Explore causes near you and start making a difference.</p>
  `;

  return sendEmail({
    to: user.email,
    subject: "Welcome to AADHAR",
    html: baseTemplate({
      title: "Welcome to AADHAR",
      preheader: "Your account is ready",
      body,
      ctaText: "Explore Causes",
      ctaUrl: `${APP_URL}/needs`,
    }),
    text: `Welcome to AADHAR, ${user.name}. Your account is now ready.`,
  });
};

const sendDonationConfirmEmail = async (user, donation, need, charity) => {
  const firstName = escapeHtml(user.name?.split(" ")[0] || "donor");
  const needTitle = escapeHtml(need?.title || charity?.name || "Your Donation");
  const charityName = escapeHtml(charity?.name || "Charity");
  const receipt = escapeHtml(donation.receiptNumber || donation._id);

  const body = `
    <p class="body-text">Thank you, ${firstName}.</p>
    <div class="info-box">
      <p class="body-text"><strong>Donation:</strong> ${fmt(donation.amount)}</p>
      <p class="body-text"><strong>Cause:</strong> ${needTitle}</p>
      <p class="body-text"><strong>Charity:</strong> ${charityName}</p>
      <p class="body-text" style="margin-bottom:0;"><strong>Receipt:</strong> ${receipt}</p>
    </div>
  `;

  return sendEmail({
    to: user.email,
    subject: `Donation confirmed - ${fmt(donation.amount)}`,
    html: baseTemplate({
      title: "Donation Confirmed",
      preheader: `${fmt(donation.amount)} successfully received`,
      body,
      ctaText: "View Donations",
      ctaUrl: `${APP_URL}/my-donations`,
    }),
    text: `Thank you ${user.name}. Your donation of ${fmt(donation.amount)} to ${charityName} has been confirmed.`,
  });
};

const sendNewNeedEmailAlerts = async (need, charity) => {
  if (!need || !charity) return { sent: 0, skipped: 0 };

  const charityCoords = charity.location?.coordinates;
  if (!charityCoords || (charityCoords[0] === 0 && charityCoords[1] === 0)) {
    console.warn("Charity has no coordinates. Skipping email alerts.");
    return { sent: 0, skipped: 0 };
  }

  const users = await User.find({
    role: "donor",
    isActive: true,
    "location.coordinates": { $ne: [0, 0] },
  }).select("name email location preferences");

  let sent = 0;
  let skipped = 0;
  const errors = [];

  for (const user of users) {
    try {
      const userCoords = user.location?.coordinates;
      const maxDist = user.preferences?.maxDistanceKm || 50;
      const userCategories = user.preferences?.categories || [];

      if (!userCoords || userCoords.length !== 2) {
        skipped++;
        continue;
      }

      const distKm = haversineDistance(userCoords, charityCoords);
      if (distKm > maxDist) {
        skipped++;
        continue;
      }

      if (userCategories.length > 0 && !userCategories.includes(need.category)) {
        skipped++;
        continue;
      }

      const distLabel = distKm < 1 ? `${Math.round(distKm * 1000)}m` : `${distKm.toFixed(1)}km`;
      const body = `
        <p class="body-text">Hi ${escapeHtml(user.name?.split(" ")[0] || "there")},</p>
        <p class="body-text">A new cause near you needs support.</p>
        <div class="info-box">
          <p class="body-text"><strong>${escapeHtml(need.title)}</strong></p>
          <p class="body-text">${escapeHtml(charity.name)} is about ${escapeHtml(distLabel)} from you.</p>
          <p class="body-text"><strong>Goal:</strong> ${fmt(need.targetAmount)}</p>
          <p class="body-text" style="margin-bottom:0;"><strong>Raised:</strong> ${fmt(need.raisedAmount)}</p>
        </div>
      `;

      const ok = await sendEmail({
        to: user.email,
        subject: `New cause near you: ${need.title}`,
        html: baseTemplate({
          title: "New Cause Near You",
          preheader: `${escapeHtml(charity.name)} needs support`,
          body,
          ctaText: "View Cause",
          ctaUrl: `${APP_URL}/needs/${need._id}`,
        }),
        text: `A new cause "${need.title}" by ${charity.name} is near you.`,
      });

      if (ok) {
        sent++;
      } else {
        errors.push(user.email);
      }
    } catch (err) {
      console.error(`Email alert error for ${user.email}:`, err.message);
      errors.push(user.email);
      skipped++;
    }
  }

  return { sent, skipped, errors };
};

module.exports = {
  sendEmail,
  sendNewNeedEmailAlerts,
  sendWelcomeEmail,
  sendDonationConfirmEmail,
  sendOTPEmail,
};
