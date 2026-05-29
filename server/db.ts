import fs from 'fs';
import path from 'path';
import { User, Address, Product, Category, Order, Coupon, DashboardBanner, Review } from '../src/types';
import { syncDocToFirestore, deleteDocFromFirestore, getFirebaseServerDb, setOnAuthSuccess } from './firebase-server';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');

// Memory store initialized from disk or default mockup data
interface DatabaseSchema {
  users: User[];
  categories: Category[];
  products: Product[];
  orders: Order[];
  coupons: Coupon[];
  banners: DashboardBanner[];
  reviews: Record<string, Review[]>; // productId -> reviews
  addresses: Record<string, Address[]>; // userId -> addresses
}

let db: DatabaseSchema = {
  users: [],
  categories: [],
  products: [],
  orders: [],
  coupons: [],
  banners: [],
  reviews: {},
  addresses: {}
};

// Bootstrap mock data
const defaultCategories: Category[] = [
  { id: 'cat-fruits-veg', name: 'Fruits & Vegetables', slug: 'fruits-vegetables', icon: 'Apple' },
  { id: 'cat-dairy-eggs', name: 'Dairy, Bread & Eggs', slug: 'dairy-bread-eggs', icon: 'Egg' },
  { id: 'cat-snacks-munchies', name: 'Snacks & Munchies', slug: 'snacks-munchies', icon: 'Cookie' },
  { id: 'cat-beverages', name: 'Cold Drinks & Juices', slug: 'cold-drinks-beverages', icon: 'Coffee' },
  { id: 'cat-staples', name: 'Atta, Rice & Dals', slug: 'staples-atta-dal', icon: 'Wheat' },
  { id: 'cat-meat', name: 'Meats & Seafood', slug: 'meats-seafood', icon: 'Beef' }
];

const defaultProducts: Product[] = [
  // Fruits & Vegetables
  {
    id: 'prod-mango',
    name: 'Alphonso Mangoes (Imported)',
    slug: 'alphonso-mango',
    description: 'Premium grade imported Alphonso mangoes, incredibly sweet, smooth and chemical-free fruits.',
    price: 3.99,
    discount: 15,
    stock: 25,
    image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-fruits-veg',
    brand: 'Premium Gold',
    unit: '1 Dozen',
    rating: 4.8,
    ratingCount: 142,
    isFeatured: true
  },
  {
    id: 'prod-tomato',
    name: 'Organic Cherry Tomatoes',
    slug: 'organic-cherry-tomatoes',
    description: 'Freshly harvested, vine-ripened organic cherry tomatoes. Highly juicy, perfect for fresh salads and pastas.',
    price: 0.99,
    discount: 10,
    stock: 50,
    image: 'https://images.unsplash.com/photo-1561136594-7f68413baa99?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-fruits-veg',
    brand: 'Home Farms',
    unit: '250 g',
    rating: 4.5,
    ratingCount: 88,
    isFeatured: true
  },
  {
    id: 'prod-avocado',
    name: 'Premium Hass Avocado',
    slug: 'hass-avocado',
    description: 'Imported ripe Hass Avocados. Perfect buttery texture, rich in healthy fats. Great for guacamole or breakfast toasts.',
    price: 1.80,
    discount: 0,
    stock: 12,
    image: 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-fruits-veg',
    brand: 'Global Select',
    unit: '1 Pc',
    rating: 4.7,
    ratingCount: 65
  },
  // Dairy, Bread & Eggs
  {
    id: 'prod-milk',
    name: 'Arla Organic Full Cream Milk',
    slug: 'arla-organic-milk',
    description: 'Pasteurized organic whole milk, rich and creamy, perfect for your breakfast cereals and daily teas.',
    price: 1.25,
    discount: 5,
    stock: 100,
    image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-dairy-eggs',
    brand: 'Arla',
    unit: '1 L',
    rating: 4.9,
    ratingCount: 310,
    isFeatured: true
  },
  {
    id: 'prod-butter',
    name: 'Lurpak Butter Salted',
    slug: 'lurpak-butter-salted',
    description: 'The premium Danish pasteurized salted butter. Rich, creamy, and spreadable.',
    price: 2.75,
    discount: 8,
    stock: 80,
    image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-dairy-eggs',
    brand: 'Lurpak',
    unit: '500 g',
    rating: 4.9,
    ratingCount: 520,
    isFeatured: true
  },
  {
    id: 'prod-egg',
    name: 'Farm Fresh Free Range Large Eggs (Pack of 12)',
    slug: 'free-range-eggs-12',
    description: 'Naturally sourced British free range eggs with strong shells, golden yolks and rich protein profiles.',
    price: 1.95,
    discount: 10,
    stock: 45,
    image: 'https://images.unsplash.com/photo-1516448620398-c5f44bf9f441?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-dairy-eggs',
    brand: 'British Farms',
    unit: '12 Pcs',
    rating: 4.6,
    ratingCount: 198
  },
  // Snacks & Munchies
  {
    id: 'prod-lays',
    name: 'Walkers Sensations Crisps - Sweet Chili',
    slug: 'walkers-sensations-sweet-chili',
    description: 'A touch of sweet spice. Crispy crunch made with premium hand-selected British potatoes.',
    price: 1.20,
    discount: 0,
    stock: 150,
    image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-snacks-munchies',
    brand: 'Walkers',
    unit: '150 g',
    rating: 4.4,
    ratingCount: 450,
    isFeatured: true
  },
  {
    id: 'prod-oreo',
    name: 'Oreo Double Stuf Chocolate Cookies',
    slug: 'oreo-double-stuf',
    description: 'Twist, lick and dunk with double the rich sweet vanilla cream stuffed inside rich dark cocoa crunch wafers.',
    price: 1.50,
    discount: 12,
    stock: 65,
    image: 'https://images.unsplash.com/photo-1558961313-718ef6c381f2?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-snacks-munchies',
    brand: 'Oreo',
    unit: '120 g',
    rating: 4.7,
    ratingCount: 220
  },
  // Cold Drinks & Juices
  {
    id: 'prod-coke',
    name: 'Coca-Cola Zero Sugar Premium Can',
    slug: 'cocacola-zero-can',
    description: 'Enjoy the same refreshing bubbly high-fizz taste of Coca-Cola with zero guilt, zero sugar, and zero calories.',
    price: 0.99,
    discount: 0,
    stock: 120,
    image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-beverages',
    brand: 'Coca Cola',
    unit: '330 ml',
    rating: 4.8,
    ratingCount: 340,
    isFeatured: true
  },
  {
    id: 'prod-tropicana',
    name: 'Tropicana 100% Orange Juice',
    slug: 'tropicana-orange-juice',
    description: '100% pure premium oranges squeezed without any added sugar, colors or artificial preservatives.',
    price: 2.50,
    discount: 15,
    stock: 40,
    image: 'https://images.unsplash.com/photo-1613478223719-2ab802602423?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-beverages',
    brand: 'Tropicana',
    unit: '1 L',
    rating: 4.4,
    ratingCount: 110
  },
  // Staples
  {
    id: 'prod-atta',
    name: 'Elephant Atta Medium Flour',
    slug: 'elephant-atta',
    description: 'The UK\'s favorite premium chapati flour. Rich in dietary fibers and minerals, yielding super soft, fluffy flatbreads.',
    price: 3.49,
    discount: 10,
    stock: 75,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-staples',
    brand: 'Elephant Atta',
    unit: '1.5 kg',
    rating: 4.8,
    ratingCount: 680,
    isFeatured: true
  },
  {
    id: 'prod-basmati',
    name: 'Tilda Pure Basmati Rice',
    slug: 'tilda-basmati-rice',
    description: 'Magnificent long aromatic grains that fluff up perfectly. Elegant, gluten-free, premium quality.',
    price: 4.99,
    discount: 20,
    stock: 60,
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop',
    categoryId: 'cat-staples',
    brand: 'Tilda',
    unit: '1 kg',
    rating: 4.6,
    ratingCount: 390
  }
];

