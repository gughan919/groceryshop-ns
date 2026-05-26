import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { createRequire } from 'module';
import { promisify } from 'util';
import { createServer as createViteServer } from 'vite';
import { dbService, saveDb } from './server/db';
import { uploadFileToFirebaseStorage } from './server/firebase-server';
import { GoogleGenAI, Type } from '@google/genai';
import { User, Address, Product, Category, Order, Coupon, DashboardBanner, Review } from './src/types';
import Stripe from 'stripe';

const app = express();
const PORT = 3000;
const execFileAsync = promisify(execFile);
const requireOptional = createRequire(path.join(process.cwd(), 'server.ts'));
const GENERATED_INVOICE_DIR = path.join(process.cwd(), 'data', 'generated-invoices');

let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key && key.trim() !== '') {
      stripeClient = new Stripe(key, { apiVersion: '2023-10-16' as any });
    }
  }
  return stripeClient;
}

// Pending Stripe Orders Cache (holds unpaid order payloads until redirection confirmation)
const PENDING_STRIPE_ORDERS: Record<string, Order> = {};

// Apply middle-wares
app.use(express.json({ limit: '10mb' }));
fs.mkdirSync(GENERATED_INVOICE_DIR, { recursive: true });
app.use('/generated-invoices', express.static(GENERATED_INVOICE_DIR, {
  fallthrough: false,
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
  }
}));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canAccessOrder(user: User, order: Order) {
  return user.role === 'admin' || isAdminEmail(user.email) || order.userId === user.id;
}

function validateInvoiceOrder(order: Order) {
  const missing: string[] = [];
  if (!order.userName && !order.address?.fullName) missing.push('customer name');
  if (!order.userEmail) missing.push('email');
  if (!order.address?.phone) missing.push('phone');
  if (!order.address?.street || !order.address?.city || !order.address?.state || !order.address?.pincode) missing.push('delivery address');
  if (!order.id) missing.push('order ID');
  if (!Array.isArray(order.items) || order.items.length === 0) missing.push('product list');
  if (order.items?.some(item => !item.productName || !item.quantity || item.price === undefined)) missing.push('product quantity/prices');
  if (order.paymentStatus !== 'Paid') missing.push('paid payment status');
  if (missing.length > 0) {
    throw new Error(`Cannot generate invoice. Missing or invalid: ${Array.from(new Set(missing)).join(', ')}.`);
  }
}

async function runWithRetry<T>(operation: () => Promise<T>, attempts = 3) {
  let lastError: any;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(450 * attempt);
      }
    }
  }
  throw lastError;
}

async function generateInvoicePdf(order: Order) {
  validateInvoiceOrder(order);
  const safeOrderId = order.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const invoiceId = `INV-${safeOrderId}`;
  const jsonPath = path.join(GENERATED_INVOICE_DIR, `${invoiceId}.json`);
  const pdfPath = path.join(GENERATED_INVOICE_DIR, `${invoiceId}.pdf`);

  const enrichedOrder = {
    ...order,
    invoiceId,
    deliveryEstimate: 'Express delivery window',
    storeLogoUrl: process.env.STORE_LOGO_URL || ''
  };

  fs.writeFileSync(jsonPath, JSON.stringify(enrichedOrder, null, 2), 'utf-8');

  await runWithRetry(async () => {
    await execFileAsync('python', [
      path.join(process.cwd(), 'scripts', 'generate_invoice.py'),
      jsonPath,
      pdfPath
    ], { timeout: 30000, maxBuffer: 1024 * 1024 });

    const stats = fs.statSync(pdfPath);
    if (!stats.size || stats.size < 1000) {
      throw new Error('Generated invoice PDF is empty.');
    }
  });

  return { invoiceId, pdfPath };
}

async function sendInvoiceEmail(order: Order, invoicePath: string, invoiceUrl: string) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.INVOICE_FROM_EMAIL || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !from) {
    return {
      status: 'skipped' as const,
      error: 'SMTP settings are not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and INVOICE_FROM_EMAIL to send real invoice emails.'
    };
  }

  try {
    const nodemailer = requireOptional('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });

    await runWithRetry(() => transporter.sendMail({
      from,
      to: order.userEmail,
      subject: `NammaShop invoice ${order.id}`,
      text: `Thank you for shopping with NammaShop. Your invoice is attached and can also be downloaded here: ${invoiceUrl}`,
      attachments: [
        {
          filename: `Invoice-${order.id}.pdf`,
          path: invoicePath,
          contentType: 'application/pdf'
        }
      ]
    }));

    return { status: 'sent' as const };
  } catch (error: any) {
    console.error('[INVOICE EMAIL FAILURE]:', error);
    return {
      status: 'failed' as const,
      error: error.message || 'Invoice email failed.'
    };
  }
}

async function generateAndAttachInvoice(order: Order, publicBaseUrl = process.env.APP_URL || `http://localhost:${PORT}`) {
  if (order.invoiceUrl || order.paymentStatus !== 'Paid') return order;

  const { invoiceId, pdfPath } = await generateInvoicePdf(order);
  const localUrl = `/generated-invoices/${path.basename(pdfPath)}`;
  const firebaseUrl = await uploadFileToFirebaseStorage(pdfPath, `invoices/${order.userId}/${invoiceId}.pdf`, 'application/pdf');
  const invoiceUrl = firebaseUrl || localUrl;
  const emailResult = await sendInvoiceEmail(order, pdfPath, `${publicBaseUrl.replace(/\/$/, '')}${localUrl}`);
  return dbService.updateOrderInvoice(order.id, invoiceUrl, {
    invoiceId,
    invoiceGeneratedAt: new Date().toISOString(),
    invoiceEmailStatus: emailResult.status,
    invoiceEmailError: emailResult.error
  }) || order;
}

