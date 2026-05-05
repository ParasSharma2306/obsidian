const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  subscription: {
    status: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },
    dodoCustomerId: String,
    dodoSubscriptionId: String,
    currentPeriodEnd: Date,
  },
  preferences: {
    theme: {
      type: String,
      default: 'dark',
    },
    timestampFormat: {
      type: String,
      default: 'original',
    },
    dateFormat: {
      type: String,
      default: 'original',
    },
    displayName: String,
  },
});

module.exports = mongoose.model('User', userSchema);
