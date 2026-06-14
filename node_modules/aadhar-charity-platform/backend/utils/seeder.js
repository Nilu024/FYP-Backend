const dotenv = require("dotenv");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const User = require("../models/User");
const Charity = require("../models/Charity");
const Need = require("../models/Need");

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected for seeding...");
};

const categories = [
  "Education",
  "Healthcare",
  "Poverty",
  "Environment",
  "Animal Welfare",
  "Disaster Relief",
  "Women Empowerment",
  "Child Welfare",
  "Elderly Care",
  "Water & Sanitation",
  "Food Security",
];

const urgencies = ["low", "medium", "high", "critical"];

// Mumbai area coordinates for demo [lon, lat]
const locations = [
  { coordinates: [72.8777, 19.076], city: "Mumbai", state: "Maharashtra" },
  { coordinates: [72.8656, 19.0822], city: "Bandra", state: "Maharashtra" },
  { coordinates: [72.8353, 19.1136], city: "Andheri", state: "Maharashtra" },
  { coordinates: [73.8567, 18.5204], city: "Pune", state: "Maharashtra" },
  { coordinates: [72.9781, 19.2183], city: "Thane", state: "Maharashtra" },
  {
    coordinates: [72.9981, 18.9322],
    city: "Navi Mumbai",
    state: "Maharashtra",
  },
];

const seedData = async () => {
  await connectDB();

  // Clear existing data
  await User.deleteMany();
  await Charity.deleteMany();
  await Need.deleteMany();
  console.log("Cleared existing data...");

  // Create admin
  const admin = await User.create({
    name: "AADHAR Admin",
    email: "admin@aadhar.org",
    password: "Admin@123",
    role: "admin",
    isVerified: true,
    location: {
      type: "Point",
      coordinates: [72.8777, 19.076],
      city: "Mumbai",
      state: "Maharashtra",
    },
  });

  // Create charity users and charities
  const charityData = [
    {
      name: "Vidya Daan Foundation",
      categories: ["Education", "Child Welfare"],
      description:
        "Providing quality education to underprivileged children across Maharashtra.",
    },
    {
      name: "Arogya Seva Trust",
      categories: ["Healthcare", "Elderly Care"],
      description: "Free healthcare and medical camps for rural communities.",
    },
    {
      name: "Green Earth Initiative",
      categories: ["Environment", "Water & Sanitation"],
      description:
        "Planting trees and ensuring clean water access across urban slums.",
    },
    {
      name: "Nari Shakti NGO",
      categories: ["Women Empowerment", "Poverty"],
      description: "Skill training and employment for underprivileged women.",
    },
    {
      name: "Prani Mitra Shelter",
      categories: ["Animal Welfare"],
      description:
        "Rescue, rehabilitate, and rehome stray animals in Maharashtra.",
    },
    {
      name: "Sahara Disaster Relief",
      categories: ["Disaster Relief", "Food Security"],
      description:
        "Emergency food, shelter, and relief during natural disasters.",
    },
  ];

  const charities = [];
  for (let i = 0; i < charityData.length; i++) {
    const loc = locations[i % locations.length];
    const charityUser = await User.create({
      name: `${charityData[i].name} Admin`,
      email: `charity${i + 1}@aadhar.org`,
      password: "Charity@123",
      role: "charity",
      isVerified: true,
      location: { type: "Point", ...loc },
    });

    const charity = await Charity.create({
      name: charityData[i].name,
      description: charityData[i].description,
      categories: charityData[i].categories,
      owner: charityUser._id,
      location: {
        type: "Point",
        ...loc,
        address: `${loc.city} Main Road`,
        pincode: "400001",
      },
      contact: {
        email: `info@${charityData[i].name.toLowerCase().replace(/\s/g, "")}.org`,
        phone: `+91-9${Math.floor(100000000 + Math.random() * 900000000)}`,
      },
      isVerified: true,
      verifiedAt: new Date(),
      verifiedBy: admin._id,
      totalRaised: Math.floor(Math.random() * 500000),
      rating: (3.5 + Math.random() * 1.5).toFixed(1),
    });
    charities.push(charity);
  }

  // Create sample needs
  const needTitles = [
    [
      "School Supplies for 200 Children",
      "Build New Classroom Block",
      "Scholarship Fund for Girls",
    ],
    [
      "Free Medical Camp - Diabetes Screening",
      "Mobile Health Van for Villages",
      "Medicine Fund for TB Patients",
    ],
    [
      "Plant 10,000 Trees Campaign",
      "Clean Water Borewells in Slums",
      "Solar Power for Village School",
    ],
    [
      "Sewing Machines for 50 Women",
      "Vocational Training Center",
      "Microfinance for Self-Help Groups",
    ],
    [
      "Animal Rescue Van",
      "Vaccination Drive for Strays",
      "Shelter Expansion Fund",
    ],
    [
      "Flood Relief Food Kits",
      "Emergency Shelter Tents",
      "Drought Relief Water Tankers",
    ],
  ];

  for (let i = 0; i < charities.length; i++) {
    const titles = needTitles[i];
    for (let j = 0; j < titles.length; j++) {
      const target = 10000 + Math.floor(Math.random() * 490000);
      const raised = Math.floor(Math.random() * target);
      await Need.create({
        title: titles[j],
        description: `This initiative by ${charities[i].name} aims to address critical needs in our community. Your contribution will make a direct impact on the lives of beneficiaries. Every rupee counts towards building a better tomorrow.`,
        charity: charities[i]._id,
        category: charities[i].categories[0],
        urgency: urgencies[Math.floor(Math.random() * urgencies.length)],
        targetAmount: target,
        raisedAmount: raised,
        status: "approved",
        beneficiaryCount: Math.floor(50 + Math.random() * 500),
        beneficiaryDescription:
          "Underprivileged families and individuals in need.",
        deadline: new Date(
          Date.now() + (30 + Math.random() * 60) * 24 * 60 * 60 * 1000,
        ),
        donorCount: Math.floor(Math.random() * 100),
        isFeatured: j === 0,
        verifiedAt: new Date(),
        verifiedBy: admin._id,
      });
    }
  }

  // Create sample donors
  for (let i = 1; i <= 5; i++) {
    await User.create({
      name: `Donor ${i}`,
      email: `donor${i}@example.com`,
      password: "Donor@123",
      role: "donor",
      isVerified: true,
      location: {
        type: "Point",
        ...locations[i % locations.length],
        address: "Sample Address",
      },
      preferences: {
        categories: categories.slice(0, 3),
        maxDistanceKm: 25,
      },
    });
  }

  console.log("\n✅ Seed data created successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("👤 Admin:    admin@aadhar.org      / Admin@123");
  console.log("🏢 Charity:  charity1@aadhar.org   / Charity@123");
  console.log("💚 Donor:    donor1@example.com    / Donor@123");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  mongoose.connection.close();
};

seedData().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