// Secure Session Cache (In-Memory for security)
const SECTOR_SESSIONS: Record<string, User> = {
  'MOCK-SESSION-ADMIN': { id: 'user-admin', email: 'admin@nammashop.com', name: 'Nammashop Partner Admin', role: 'admin' },
  'MOCK-SESSION-CUSTOMER': { id: 'user-customer', email: 'customer@nammashop.com', name: 'Rohan Sharma', role: 'customer', phone: '+91 9876543210' }
};

const ADMIN_EMAILS = new Set(['admin@nammashop.com', 'mjjayan2007@gmail.com', 'nammashopuk@gmail.com']);

function isAdminEmail(email?: string) {
  const cleaned = email?.toLowerCase().trim();
  return !!cleaned && (ADMIN_EMAILS.has(cleaned) || cleaned.endsWith('@nammashop.com'));
}

function createPersistentSessionToken(user: User) {
  return `SESSION-PERSIST-${user.id}`;
}

function resolveUserFromPersistentToken(token: string) {
  if (!token.startsWith('SESSION-PERSIST-')) return null;
  const userId = token.replace('SESSION-PERSIST-', '');
  return dbService.getUsers().find(u => u.id === userId) || null;
}

// Middleware: Authenticate User Session
function authenticate(req: Request, res: Response, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(419).json({ error: 'Authorization header is missing. Please sign in.' });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const user = SECTOR_SESSIONS[token] || resolveUserFromPersistentToken(token);
  if (!user) {
    return res.status(419).json({ error: 'Invalid or expired session. Please sign in.' });
  }
  if (user.isBanned) {
    return res.status(403).json({ error: 'This account has been suspended due to policy infringement.' });
  }
  (req as any).user = user;
  next();
}

// Middleware: Validate Admin Permissions
function requireAdmin(req: Request, res: Response, next: any) {
  authenticate(req, res, () => {
    const user = (req as any).user;
    if (user.role !== 'admin' && !isAdminEmail(user.email)) {
      return res.status(403).json({ error: 'Administrative clearance required. Route restricted.' });
    }
    next();
  });
}

// Ensure database file loads on express start
console.log('[DEBUG] Bootstrapping Nammashop transactional engine...');

// ----------------------------------------------------
// AUTHENTICATION APIS
// ----------------------------------------------------

// OTP Store for email validation
const activeOtps: Record<string, string> = {};

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing mandatory parameters.' });
    }

    const cleanedEmail = email.toLowerCase().trim();
    // Pre-allocate admin role if matches criteria
    const isPredefinedAdmin = isAdminEmail(cleanedEmail);
    const role = isPredefinedAdmin ? 'admin' : 'customer';

    const userId = 'user-' + Math.random().toString(36).substring(2, 11);
    const newUser: User = {
      id: userId,
      email: cleanedEmail,
      name,
      role,
      phone,
      avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`
    };

    dbService.addUser(newUser, password);
    
    const sessionToken = createPersistentSessionToken(newUser);
    SECTOR_SESSIONS[sessionToken] = newUser;

    res.json({
      success: true,
      message: 'Account initiated successfully. Verify your e-mail through Firebase Authentication.',
      user: newUser,
      token: sessionToken
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Operation aborted.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail and password credentials are required.' });
  }

  const cleanedEmail = email.toLowerCase().trim();
  const users = dbService.getUsers();
  const passwords = dbService.getPasswords();

  const user = users.find(u => u.email === cleanedEmail);
  const correctPassword = passwords[cleanedEmail];

  if (!user || correctPassword !== password) {
    return res.status(401).json({ error: 'Invalid e-mail or password credentials.' });
  }

  if (user.isBanned) {
    return res.status(403).json({ error: 'This account has been suspended.' });
  }

  const sessionToken = createPersistentSessionToken(user);
  SECTOR_SESSIONS[sessionToken] = user;

  res.json({
    success: true,
    user,
    token: sessionToken
  });
});

app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Missing email or OTP verification code.' });
  }
  const expectedOtp = activeOtps[email.toLowerCase().trim()];
  if (otp === expectedOtp) { // Validated against expected code
    delete activeOtps[email.toLowerCase().trim()];
    return res.json({ success: true, message: 'OTP verification complete. Account fully activated.' });
  }
  res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
});

app.post('/api/auth/firebase-sync', (req: Request, res: Response) => {
  const { uid, email, name, avatar, phone, role } = req.body;
  if (!uid || !email) {
    return res.status(400).json({ error: 'Missing Firebase uid or email details.' });
  }

  const cleanedEmail = email.toLowerCase().trim();
  const isPredefinedAdmin = isAdminEmail(cleanedEmail) || role === 'admin';
  const assignedRole = isPredefinedAdmin ? 'admin' : 'customer';

  // Retrieve existing user if exists
  const existingUsers = dbService.getUsers();
  let existingUser = existingUsers.find(u => u.id === uid || u.email === cleanedEmail);

  if (existingUser) {
    // Keep original roles if administrator or sync updates
    if (existingUser.role !== 'admin') {
      existingUser.role = assignedRole;
    }
    existingUser.name = name || existingUser.name;
    existingUser.avatar = avatar || existingUser.avatar;
    existingUser.phone = phone || existingUser.phone || '';
    dbService.updateUser(existingUser.id, existingUser);
  } else {
    existingUser = {
      id: uid,
      email: cleanedEmail,
      name: name || cleanedEmail.split('@')[0],
      role: assignedRole,
      phone: phone || '',
      avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name || cleanedEmail)}`
    };
    dbService.addUser(existingUser, 'firebase-shared-secret-auth-password');
  }

  // Create real active session token for the server's request context
  const sessionToken = createPersistentSessionToken(existingUser);
  SECTOR_SESSIONS[sessionToken] = existingUser;

  res.json({
    success: true,
    user: existingUser,
    token: sessionToken
  });
});

