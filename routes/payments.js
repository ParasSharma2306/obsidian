const express = require('express');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/payments/create-checkout
router.post('/create-checkout', verifyToken, async (req, res) => {
  try {
    const { DodoPayments } = require('dodopayments');

    const dodo = new DodoPayments({
      bearerToken: process.env.DODO_API_KEY,
      environment: 'test_mode',
    });

    console.log('req.user:', JSON.stringify(req.user));
    console.log('email value:', req.user.email);
    console.log('email type:', typeof req.user.email);
    console.log('customer object:', JSON.stringify({ email: req.user.email }));

    let userEmail = req.user.email;
    if (!userEmail) {
      const user = await User.findById(req.user.id);
      userEmail = user.email;
    }

    const session = await dodo.checkoutSessions.create({
      product_cart: [{ product_id: process.env.DODO_PRODUCT_ID, quantity: 1 }],
      customer: { email: userEmail },
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/account?success=true`,
    });

    console.log('Checkout session created:', session.session_id);
    res.json({ checkoutUrl: session.checkout_url });
  } catch (err) {
    console.error('Checkout error:', err.status, JSON.stringify(err.error, null, 2));
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/webhook  (public — signature verification temporarily skipped)
router.post('/webhook', async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    console.error('Webhook: invalid JSON body:', err.message);
    return res.status(200).json({ received: true });
  }

  const { type, data } = payload;
  const email = data?.customer?.email?.toLowerCase();
  const subscriptionId = data?.subscription_id;
  const nextBillingDate = data?.next_billing_date;

  console.log(`Webhook received: type=${type} email=${email} subscription_id=${subscriptionId}`);

  if (type === 'payment.failed') {
    console.log(`Webhook payment.failed for email=${email} — no subscription change`);
    return res.status(200).json({ received: true });
  }

  const STATUS_UPDATES = {
    'subscription.active': async () => {
      const result = await User.findOneAndUpdate(
        { email },
        {
          $set: {
            'subscription.status': 'pro',
            'subscription.dodoSubscriptionId': subscriptionId,
            'subscription.currentPeriodEnd': new Date(nextBillingDate),
          },
        },
        { new: true }
      );
      if (result) {
        console.log(`Webhook subscription.active: set user ${email} to pro, period ends ${nextBillingDate}`);
      } else {
        console.error(`Webhook subscription.active: no user found for email=${email}`);
      }
    },
    'subscription.cancelled': async () => {
      const result = await User.findOneAndUpdate(
        { email },
        { $set: { 'subscription.status': 'free' } }
      );
      if (result) {
        console.log(`Webhook subscription.cancelled: set user ${email} to free`);
      } else {
        console.error(`Webhook subscription.cancelled: no user found for email=${email}`);
      }
    },
    'subscription.expired': async () => {
      const result = await User.findOneAndUpdate(
        { email },
        { $set: { 'subscription.status': 'free' } }
      );
      if (result) {
        console.log(`Webhook subscription.expired: set user ${email} to free`);
      } else {
        console.error(`Webhook subscription.expired: no user found for email=${email}`);
      }
    },
    'subscription.on_hold': async () => {
      const result = await User.findOneAndUpdate(
        { email },
        { $set: { 'subscription.status': 'free' } }
      );
      if (result) {
        console.log(`Webhook subscription.on_hold: set user ${email} to free`);
      } else {
        console.error(`Webhook subscription.on_hold: no user found for email=${email}`);
      }
    },
    'subscription.failed': async () => {
      const result = await User.findOneAndUpdate(
        { email },
        { $set: { 'subscription.status': 'free' } }
      );
      if (result) {
        console.log(`Webhook subscription.failed: set user ${email} to free`);
      } else {
        console.error(`Webhook subscription.failed: no user found for email=${email}`);
      }
    },
  };

  const handler = STATUS_UPDATES[type];
  if (handler) {
    try {
      await handler();
    } catch (err) {
      console.error(`Webhook handler error for type=${type}:`, err.message);
    }
  } else {
    console.log(`Webhook: unhandled event type=${type}`);
  }

  res.status(200).json({ received: true });
});

// GET /api/payments/status
router.get('/status', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('subscription');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { status, currentPeriodEnd } = user.subscription;
    res.json({ status, currentPeriodEnd: currentPeriodEnd ?? null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

// POST /api/payments/test-activate  (development only)
router.post('/test-activate', verifyToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        'subscription.status': 'pro',
        'subscription.currentPeriodEnd': currentPeriodEnd,
      },
    });

    res.json({ success: true, status: 'pro' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate test subscription' });
  }
});

module.exports = router;