const groceryCatalogSeeds: Record<string, Array<{ name: string; brand: string; unit: string; price: number; image: string }>> = {
  'cat-fruits-veg': [
    { name: 'Banana Robusta', brand: 'Namma Farms', unit: '1 kg', price: 1.29, image: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?q=80&w=600&auto=format&fit=crop' },
    { name: 'Royal Gala Apples', brand: 'Orchard Fresh', unit: '6 pcs', price: 2.99, image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?q=80&w=600&auto=format&fit=crop' },
    { name: 'English Cucumber', brand: 'Green Valley', unit: '1 pc', price: 0.79, image: 'https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?q=80&w=600&auto=format&fit=crop' },
    { name: 'Baby Spinach Leaves', brand: 'Leaf & Co', unit: '200 g', price: 1.49, image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?q=80&w=600&auto=format&fit=crop' },
    { name: 'Red Onions', brand: 'Farm Basket', unit: '1 kg', price: 1.15, image: 'https://images.unsplash.com/photo-1508747703725-719777637510?q=80&w=600&auto=format&fit=crop' },
    { name: 'Fresh Coriander', brand: 'Herb House', unit: '100 g', price: 0.69, image: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?q=80&w=600&auto=format&fit=crop' }
  ],
  'cat-dairy-eggs': [
    { name: 'Wholemeal Bread Loaf', brand: 'Bakery Lane', unit: '800 g', price: 1.55, image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600&auto=format&fit=crop' },
    { name: 'Greek Yogurt Natural', brand: 'Dairy Pure', unit: '500 g', price: 2.1, image: 'https://images.unsplash.com/photo-1571212515416-fca0fbae8f8b?q=80&w=600&auto=format&fit=crop' },
    { name: 'Cheddar Cheese Block', brand: 'County Dairy', unit: '400 g', price: 3.25, image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?q=80&w=600&auto=format&fit=crop' },
    { name: 'Unsalted Butter', brand: 'Meadow Gold', unit: '250 g', price: 2.05, image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?q=80&w=600&auto=format&fit=crop' },
    { name: 'Paneer Cubes', brand: 'Desi Dairy', unit: '250 g', price: 2.35, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?q=80&w=600&auto=format&fit=crop' }
  ],
  'cat-snacks-munchies': [
    { name: 'Salted Potato Crisps', brand: 'CrispCo', unit: '150 g', price: 1.1, image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?q=80&w=600&auto=format&fit=crop' },
    { name: 'Chocolate Digestive Biscuits', brand: 'TeaTime', unit: '300 g', price: 1.6, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?q=80&w=600&auto=format&fit=crop' },
    { name: 'Roasted Cashews', brand: 'NutriBowl', unit: '200 g', price: 3.8, image: 'https://images.unsplash.com/photo-1563412885-139e4045eb79?q=80&w=600&auto=format&fit=crop' },
    { name: 'Granola Energy Bars', brand: 'FuelBar', unit: '6 pack', price: 2.75, image: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?q=80&w=600&auto=format&fit=crop' },
    { name: 'Classic Popcorn', brand: 'Movie Night', unit: '250 g', price: 1.25, image: 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?q=80&w=600&auto=format&fit=crop' }
  ],
  'cat-beverages': [
    { name: 'Still Mineral Water', brand: 'AquaSpring', unit: '1.5 L', price: 0.75, image: 'https://images.unsplash.com/photo-1616118132534-381148898bb4?q=80&w=600&auto=format&fit=crop' },
    { name: 'Cold Brew Coffee', brand: 'Bean Street', unit: '250 ml', price: 1.95, image: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?q=80&w=600&auto=format&fit=crop' },
    { name: 'Apple Juice Pressed', brand: 'Orchard Fresh', unit: '1 L', price: 2.2, image: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?q=80&w=600&auto=format&fit=crop' },
    { name: 'Sparkling Lemonade', brand: 'FizzUp', unit: '750 ml', price: 1.45, image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?q=80&w=600&auto=format&fit=crop' },
    { name: 'Masala Chai Concentrate', brand: 'Chai House', unit: '500 ml', price: 2.65, image: 'https://images.unsplash.com/photo-1571934811356-5cc061b6821f?q=80&w=600&auto=format&fit=crop' }
  ],
  'cat-staples': [
    { name: 'Basmati Rice Premium', brand: 'Royal Grain', unit: '5 kg', price: 9.99, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=600&auto=format&fit=crop' },
    { name: 'Toor Dal', brand: 'Harvest Bowl', unit: '1 kg', price: 3.6, image: 'https://images.unsplash.com/photo-1515543904379-3d757afe72e4?q=80&w=600&auto=format&fit=crop' },
    { name: 'Sunflower Oil', brand: 'Golden Press', unit: '1 L', price: 2.85, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?q=80&w=600&auto=format&fit=crop' },
    { name: 'Brown Sugar', brand: 'SweetMill', unit: '1 kg', price: 1.95, image: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?q=80&w=600&auto=format&fit=crop' },
    { name: 'Penne Pasta', brand: 'Roma Table', unit: '500 g', price: 1.35, image: 'https://images.unsplash.com/photo-1551462147-ff29053bfc14?q=80&w=600&auto=format&fit=crop' }
  ],
  'cat-meat': [
    { name: 'Chicken Breast Fillets', brand: 'Butcher Fresh', unit: '500 g', price: 4.8, image: 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?q=80&w=600&auto=format&fit=crop' },
    { name: 'Salmon Fillets', brand: 'Ocean Catch', unit: '2 pcs', price: 6.5, image: 'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?q=80&w=600&auto=format&fit=crop' },
    { name: 'King Prawns', brand: 'Ocean Catch', unit: '300 g', price: 5.75, image: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?q=80&w=600&auto=format&fit=crop' },
    { name: 'Lamb Mince', brand: 'Butcher Fresh', unit: '500 g', price: 5.2, image: 'https://images.unsplash.com/photo-1603048297172-c92544798d5a?q=80&w=600&auto=format&fit=crop' },
    { name: 'Free Range Chicken Drumsticks', brand: 'Farm Bird', unit: '700 g', price: 3.95, image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?q=80&w=600&auto=format&fit=crop' }
  ]
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildExpandedCatalog(targetCount = 600): Product[] {
  const products = [...defaultProducts];
  const existingIds = new Set(products.map(p => p.id));
  const categoryIds = defaultCategories.map(c => c.id);
  const offerDiscountCycle = [10, 20, 30, 40, 50, 0, 15, 5, 0, 10, 20, 30, 40, 50, 0];
  let sequence = 1;

  while (products.length < targetCount) {
    for (const categoryId of categoryIds) {
      const seeds = groceryCatalogSeeds[categoryId] || groceryCatalogSeeds['cat-staples'];
      for (const seed of seeds) {
        if (products.length >= targetCount) break;
        const variant = Math.floor(sequence / seeds.length) + 1;
        const productName = `${seed.name} ${variant > 1 ? `Value ${variant}` : 'Fresh'}`;
        const id = `prod-dynamic-${slugify(categoryId)}-${sequence}`;
        if (existingIds.has(id)) {
          sequence += 1;
          continue;
        }
        products.push({
          id,
          name: productName,
          slug: slugify(productName),
          description: `${seed.brand} ${seed.name.toLowerCase()} prepared for fast grocery delivery with clear pricing, live stock, and reliable quality.`,
          price: Number((seed.price * (1 + (sequence % 9) * 0.035)).toFixed(2)),
          discount: offerDiscountCycle[sequence % offerDiscountCycle.length],
          stock: 18 + (sequence * 13) % 180,
          image: seed.image,
          categoryId,
          brand: seed.brand,
          unit: seed.unit,
          rating: Number((4.1 + (sequence % 9) * 0.1).toFixed(1)),
          ratingCount: 20 + (sequence * 17) % 980,
          isFeatured: sequence % 23 === 0
        });
        existingIds.add(id);
        sequence += 1;
      }
    }
  }

  return products;
}

function ensureOfferDiscountProducts() {
  const offerDiscounts = [10, 20, 30, 40, 50];
  const minimumPerDiscount = 12;
  let changed = false;

  for (const discount of offerDiscounts) {
    const currentCount = db.products.filter(product => product.discount === discount).length;
    if (currentCount >= minimumPerDiscount) continue;

    const needed = minimumPerDiscount - currentCount;
    const candidates = db.products
      .filter(product => product.discount === 0 || product.discount === 5 || product.discount === 15)
      .slice(0, needed);

    candidates.forEach((product) => {
      product.discount = discount;
      product.isFeatured = product.isFeatured || discount >= 40;
      changed = true;
    });
  }

  return changed;
}

function ensureExpandedCatalog() {
  if (!db.products || db.products.length < 600) {
    const byId = new Map<string, Product>();
    buildExpandedCatalog(600).forEach(product => byId.set(product.id, product));
    (db.products || []).forEach(product => byId.set(product.id, product));
    db.products = Array.from(byId.values()).slice(0, 600);
  }
}

const defaultCoupons: Coupon[] = [
  { id: 'cp-30', code: 'NAMMA30', type: 'percent', value: 30, expiryDate: '2027-12-31', active: true, usageLimit: 1000, usageCount: 0 },
  { id: 'cp-50', code: 'SUPER50', type: 'fixed', value: 2.50, expiryDate: '2027-12-31', active: true, usageLimit: 500, usageCount: 0 },
  { id: 'cp-100', code: 'FREE100', type: 'fixed', value: 5.00, expiryDate: '2027-12-31', active: true, usageLimit: 200, usageCount: 0 }
];

const defaultBanners: DashboardBanner[] = [
  {
    id: 'offer-banner-10-grocery',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop',
    title: '10% OFF on Grocery Essentials',
    subtitle: 'Pantry basics, daily vegetables, and home staples with exact 10% savings.',
    offerText: '10% OFF on Grocery Essentials',
    discount: 10,
    active: true,
    sponsorName: 'NammaShop Essentials',
    badge: '10% offer',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 1,
    targetCategoryId: 'cat-staples',
    category: 'Grocery Essentials',
    link: '/?offerDiscount=10'
  },
  {
    id: 'offer-banner-10-breakfast',
    image: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?q=80&w=1200&auto=format&fit=crop',
    title: '10% OFF Breakfast Staples',
    subtitle: 'Milk, eggs, bread, and morning-ready picks filtered by exact 10% discount.',
    offerText: '10% OFF Breakfast Staples',
    discount: 10,
    active: true,
    sponsorName: 'Morning Market',
    badge: 'Breakfast deal',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'View Offer',
    campaignType: 'offer',
    priority: 2,
    targetCategoryId: 'cat-dairy-eggs',
    category: 'Breakfast Staples',
    link: '/?offerDiscount=10'
  },
  {
    id: 'offer-banner-20-fruits',
    image: 'https://images.unsplash.com/photo-1619566636858-adf3ef4640b0?q=80&w=1200&auto=format&fit=crop',
    title: '20% OFF Fresh Fruits',
    subtitle: 'Seasonal fruit baskets and bright fresh picks with exact 20% savings.',
    offerText: '20% OFF Fresh Fruits',
    discount: 20,
    active: true,
    sponsorName: 'Namma Farms',
    badge: '20% offer',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 3,
    targetCategoryId: 'cat-fruits-veg',
    category: 'Fresh Fruits',
    link: '/?offerDiscount=20'
  },
  {
    id: 'offer-banner-20-beverages',
    image: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?q=80&w=1200&auto=format&fit=crop',
    title: '20% OFF Juices & Drinks',
    subtitle: 'Cold drinks, pressed juices, and refreshers routed to exact 20% discounts.',
    offerText: '20% OFF Juices & Drinks',
    discount: 20,
    active: true,
    sponsorName: 'Refresh Lane',
    badge: 'Cool savings',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'View Offer',
    campaignType: 'offer',
    priority: 4,
    targetCategoryId: 'cat-beverages',
    category: 'Juices & Drinks',
    link: '/?offerDiscount=20'
  },
  {
    id: 'offer-banner-30-daily',
    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=1200&auto=format&fit=crop',
    title: '30% OFF Daily Essentials',
    subtitle: 'Farm-fresh organic staples delivered in just 10 minutes!',
    offerText: '30% OFF Daily Essentials',
    discount: 30,
    active: true,
    sponsorName: 'Namma Farms',
    badge: 'Seasonal pick',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 5,
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-08-31T23:59:59.000Z',
    targetCategoryId: 'cat-fruits-veg',
    category: 'Daily Essentials',
    link: '/?offerDiscount=30'
  },
  {
    id: 'offer-banner-30-staples',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?q=80&w=1200&auto=format&fit=crop',
    title: '30% OFF Rice, Atta & Dals',
    subtitle: 'Stock up on pantry staples mapped to exact 30% offer products.',
    offerText: '30% OFF Rice, Atta & Dals',
    discount: 30,
    active: true,
    sponsorName: 'Staples Hub',
    badge: 'Bulk save',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 6,
    startDate: '2026-05-01T00:00:00.000Z',
    endDate: '2026-12-31T23:59:59.000Z',
    targetCategoryId: 'cat-staples',
    category: 'Rice, Atta & Dals',
    link: '/?offerDiscount=30'
  },
  {
    id: 'offer-banner-40-snacks',
    image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?q=80&w=1200&auto=format&fit=crop',
    title: '40% OFF Snacks',
    subtitle: 'Crisps, biscuits, nuts, and snack packs filtered by exact 40% savings.',
    offerText: '40% OFF Snacks',
    discount: 40,
    active: true,
    sponsorName: 'Snack Street',
    badge: '40% offer',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'View Offer',
    campaignType: 'offer',
    priority: 7,
    targetCategoryId: 'cat-snacks-munchies',
    category: 'Snacks',
    link: '/?offerDiscount=40'
  },
  {
    id: 'offer-banner-40-family',
    image: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?q=80&w=1200&auto=format&fit=crop',
    title: '40% OFF Family Packs',
    subtitle: 'Large packs and household picks that resolve to exact 40% discounted products.',
    offerText: '40% OFF Family Packs',
    discount: 40,
    active: true,
    sponsorName: 'Family Basket',
    badge: 'Family save',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 8,
    targetCategoryId: 'cat-staples',
    category: 'Family Packs',
    link: '/?offerDiscount=40'
  },
  {
    id: 'offer-banner-50-mega',
    image: 'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?q=80&w=1200&auto=format&fit=crop',
    title: '50% OFF Mega Deals',
    subtitle: 'The biggest live savings routed only to exact 50% discount products.',
    offerText: '50% OFF Mega Deals',
    discount: 50,
    active: true,
    sponsorName: 'Namma Mega Deals',
    badge: 'Half price',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'View Offer',
    campaignType: 'offer',
    priority: 9,
    targetCategoryId: 'cat-snacks-munchies',
    category: 'Mega Deals',
    link: '/?offerDiscount=50'
  },
  {
    id: 'offer-banner-50-weekend',
    image: 'https://images.unsplash.com/photo-1543168256-418811576931?q=80&w=1200&auto=format&fit=crop',
    title: '50% OFF Weekend Specials',
    subtitle: 'Weekend-only grocery picks that open exact 50% discounted shelves.',
    offerText: '50% OFF Weekend Specials',
    discount: 50,
    active: true,
    sponsorName: 'Weekend Market',
    badge: 'Mega weekend',
    ctaLabel: 'Shop Now',
    secondaryCtaLabel: 'Explore Collection',
    campaignType: 'offer',
    priority: 10,
    targetCategoryId: 'cat-beverages',
    category: 'Weekend Specials',
    link: '/?offerDiscount=50'
  }
];

function ensureOfferBanners() {
  const byId = new Map((db.banners || []).map(banner => [banner.id, banner]));
  let changed = false;

  for (const banner of defaultBanners) {
    const existing = byId.get(banner.id);
    if (!existing) {
      byId.set(banner.id, banner);
      changed = true;
    } else {
      const merged = { ...existing, ...banner };
      byId.set(banner.id, merged);
      changed = JSON.stringify(existing) !== JSON.stringify(merged) || changed;
    }
  }

  db.banners = Array.from(byId.values()).sort((a, b) => (a.priority || 999) - (b.priority || 999));
  return changed;
}

// Helper to save DB to disk
export function saveDb() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving Nammashop database state:', error);
  }
}

// Global server integration pipeline triggers bootstrap synchronization to Firestore
export async function bootstrapFirestore() {
  const fdb = getFirebaseServerDb();
  if (!fdb) return;

  try {
    console.log('[SERVER-FIREBASE] Beginning async cloud database synchronization alignment...');

    // 1. Sync categories
    for (const cat of db.categories) {
      await syncDocToFirestore('categories', cat.id, cat);
    }
    // 2. Sync products
    for (const prod of db.products) {
      await syncDocToFirestore('products', prod.id, prod);
    }
    // 3. Sync coupons
    for (const cp of db.coupons) {
      await syncDocToFirestore('coupons', cp.id, cp);
    }
    // 4. Sync banners
    for (const ban of db.banners) {
      await syncDocToFirestore('banners', ban.id, ban);
    }
    // 5. Sync orders
    for (const ord of db.orders) {
      await syncDocToFirestore('orders', ord.id, ord);
    }
    // 6. Sync users
    for (const u of db.users) {
      await syncDocToFirestore('users', u.id, {
        ...u,
        createdAt: new Date().toISOString()
      });
    }

    console.log('[SERVER-FIREBASE] Google Firestore alignment sync finalized successfully.');
  } catch (err) {
    console.warn('[SERVER-FIREBASE] Non-critical synchronization timeout:', err);
  }
}

// Helper to load DB from disk
export function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      db = JSON.parse(content);
      // Ensure missing tables or arrays are generated
      if (!db.users) db.users = [];
      if (!db.users.some(u => u.email === 'nammashopuk@gmail.com')) {
        db.users.push({ id: 'user-nammashopuk-admin', email: 'nammashopuk@gmail.com', name: 'Nammashop UK Admin', role: 'admin' });
      }
      if (!db.users.some(u => u.email === 'gughan4912@gmail.com')) {
        db.users.push({ id: 'user-gughan-admin', email: 'gughan4912@gmail.com', name: 'Gughan Admin', role: 'admin' });
      }
      if (!db.categories || db.categories.length === 0) db.categories = defaultCategories;
      if (!db.products || db.products.length === 0) db.products = defaultProducts;
      ensureExpandedCatalog();
      const offerProductsChanged = ensureOfferDiscountProducts();
      if (!db.orders) db.orders = [];
      if (!db.coupons || db.coupons.length === 0) db.coupons = defaultCoupons;
      if (!db.banners || db.banners.length === 0) db.banners = defaultBanners;
      const offerBannersChanged = ensureOfferBanners();
      if (!db.reviews) db.reviews = {};
      if (!db.addresses) db.addresses = {};
      if (offerProductsChanged || offerBannersChanged) saveDb();
    } else {
      // Bootstrap with initial data
      db = {
        users: [
          { id: 'user-admin', email: 'admin@nammashop.com', name: 'Nammashop Partner Admin', role: 'admin' },
          { id: 'user-nammashopuk-admin', email: 'nammashopuk@gmail.com', name: 'Nammashop UK Admin', role: 'admin' },
          { id: 'user-owner', email: 'mjjayan2007@gmail.com', name: 'Nammashop Core Owner', role: 'admin' },
          { id: 'user-gughan-admin', email: 'gughan4912@gmail.com', name: 'Gughan Admin', role: 'admin' },
          { id: 'user-customer', email: 'customer@nammashop.com', name: 'Rohan Sharma', role: 'customer', phone: '+44 7700 900077' }
        ],
        categories: defaultCategories,
        products: buildExpandedCatalog(600),
        orders: [
          {
            id: 'ORD-98231',
            userId: 'user-customer',
            userEmail: 'customer@nammashop.com',
            userName: 'Rohan Sharma',
            items: [
              { id: 'item-1', productId: 'prod-milk', productName: 'Arla Organic Full Cream Milk', productImage: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?q=80&w=600&auto=format&fit=crop', price: 1.18, quantity: 2, unit: '1 L' },
              { id: 'item-2', productId: 'prod-tomato', productName: 'Organic Cherry Tomatoes', productImage: 'https://images.unsplash.com/photo-1561136594-7f68413baa99?q=80&w=600&auto=format&fit=crop', price: 0.89, quantity: 1, unit: '250 g' }
            ],
            subtotal: 3.25,
            discount: 0,
            tax: 0.16,
            deliveryFee: 2.99,
            total: 6.40,
            status: 'Delivered',
            paymentMethod: 'COD',
            paymentStatus: 'Paid',
            address: {
              id: 'addr-1',
              label: 'Home',
              fullName: 'Rohan Sharma',
              street: 'Flat 12, Westbourne Grove',
              city: 'London',
              state: 'Greater London',
              pincode: 'W2 5RU',
              phone: '07700900077'
            },
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            timeline: [
              { status: 'Pending', time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), description: 'Order successfully locked and initiated.' },
              { status: 'Packed', time: new Date(Date.now() - 23.8 * 60 * 60 * 1000).toISOString(), description: 'Groceries safely packed in biodegradable paper bag.' },
              { status: 'Shipped', time: new Date(Date.now() - 23.5 * 60 * 60 * 1000).toISOString(), description: 'Handed over to direct-drive London dispatch driver.' },
              { status: 'Out for delivery', time: new Date(Date.now() - 23.2 * 60 * 60 * 1000).toISOString(), description: 'Rider is arriving at your gate.' },
              { status: 'Delivered', time: new Date(Date.now() - 23.0 * 60 * 60 * 1000).toISOString(), description: 'Groceries delivered safely. Thank you for shopping with Nammashop!' }
            ]
          }
        ],
        coupons: defaultCoupons,
        banners: defaultBanners,
        reviews: {
          'prod-mango': [
            { id: 'rev-1', productId: 'prod-mango', userName: 'Anjali Nair', rating: 5, comment: 'Oh my god, so perfect and sweet! Best mango seasonal harvest ever!', date: '2026-05-10T12:00:00Z' }
          ],
          'prod-milk': [
            { id: 'rev-2', productId: 'prod-milk', userName: 'Karan Mehra', rating: 5, comment: 'Fresh and perfectly cold. Thick milk.', date: '2026-05-22T08:30:00Z' }
          ]
        },
        addresses: {
          'user-customer': [
            {
              id: 'addr-1',
              label: 'Home',
              fullName: 'Rohan Sharma',
              street: 'Flat 12, Westbourne Grove',
              city: 'London',
              state: 'Greater London',
              pincode: 'W2 5RU',
              phone: '07700900077'
            }
          ]
        }
      };
      ensureExpandedCatalog();
      ensureOfferDiscountProducts();
      ensureOfferBanners();
      saveDb();
    }
  } catch (error) {
    console.error('Error loading Nammashop database state:', error);
  }
}

// Run immediately to load database state
loadDb();

// Synchronize database to Cloud Firestore once authenticated successfully
setOnAuthSuccess(() => {
  bootstrapFirestore();
});

export const dbService = {
  getUsers: () => db.users,
  getCategories: () => db.categories,
  getProducts: () => db.products,
  getOrders: () => db.orders,
  getCoupons: () => db.coupons,
  getBanners: () => db.banners,
  getReviews: (prodId: string) => db.reviews[prodId] || [],
  getAddressesByUserId: (userId: string) => db.addresses[userId] || [],

  // User Actions
  addUser: (user: User) => {
    // Check if duplicate
    if (db.users.some(u => u.email === user.email)) {
      throw new Error('User email already exists');
    }
    db.users.push(user);
    saveDb();

    // Synchronize to Firestore
    syncDocToFirestore('users', user.id, {
      ...user,
      createdAt: new Date().toISOString()
    });

    return user;
  },

  updateUser: (userId: string, updates: Partial<User>) => {
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      const nextUser = { ...db.users[userIndex], ...updates };
      if (JSON.stringify(db.users[userIndex]) === JSON.stringify(nextUser)) {
        return db.users[userIndex];
      }
      db.users[userIndex] = nextUser;
      saveDb();
      
      const updatedUser = db.users[userIndex];
      // Synchronize to Firestore
      syncDocToFirestore('users', updatedUser.id, {
        ...updatedUser,
        createdAt: new Date().toISOString()
      });

      return updatedUser;
    }
    return null;
  },

  toggleUserBan: (userId: string) => {
    const user = db.users.find(u => u.id === userId);
    if (user) {
      user.isBanned = !user.isBanned;
      saveDb();

      // Synchronize to Firestore
      syncDocToFirestore('users', user.id, {
        ...user,
        createdAt: new Date().toISOString()
      });

      return user;
    }
    return null;
  },

  // Address Actions
  addAddress: (userId: string, address: Address) => {
    if (!db.addresses[userId]) {
      db.addresses[userId] = [];
    }
    db.addresses[userId].push(address);
    saveDb();

    // Synchronize Address subcollection to Firestore /users/{userId}/addresses/{addressId}
    syncDocToFirestore(`users/${userId}/addresses`, address.id, address);

    return address;
  },

  removeAddress: (userId: string, addressId: string) => {
    if (db.addresses[userId]) {
      db.addresses[userId] = db.addresses[userId].filter(a => a.id !== addressId);
      saveDb();

      // Synchronize delete to Firestore
      deleteDocFromFirestore(`users/${userId}/addresses`, addressId);
    }
  },

  // Product Actions
  addProduct: (prod: Product) => {
    db.products.push(prod);
    saveDb();

    // Synchronize to Firestore
    syncDocToFirestore('products', prod.id, prod);

    return prod;
  },

  updateProduct: (id: string, updates: Partial<Product>) => {
    const index = db.products.findIndex(p => p.id === id);
    if (index !== -1) {
      db.products[index] = { ...db.products[index], ...updates };
      saveDb();

      // Synchronize updates to Firestore
      syncDocToFirestore('products', id, db.products[index]);

      return db.products[index];
    }
    return null;
  },

  deleteProduct: (id: string) => {
    const initialLen = db.products.length;
    db.products = db.products.filter(p => p.id !== id);
    if (db.products.length !== initialLen) {
      saveDb();

      // Synchronize deletion to Firestore
      deleteDocFromFirestore('products', id);

      return true;
    }
    return false;
  },

  updateProductStock: (id: string, quantity: number) => {
    const product = db.products.find(p => p.id === id);
    if (product) {
      product.stock = Math.max(0, quantity);
      saveDb();

      // Synchronize stock changes to Firestore
      syncDocToFirestore('products', id, product);

      return product;
    }
    return null;
  },

  // Category Actions
  addCategory: (cat: Category) => {
    db.categories.push(cat);
    saveDb();

    // Synchronize to Firestore
    syncDocToFirestore('categories', cat.id, cat);

    return cat;
  },

  updateCategory: (id: string, updates: Partial<Category>) => {
    const index = db.categories.findIndex(c => c.id === id);
    if (index !== -1) {
      db.categories[index] = { ...db.categories[index], ...updates };
      saveDb();

      // Synchronize to Firestore
      syncDocToFirestore('categories', id, db.categories[index]);

      return db.categories[index];
    }
    return null;
  },

  deleteCategory: (id: string) => {
    db.categories = db.categories.filter(c => c.id !== id);
    saveDb();

    // Synchronize to Firestore
    deleteDocFromFirestore('categories', id);
  },

  // Coupon Actions
  addCoupon: (cp: Coupon) => {
    db.coupons.push(cp);
    saveDb();

    // Sync to Firestore
    syncDocToFirestore('coupons', cp.id, cp);

    return cp;
  },

  updateCoupon: (id: string, updates: Partial<Coupon>) => {
    const index = db.coupons.findIndex(c => c.id === id);
    if (index !== -1) {
      db.coupons[index] = { ...db.coupons[index], ...updates };
      saveDb();

      // Sync to Firestore
      syncDocToFirestore('coupons', id, db.coupons[index]);

      return db.coupons[index];
    }
    return null;
  },

  deleteCoupon: (id: string) => {
    db.coupons = db.coupons.filter(c => c.id !== id);
    saveDb();

    // Sync deletion
    deleteDocFromFirestore('coupons', id);
  },

  // Banner Actions
  addBanner: (banner: DashboardBanner) => {
    db.banners.push(banner);
    saveDb();

    // Sync to Firestore
    syncDocToFirestore('banners', banner.id, banner);

    return banner;
  },

  updateBanner: (id: string, updates: Partial<DashboardBanner>) => {
    const index = db.banners.findIndex(b => b.id === id);
    if (index !== -1) {
      db.banners[index] = { ...db.banners[index], ...updates };
      saveDb();

      // Sync to Firestore
      syncDocToFirestore('banners', id, db.banners[index]);

      return db.banners[index];
    }
    return null;
  },

  deleteBanner: (id: string) => {
    db.banners = db.banners.filter(b => b.id !== id);
    saveDb();

    // Sync deletion
    deleteDocFromFirestore('banners', id);
  },

  // Order Actions & Atomic Inventory Deductions
  createOrder: (order: Order) => {
    // 1. Validate real stock quantities before decrementing
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Product ${item.productName} is currently unavailable.`);
      }
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${item.productName}. Remaining: ${product.stock}`);
      }
    }

    // 2. Perform Atomic stock deductions on both data stores
    for (const item of order.items) {
      const product = db.products.find(p => p.id === item.productId)!;
      product.stock -= item.quantity;
      syncDocToFirestore('products', product.id, product);
    }

    // 3. Mark coupon used
    if (order.couponCode) {
      const coupon = db.coupons.find(c => c.code.toUpperCase() === order.couponCode?.toUpperCase());
      if (coupon) {
        coupon.usageCount += 1;
        syncDocToFirestore('coupons', coupon.id, coupon);
      }
    }

    // 4. Save and return order
    db.orders.unshift(order);
    saveDb();

    // Synchronize Order to Firestore
    syncDocToFirestore('orders', order.id, order);

    return order;
  },

  updateOrderStatus: (orderId: string, status: Order['status'], description?: string) => {
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
      order.status = status;
      order.timeline.push({
        status,
        time: new Date().toISOString(),
        description: description || `Order updated to: ${status}`
      });
      saveDb();

      // Sync updated order structure to Firestore
      syncDocToFirestore('orders', orderId, order);

      return order;
    }
    return null;
  },

  updateOrderPaymentStatus: (orderId: string, paymentStatus: Order['paymentStatus'], status?: Order['status']) => {
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
      order.paymentStatus = paymentStatus;
      if (status) {
        order.status = status;
      }
      order.timeline.push({
        status: order.status,
        time: new Date().toISOString(),
        description: `Payment status updated to: ${paymentStatus}.`
      });
      saveDb();

      // Sync updated order structure to Firestore
      syncDocToFirestore('orders', orderId, order);

      return order;
    }
    return null;
  },

  cancelOrder: (orderId: string) => {
    const order = db.orders.find(o => o.id === orderId);
    if (order && order.status !== 'Delivered' && order.status !== 'Cancelled') {
      order.status = 'Cancelled';
      order.timeline.push({
        status: 'Cancelled',
        time: new Date().toISOString(),
        description: 'Order cancelled by customer.'
      });

      // Refund the inventory stocks back synchronously
      for (const item of order.items) {
        const product = db.products.find(p => p.id === item.productId);
        if (product) {
          product.stock += item.quantity;
          syncDocToFirestore('products', product.id, product);
        }
      }

      saveDb();

      // Sync order states
      syncDocToFirestore('orders', orderId, order);

      return order;
    }
    return null;
  },

  updateOrderInvoice: (orderId: string, invoiceUrl: string, metadata: Record<string, any> = {}) => {
    const order = db.orders.find(o => o.id === orderId);
    if (order) {
      (order as any).invoiceUrl = invoiceUrl;
      Object.assign(order as any, metadata);
      saveDb();
      syncDocToFirestore('orders', orderId, order);
      return order;
    }
    return null;
  },

  // Review System & Automatic aggregates updates
  addReview: (review: Review) => {
    if (!db.reviews[review.productId]) {
      db.reviews[review.productId] = [];
    }
    db.reviews[review.productId].unshift(review);

    // Recompute product rating
    const product = db.products.find(p => p.id === review.productId);
    if (product) {
      const revs = db.reviews[review.productId];
      const sum = revs.reduce((acc, curr) => acc + curr.rating, 0);
      product.rating = Number((sum / revs.length).toFixed(1));
      product.ratingCount = revs.length;

      // Sync rating aggregates update to Firestore
      syncDocToFirestore('products', product.id, product);
    }

    saveDb();

    // Synchronize review to subcollection in Firestore /products/{productId}/reviews/{reviewId}
    syncDocToFirestore(`products/${review.productId}/reviews`, review.id, review);

    return review;
  }
};