app.post('/api/auth/forgot-password', (req: Request, res: Response) => {
  res.status(410).json({
    error: 'Password recovery is handled by Firebase Authentication reset emails.'
  });
});

app.post('/api/auth/reset-password', (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'All fields (email, otp, newPassword) must be supplied.' });
  }

  const cleaned = email.toLowerCase().trim();
  const expectedOtp = activeOtps[cleaned];

  if (otp === expectedOtp) {
    delete activeOtps[cleaned];
    const passwords = dbService.getPasswords();
    passwords[cleaned] = newPassword;
    saveDb();
    return res.json({ success: true, message: 'Password recovery resetting completed. Try login.' });
  }
  res.status(400).json({ error: 'Invalid password recovery token.' });
});

app.post('/api/auth/google', (req: Request, res: Response) => {
  const { name, email, googleId, avatar } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Google login payload error.' });
  }

  const cleanedEmail = email.toLowerCase().trim();
  // Auto admin match for admin
  const isPredefinedAdmin = isAdminEmail(cleanedEmail);
  const role = isPredefinedAdmin ? 'admin' : 'customer';

  const users = dbService.getUsers();
  let existingUser = users.find(u => u.email === cleanedEmail);

  if (!existingUser) {
    const userId = 'user-google-' + Math.random().toString(36).substring(2, 10);
    existingUser = {
      id: userId,
      email: cleanedEmail,
      name,
      role,
      avatar: avatar || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`
    };
    dbService.addUser(existingUser, 'google-' + Math.random().toString());
  }

  if (existingUser.isBanned) {
    return res.status(403).json({ error: 'Account suspended.' });
  }

  const sessionToken = createPersistentSessionToken(existingUser);
  SECTOR_SESSIONS[sessionToken] = existingUser;

  res.json({
    success: true,
    user: existingUser,
    token: sessionToken
  });
});

app.get('/api/auth/me', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    user: (req as any).user
  });
});

app.put('/api/auth/profile', authenticate, (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, phone, dob, gender, avatar, emailVerified, phoneVerified, twoFactorEnabled, walletBalance } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name field is required.' });
    }

    const updates: any = { name };
    if (phone !== undefined) updates.phone = phone;
    if (dob !== undefined) updates.dob = dob;
    if (gender !== undefined) updates.gender = gender;
    if (avatar !== undefined) updates.avatar = avatar;
    if (emailVerified !== undefined) updates.emailVerified = emailVerified;
    if (phoneVerified !== undefined) updates.phoneVerified = phoneVerified;
    if (twoFactorEnabled !== undefined) updates.twoFactorEnabled = twoFactorEnabled;
    if (walletBalance !== undefined) updates.walletBalance = walletBalance;

    dbService.updateUser(user.id, updates);

    // Sync active session inside the server memory
    const matchedTokenKeys = Object.keys(SECTOR_SESSIONS).filter(k => SECTOR_SESSIONS[k].id === user.id);
    matchedTokenKeys.forEach(k => {
      SECTOR_SESSIONS[k] = { ...SECTOR_SESSIONS[k], ...updates };
    });

    res.json({
      success: true,
      user: { ...user, ...updates }
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error updating user profile.' });
  }
});

// ----------------------------------------------------
// PUBLIC CATALOG APIS
// ----------------------------------------------------

app.get('/api/categories', (req: Request, res: Response) => {
  res.json(dbService.getCategories());
});

app.get('/api/products', (req: Request, res: Response) => {
  let list = [...dbService.getProducts()];
  const { search, category, brand, priceMin, priceMax, sort, availableOnly, limit: limitQuery } = req.query;

  // 1. Text Searching & Autocomplete instant search
  if (search) {
    const q = (search as string).toLowerCase().trim();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      p.description.toLowerCase().includes(q)
    );
  }

  // 2. Category matching
  if (category) {
    list = list.filter(p => p.categoryId === category);
  }

  // 3. Brand filter
  if (brand) {
    list = list.filter(p => p.brand === brand);
  }

  // 4. Price range
  if (priceMin) {
    list = list.filter(p => p.price >= parseFloat(priceMin as string));
  }
  if (priceMax) {
    list = list.filter(p => p.price <= parseFloat(priceMax as string));
  }

  // 5. In stock status logic
  if (availableOnly === 'true') {
    list = list.filter(p => p.stock > 0);
  }

  // 6. Sorting algorithms
  if (sort) {
    if (sort === 'price-low') {
      list.sort((a, b) => (a.price * (1 - a.discount/100)) - (b.price * (1 - b.discount/100)));
    } else if (sort === 'price-high') {
      list.sort((a, b) => (b.price * (1 - b.discount/100)) - (a.price * (1 - a.discount/100)));
    } else if (sort === 'discount') {
      list.sort((a, b) => b.discount - a.discount);
    } else if (sort === 'rating') {
      list.sort((a, b) => b.rating - a.rating);
    }
  }

  if (limitQuery) {
    const parsedLimit = Math.max(1, Math.min(200, Number(limitQuery)));
    if (!Number.isNaN(parsedLimit)) {
      list = list.slice(0, parsedLimit);
    }
  }

  res.json(list);
});

app.get('/api/products/:id', (req: Request, res: Response) => {
  const prod = dbService.getProducts().find(p => p.id === req.params.id);
  if (!prod) return res.status(404).json({ error: 'Product not found.' });

  const reviewsList = dbService.getReviews(req.params.id);
  res.json({
    ...prod,
    reviews: reviewsList
  });
});

app.get('/api/banners', (req: Request, res: Response) => {
  const now = Date.now();
  const liveBanners = dbService
    .getBanners()
    .filter((banner) => {
      if (!banner.active) return false;
      const startOk = !banner.startDate || new Date(banner.startDate).getTime() <= now;
      const endOk = !banner.endDate || new Date(banner.endDate).getTime() >= now;
      return startOk && endOk;
    })
    .sort((a, b) => (a.priority || 999) - (b.priority || 999));
  res.json(liveBanners);
});

// ----------------------------------------------------
// CUSTOMER SHIPPING ADDRESSES APIS
// ----------------------------------------------------

app.get('/api/addresses', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  res.json(dbService.getAddressesByUserId(userId));
});

app.post('/api/addresses', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { label, fullName, street, city, state, pincode, phone } = req.body;

  if (!label || !fullName || !street || !city || !state || !pincode || !phone) {
    return res.status(400).json({ error: 'All address parameters must be set.' });
  }

  const newAddress: Address = {
    id: 'addr-' + Math.random().toString(36).substring(2, 9),
    label,
    fullName,
    street,
    city,
    state,
    pincode,
    phone
  };

  dbService.addAddress(userId, newAddress);
  res.json({ success: true, address: newAddress });
});

app.delete('/api/addresses/:id', authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  dbService.removeAddress(userId, req.params.id);
  res.json({ success: true, message: 'Address removed successfully.' });
});

// ----------------------------------------------------
// REVIEW SYSTEMS
// ----------------------------------------------------

app.post('/api/reviews', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  const { productId, rating, comment } = req.body;

  if (!productId || !rating || !comment) {
    return res.status(400).json({ error: 'Missing product, level rating, or comments.' });
  }

  const review: Review = {
    id: 'rev-' + Math.random().toString(36).substring(2, 10),
    productId,
    userName: user.name,
    userAvatar: user.avatar,
    rating: parseInt(rating),
    comment,
    date: new Date().toISOString()
  };

  dbService.addReview(review);
  res.json({ success: true, review });
});

// ----------------------------------------------------
// COUPON VALIDATION
// ----------------------------------------------------

app.post('/api/coupons/validate', authenticate, (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Coupon code not supplied.' });

  const coupon = dbService.getCoupons().find(c => c.code.toUpperCase() === code.trim().toUpperCase());
  if (!coupon) {
    return res.status(404).json({ error: 'Promo coupon code is invalid.' });
  }

  if (!coupon.active) return res.status(400).json({ error: 'Coupon is currently suspended.' });

  const now = new Date();
  const exp = new Date(coupon.expiryDate);
  if (exp < now) return res.status(400).json({ error: 'Coupon has passed its expiration window.' });

  if (coupon.usageCount >= coupon.usageLimit) {
    return res.status(400).json({ error: 'Coupon max utilization capacity reached.' });
  }

  res.json({
    success: true,
    coupon
  });
});

// ----------------------------------------------------
// TRANSACTIONAL CHECKOUT & LAZY GATEWAYS
// ----------------------------------------------------

app.post('/api/orders', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { items, subtotal, discount, couponCode, address, paymentMethod, clientToken, clientOrigin } = req.body;

    if (!items || items.length === 0 || !address) {
      return res.status(400).json({ error: 'Items bag and delivery address must be specified.' });
    }

    // Server-side recalculations to avoid client modifications
    let computedSubtotal = 0;
    const products = dbService.getProducts();

    const orderItemsParsed = items.map((clientItem: any) => {
      const dbProd = products.find(p => p.id === clientItem.productId);
      if (!dbProd) {
        throw new Error(`Product ${clientItem.productName} not found in store registry.`);
      }
      const itemFinalUnitPrice = dbProd.price * (1 - dbProd.discount / 100);
      computedSubtotal += itemFinalUnitPrice * clientItem.quantity;

      return {
        id: 'item-' + Math.random().toString(36).substring(2, 9),
        productId: dbProd.id,
        productName: dbProd.name,
        productImage: dbProd.image,
        price: Number(itemFinalUnitPrice.toFixed(2)),
        quantity: clientItem.quantity,
        unit: dbProd.unit
      };
    });

    let couponDiscountAmount = 0;
    if (couponCode) {
      const dbCoupon = dbService.getCoupons().find(c => c.code.toUpperCase() === couponCode.toUpperCase());
      if (dbCoupon && dbCoupon.active) {
        if (dbCoupon.type === 'percent') {
          couponDiscountAmount = computedSubtotal * (dbCoupon.value / 100);
        } else {
          couponDiscountAmount = dbCoupon.value;
        }
      }
    }

    // Set flat delivery fee (£2.99 or free if over £20.00)
    const deliveryFee = computedSubtotal >= 20 ? 0 : 2.99;
    const tax = Number((computedSubtotal * 0.05).toFixed(2)); // 5% VAT
    const total = Number((computedSubtotal - couponDiscountAmount + tax + deliveryFee).toFixed(2));

    const orderId = 'ORD-' + Math.floor(10000 + Math.random() * 90000).toString();
    const newOrder: Order = {
      id: orderId,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      items: orderItemsParsed,
      subtotal: Number(computedSubtotal.toFixed(2)),
      discount: Number(couponDiscountAmount.toFixed(2)),
      couponCode,
      tax,
      deliveryFee,
      total,
      status: 'Pending',
      paymentMethod,
      paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
      address,
      createdAt: new Date().toISOString(),
      timeline: [
        { status: 'Pending', time: new Date().toISOString(), description: 'Groceries order authorized. Nammashop team preparing dispatch.' }
      ]
    };

    if (paymentMethod === 'Stripe') {
      const stripeInstance = getStripe();
      if (stripeInstance) {
        try {
          // Pre-checkout inventory stock verification
          for (const item of orderItemsParsed) {
            const product = products.find(p => p.id === item.productId);
            if (!product) {
              return res.status(400).json({ error: `Product ${item.productName} is currently unavailable for checkout.` });
            }
            if (product.stock < item.quantity) {
              return res.status(400).json({ error: `Insufficient stock for ${item.productName}. Remaining: ${product.stock}` });
            }
          }

          const itemSummary = orderItemsParsed
            .map(item => `${item.productName} x ${item.quantity}`)
            .join(', ')
            .slice(0, 500);

          const originUrl = (clientOrigin || process.env.APP_URL || req.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
          const tokenParam = clientToken ? `&token=${encodeURIComponent(clientToken as string)}` : '';

          // Define low latency timeout settings for the checkout contact request
          const session = await stripeInstance.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
              {
                price_data: {
                  currency: 'gbp',
                  product_data: {
                    name: `Nammashop order ${orderId}`,
                    description: itemSummary || 'Fresh grocery order'
                  },
                  unit_amount: Math.round(total * 100),
                },
                quantity: 1,
              }
            ],
            mode: 'payment',
            success_url: `${originUrl}/?status=stripe-success&orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}${tokenParam}`,
            cancel_url: `${originUrl}/?status=stripe-cancel${tokenParam}`,
            metadata: {
              orderId,
              userId: user.id
            },
          }, {
            maxNetworkRetries: 1,
            timeout: 5000, // 5 seconds connection fallback timeout limit
          });

          // Order starts as Pending until confirmation, saved securely & persistently
          newOrder.paymentStatus = 'Pending';
          dbService.createOrder(newOrder);
          PENDING_STRIPE_ORDERS[orderId] = newOrder;

          return res.json({
            success: true,
            order: newOrder,
            stripeSessionUrl: session.url
          });
        } catch (stripeError: any) {
          console.error('[STRIPE REGISTRY FAULT]:', stripeError);
          return res.status(400).json({
            error: `Stripe connection timeout or credential error: ${stripeError.message || 'Gateway offline'}. Try 'Cash on Delivery' for immediate checkout testing!`
          });
        }
      } else {
        // Fallback for demo when Stripe key is not configured yet
        newOrder.paymentStatus = 'Paid';
        const committedOrder = dbService.createOrder(newOrder);
        const invoicedOrder = await generateAndAttachInvoice(committedOrder, (clientOrigin || process.env.APP_URL || req.headers.origin || `http://localhost:${PORT}`) as string);
        return res.json({
          success: true,
          order: invoicedOrder,
          stripeMocked: true,
          message: 'Stripe API key (STRIPE_SECRET_KEY) not set. Simulating instant successful Stripe mock transaction.'
        });
      }
    }

    // Safe transaction: checking levels and reducing stock atomically
    const committedOrder = dbService.createOrder(newOrder);
    const responseOrder = committedOrder.paymentStatus === 'Paid'
      ? await generateAndAttachInvoice(committedOrder, (clientOrigin || process.env.APP_URL || req.headers.origin || `http://localhost:${PORT}`) as string)
      : committedOrder;

    res.json({
      success: true,
      order: responseOrder
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Checkout failed.' });
  }
});

app.get('/api/orders', authenticate, (req: Request, res: Response) => {
  const user = (req as any).user;
  let oList = dbService.getOrders();
  if (user.role !== 'admin') {
    oList = oList.filter(o => o.userId === user.id);
  }
  res.json(oList);
});

// Confirm and process Stripe payments securely post-redirect
app.post('/api/orders/confirm-stripe', authenticate, async (req: Request, res: Response) => {
  try {
    const { orderId, sessionId } = req.body;
    if (!orderId) {
      return res.status(400).json({ error: 'Order security token ID is required for validation.' });
    }

    const pendingOrder = PENDING_STRIPE_ORDERS[orderId];
    const existing = dbService.getOrders().find(o => o.id === orderId);
    const orderForVerification = existing || pendingOrder;

    if (!orderForVerification) {
      return res.status(404).json({ error: 'Order transaction expired or not found.' });
    }

    const stripeInstance = getStripe();
    if (stripeInstance) {
      if (!sessionId) {
        return res.status(400).json({ error: 'Stripe checkout session ID is required for payment verification.' });
      }

      const session = await stripeInstance.checkout.sessions.retrieve(sessionId as string);
      if (session.metadata?.orderId !== orderId) {
        return res.status(400).json({ error: 'Stripe session does not match this order.' });
      }
      if (session.payment_status !== 'paid') {
        return res.status(402).json({ error: 'Stripe payment has not been completed yet.' });
      }

      const paidAmount = typeof session.amount_total === 'number' ? session.amount_total : 0;
      const expectedAmount = Math.round(orderForVerification.total * 100);
      if (paidAmount !== expectedAmount) {
        return res.status(400).json({ error: 'Stripe paid amount does not match this order total.' });
      }
    }

    if (existing) {
      if (existing.paymentStatus !== 'Paid') {
        const updated = dbService.updateOrderPaymentStatus(orderId, 'Paid', 'Pending');
        if (pendingOrder) {
          delete PENDING_STRIPE_ORDERS[orderId];
        }
        const invoicedOrder = await generateAndAttachInvoice(updated || existing);
        return res.json({
          success: true,
          order: invoicedOrder
        });
      }
      if (pendingOrder) {
        delete PENDING_STRIPE_ORDERS[orderId];
      }
      const invoicedOrder = await generateAndAttachInvoice(existing);
      return res.json({
        success: true,
        order: invoicedOrder
      });
    }

    if (!pendingOrder) {
      return res.status(404).json({ error: 'Order transaction expired or not found.' });
    }

    // Set status to officially Paid & Pending delivery
    pendingOrder.paymentStatus = 'Paid';
    pendingOrder.status = 'Pending';

    // Commit to persistent DB and decrement active stock atomically
    const committedOrder = dbService.createOrder(pendingOrder);
    const invoicedOrder = await generateAndAttachInvoice(committedOrder);

    // Free memory
    delete PENDING_STRIPE_ORDERS[orderId];

    return res.json({
      success: true,
      order: invoicedOrder
    });
  } catch (err: any) {
    console.error('[STRIPE CONFIRM FAILURE]:', err);
    return res.status(400).json({ error: err.message || 'Validation checkout registration failed.' });
  }
});

app.post('/api/orders/:id/invoice', authenticate, (req: Request, res: Response) => {
  const { invoiceUrl } = req.body;
  dbService.updateOrderInvoice(req.params.id, invoiceUrl);
  res.json({ success: true, invoiceUrl });
});

app.post('/api/orders/:id/invoice/generate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as User;
    const order = dbService.getOrders().find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!canAccessOrder(user, order)) return res.status(403).json({ error: 'You cannot access this invoice.' });

    if (order.invoiceUrl) {
      return res.json({
        success: true,
        order,
        invoiceUrl: order.invoiceUrl,
        invoiceId: order.invoiceId,
        reused: true
      });
    }

    const updatedOrder = await generateAndAttachInvoice(order, `${req.protocol}://${req.get('host')}`);

    return res.json({
      success: true,
      order: updatedOrder,
      invoiceUrl: updatedOrder.invoiceUrl,
      invoiceId: updatedOrder.invoiceId,
      emailStatus: updatedOrder.invoiceEmailStatus,
      emailError: updatedOrder.invoiceEmailError,
      reused: false
    });
  } catch (error: any) {
    console.error('[INVOICE GENERATION FAILURE]:', error);
    return res.status(400).json({ error: error.message || 'Invoice generation failed.' });
  }
});

app.post('/api/orders/:id/cancel', authenticate, (req: Request, res: Response) => {
  const result = dbService.cancelOrder(req.params.id);
  if (!result) {
    return res.status(400).json({ error: 'Order cannot be cancelled. Already shipped, completed or does not exist.' });
  }
  res.json({ success: true, order: result });
});

// Beautiful Simulated Invoice Download Details Generator API
app.get('/api/orders/:id/invoice', authenticate, (req: Request, res: Response) => {
  const order = dbService.getOrders().find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const user = (req as any).user as User;
  if (!canAccessOrder(user, order)) return res.status(403).json({ error: 'You cannot access this invoice.' });

  if (order.invoiceUrl) {
    return res.redirect(order.invoiceUrl);
  }

  // Stream simple markdown/CSV formatted printable contents
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename=Invoice_${order.id}.txt`);

  const invoiceStr = `
========================================
       N  A  M  M  A  S  H  O  P
========================================
E-COMMERCE GROCERY INVOICE DEED
TAX INVOICE / RECEIPT DELIVERED

Invoice ID: ${order.id}
Date: ${new Date(order.createdAt).toLocaleString()}
Customer Email: ${order.userEmail}
Recipient Name: ${order.address.fullName}

Shipping Address:
${order.address.street}
${order.address.city}, ${order.address.state} - ${order.address.pincode}
Contact Mobile: ${order.address.phone}

Payment Method : ${order.paymentMethod}
Payment Status : ${order.paymentStatus}
Order Status   : ${order.status}

----------------------------------------
ITEM DETAILS
----------------------------------------
${order.items.map(item => `${item.productName} (${item.unit})  x ${item.quantity}  = £${(item.price * item.quantity).toFixed(2)}`).join('\n')}

----------------------------------------
COST STRUCTURE
----------------------------------------
Subtotal:       £${order.subtotal.toFixed(2)}
Discount Coupon: £-${order.discount.toFixed(2)} [${order.couponCode || 'N/A'}]
Taxes (5% VAT): £${order.tax.toFixed(2)}
Delivery fee:   £${order.deliveryFee.toFixed(2)}
----------------------------------------
Grand Total Amount: £${order.total.toFixed(2)}
========================================
Nammashop quick commerce - Fresh groceries in 10 minutes.
Thank you for supporting sustainable farming!
========================================
`;
  res.send(invoiceStr);
});

// ----------------------------------------------------
// PRODUCT REORDERING UTILITY
// ----------------------------------------------------

app.post('/api/orders/:id/reorder', authenticate, (req: Request, res: Response) => {
  const order = dbService.getOrders().find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Original order not found.' });

  // Verify availability on catalog
  const catalog = dbService.getProducts();
  const reorderCartItems = [];

  for (const item of order.items) {
    const freshProd = catalog.find(p => p.id === item.productId);
    if (freshProd && freshProd.stock > 0) {
      reorderCartItems.push({
        productId: freshProd.id,
        quantity: Math.min(item.quantity, freshProd.stock),
        productName: freshProd.name,
        image: freshProd.image,
        price: freshProd.price * (1 - freshProd.discount/100),
        unit: freshProd.unit
      });
    }
  }

  if (reorderCartItems.length === 0) {
    return res.status(400).json({ error: 'All items from this order are currently out of stock.' });
  }

  res.json({
    success: true,
    addedToCart: reorderCartItems,
    message: `${reorderCartItems.length} items added back to shopping cart.`
  });
});

// ----------------------------------------------------
// ADMIN DASHBOARD & CONTROLS APIS (Protected)
// ----------------------------------------------------

app.get('/api/admin/analytics', requireAdmin, (req: Request, res: Response) => {
  const orders = dbService.getOrders();
  const products = dbService.getProducts();
  const users = dbService.getUsers();

  // Computations
  const totalCompletedOrders = orders.filter(o => o.status === 'Delivered');
  const revenue = orders
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  const pendingDeliveries = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
  const lowStockProducts = products.filter(p => p.stock < 10).map(p => ({ id: p.id, name: p.name, stock: p.stock }));

  // Aggregate product sales counts
  const productSalesMap: Record<string, { name: string, quantity: number, revenue: number }> = {};
  orders.filter(o => o.status !== 'Cancelled').forEach(o => {
    o.items.forEach(it => {
      if (!productSalesMap[it.productId]) {
        productSalesMap[it.productId] = { name: it.productName, quantity: 0, revenue: 0 };
      }
      productSalesMap[it.productId].quantity += it.quantity;
      productSalesMap[it.productId].revenue += it.price * it.quantity;
    });
  });

  const topSellers = Object.values(productSalesMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  // Time-series mock data for charts
  const salesHistory = [
    { label: 'May 18', total: Math.round(revenue * 0.1) },
    { label: 'May 19', total: Math.round(revenue * 0.15) },
    { label: 'May 20', total: Math.round(revenue * 0.12) },
    { label: 'May 21', total: Math.round(revenue * 0.22) },
    { label: 'May 22', total: Math.round(revenue * 0.18) },
    { label: 'May 23', total: Math.round(revenue * 0.25) }
  ];

  res.json({
    revenue,
    ordersCount: orders.length,
    pendingDeliveries,
    lowStockAlerts: lowStockProducts.length,
    lowStockProducts,
    topSellers,
    salesHistory
  });
});

// Users admin controls
app.get('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
  res.json(dbService.getUsers());
});

app.post('/api/admin/users/:id/toggle-ban', requireAdmin, (req: Request, res: Response) => {
  const outcome = dbService.toggleUserBan(req.params.id);
  if (!outcome) return res.status(404).json({ error: 'User not found.' });
  res.json({ success: true, user: outcome });
});

// Products CRUD Controls
app.post('/api/admin/products', requireAdmin, (req: Request, res: Response) => {
  const { name, description, price, discount, stock, image, categoryId, brand, unit } = req.body;
  if (!name || !price || !categoryId || !unit) {
    return res.status(400).json({ error: 'Missing mandatory fields.' });
  }

  const newProd: Product = {
    id: 'prod-' + Math.random().toString(36).substring(2, 9),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    description: description || 'No description provided.',
    price: parseFloat(price),
    discount: parseFloat(discount || 0),
    stock: parseInt(stock || 0),
    image: image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600',
    categoryId,
    brand: brand || 'Namma',
    unit,
    rating: 5.0,
    ratingCount: 0
  };

  dbService.addProduct(newProd);
  res.json({ success: true, product: newProd });
});

app.put('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const updated = dbService.updateProduct(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Product not found.' });
  res.json({ success: true, product: updated });
});

app.delete('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const success = dbService.deleteProduct(req.params.id);
  if (!success) return res.status(404).json({ error: 'Product not found.' });
  res.json({ success: true });
});

// Categories CRUD Controls
app.post('/api/admin/categories', requireAdmin, (req: Request, res: Response) => {
  const { name, icon, banner, parentId } = req.body;
  if (!name || !icon) return res.status(400).json({ error: 'Name and Icon identifier required.' });

  const newCat: Category = {
    id: 'cat-' + Math.random().toString(36).substring(2, 9),
    name,
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    icon,
    banner,
    parentId
  };

  dbService.addCategory(newCat);
  res.json({ success: true, category: newCat });
});

app.put('/api/admin/categories/:id', requireAdmin, (req: Request, res: Response) => {
  const updated = dbService.updateCategory(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Category not found.' });
  res.json({ success: true, category: updated });
});

app.delete('/api/admin/categories/:id', requireAdmin, (req: Request, res: Response) => {
  dbService.deleteCategory(req.params.id);
  res.json({ success: true });
});

// Admin coupon management
app.get('/api/admin/coupons', requireAdmin, (req: Request, res: Response) => {
  res.json(dbService.getCoupons());
});

app.post('/api/admin/coupons', requireAdmin, (req: Request, res: Response) => {
  const { code, type, value, expiryDate, usageLimit } = req.body;
  if (!code || !type || !value || !expiryDate) {
    return res.status(400).json({ error: 'Missing coupon descriptor details.' });
  }

  const cp: Coupon = {
    id: 'cp-' + Math.random().toString(36).substring(2, 9),
    code: code.toUpperCase().trim(),
    type,
    value: parseFloat(value),
    expiryDate,
    active: true,
    usageLimit: parseInt(usageLimit || 100),
    usageCount: 0
  };

  dbService.addCoupon(cp);
  res.json({ success: true, coupon: cp });
});

app.put('/api/admin/coupons/:id', requireAdmin, (req: Request, res: Response) => {
  const updated = dbService.updateCoupon(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Coupon not found.' });
  res.json({ success: true, coupon: updated });
});

app.delete('/api/admin/coupons/:id', requireAdmin, (req: Request, res: Response) => {
  dbService.deleteCoupon(req.params.id);
  res.json({ success: true });
});

// Admin Banner slider management
app.get('/api/admin/banners', requireAdmin, (req: Request, res: Response) => {
  res.json(dbService.getBanners());
});

app.post('/api/admin/banners', requireAdmin, (req: Request, res: Response) => {
  const {
    image,
    title,
    subtitle,
    offerText,
    discount,
    link,
    sponsorName,
    badge,
    ctaLabel,
    secondaryCtaLabel,
    campaignType,
    priority,
    startDate,
    endDate,
    targetCategoryId,
    active
  } = req.body;
  if (!image || !title) return res.status(400).json({ error: 'Banners must contain an image slider link.' });

  const banner: DashboardBanner = {
    id: 'banner-' + Math.random().toString(36).substring(2, 9),
    image,
    title,
    subtitle,
    offerText,
    discount: Number.isFinite(Number(discount)) && Number(discount) > 0 ? Number(discount) : undefined,
    link,
    sponsorName,
    badge,
    ctaLabel,
    secondaryCtaLabel,
    campaignType,
    priority: Number(priority) || 99,
    startDate,
    endDate,
    targetCategoryId,
    active: active !== false
  };

  dbService.addBanner(banner);
  res.json({ success: true, banner });
});

app.put('/api/admin/banners/:id', requireAdmin, (req: Request, res: Response) => {
  const updates = {
    ...req.body,
    ...(req.body.discount !== undefined ? { discount: Number(req.body.discount) || undefined } : {})
  };
  const updated = dbService.updateBanner(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Banner not found.' });
  res.json({ success: true, banner: updated });
});

app.delete('/api/admin/banners/:id', requireAdmin, (req: Request, res: Response) => {
  dbService.deleteBanner(req.params.id);
  res.json({ success: true });
});

// Admin update live dispatcher timelines
app.put('/api/admin/orders/:id/status', requireAdmin, (req: Request, res: Response) => {
  const { status, description } = req.body;
  if (!status) return res.status(400).json({ error: 'Status string has not been passed.' });

  const updatedOrder = dbService.updateOrderStatus(req.params.id, status, description);
  if (!updatedOrder) return res.status(404).json({ error: 'Order not found in state tracker.' });

  // Simulate real-time push notification alert logs
  console.log(`[SIMULATED DISPATCHER TIMELINE NOTIFICATION] For Order: ${updatedOrder.id} -> Status changed to: ${status}`);

  res.json({ success: true, order: updatedOrder });
});


// ----------------------------------------------------
// SMART AI COOKING & GROCERY CHATBOT (Server Gemini)
// ----------------------------------------------------

app.post('/api/gemini/assist', async (req: Request, res: Response) => {
  try {
    const { message, previousChat = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'User statement cannot be empty.' });

    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY' || key.trim() === '') {
      return res.status(200).json({
        reply: `Hello! I am your **Nammashop AI Smart Cooking & Grocery Assistant**. 

I am running in offline demonstration fallback mode. Here is a list of recipes you can cook with our fresh groceries:
1. **Creamy Tomato Pasta**: Needs Organic Cherry Tomatoes, Full Cream Milk, Salted Butter.
2. **Fresh Summer Mango Shake**: Needs Alphonso Mangoes, Full Cream Milk, Sugar.

*To unlock real-time Gemini AI recipes and active ingredient cart loading, please configure your actual \`GEMINI_API_KEY\` in Settings > Secrets.*`,
        suggestedProductIds: ['prod-mango', 'prod-tomato', 'prod-milk', 'prod-butter']
      });
    }

    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const catalog = dbService.getProducts();
    const productSpecs = catalog.map(p => `- ${p.name} (ID: ${p.id}, Unit: ${p.unit}, Price: £${p.price}, Category: ${p.categoryId}, Stock: ${p.stock})`).join('\n');

    const systemPrompt = `You are the brilliant "Nammashop AI Smart Cooking & Grocery Companion" for Nammashop.
You help customers seamlessly purchase products, acting like a real shopping assistant. 

Core Capabilities:
1. Understand natural language grocery queries. Handle typos and spelling mistakes gracefully.
2. Suggest products based on customer preferences, budget, dietary requirements, seasonal items, and conversational context.
3. Suggest recipes based on available ingredients and generate shopping lists.
4. Recommend alternatives if requested products are out of stock.
5. Create combo offers and bundle deals.
6. Suggest healthy options and compare products.
7. Recommend best-selling and complementary products.

Here is our live grocery catalog currently in stock:
${productSpecs}

RULES FOR YOUR OUTPUT:
1. Answer in beautiful, clear, highly encouraging Markdown format.
2. When mentioning a specific product from our catalog, ALWAYS inline its PRODUCT ID using the exact tag format: "[PRODUCT:id]". The frontend will automatically render a rich interactive product card with "Add to Cart" and "Buy Now" buttons in the chat! For example: "I recommend our fresh [PRODUCT:prod-tomato] and [PRODUCT:prod-milk] for your dish!"
3. If recommending alternatives or combos, explain why and inline the relevant [PRODUCT:id] tags.
4. To fulfill shopping lists or recipes, list the steps and inline the [PRODUCT:id] tags.
5. At the VERY end of your response, write a single JSON line specifying ALL mentioned product IDs from our catalog so that the client UI can automatically highlight them. Format must be exact: [MATCHED_PRODUCTS: ["prod-mango", "prod-tomato", ...]]
6. Keep your response concise, elegant and visually pleasing. Max 350 words.`;

    const chatHistoryPayload = previousChat.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    // Generate output with gemini-2.5-flash
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        ...chatHistoryPayload,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7
      }
    });

    const replyText = response.text || "I was unable to formulate a recipe suggestion. Please try again.";

    // Parse product IDs out of matched tag
    const matchRegex = /\[MATCHED_PRODUCTS:\s*(\[[^\]]*\])\]/;
    const regexMatch = replyText.match(matchRegex);
    let ids: string[] = [];
    if (regexMatch && regexMatch[1]) {
      try {
        ids = JSON.parse(regexMatch[1]);
      } catch (e) {
        console.warn('Failed parsing output IDs from AI response');
      }
    }

    // Clean match lines from text to keep client rendering neat
    const cleanedText = replyText.replace(matchRegex, '').trim();

    res.json({
      reply: cleanedText,
      suggestedProductIds: ids
    });

  } catch (error: any) {
    console.error('Gemini API Assist error:', error);
    res.status(500).json({ error: 'AI processing failed. Please check back later.' });
  }
});


// ----------------------------------------------------
// ROUTING MIDDLEWARE FOR ASSET SERVING & VITE
// ----------------------------------------------------

let serverConfigured = false;

export async function configureServer() {
  if (serverConfigured) return app;
  serverConfigured = true;

  if (process.env.NODE_ENV !== 'production') {
    // Development Mode: Host Vite Dev Middleware on current Express app port 3000
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Serve Compiled SPA in dist/ static folder
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

async function startServer() {
  await configureServer();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`========================================`);
    console.log(`  NAMMASHOP PLATFORM SECURE SERVER ONLINE`);
    console.log(`  Local Ingress Gateway Mode: Port 3000`);
    console.log(`  Production Ready Container Port active.`);
    console.log(`========================================`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
