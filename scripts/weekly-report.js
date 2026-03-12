import fetch from 'node-fetch';

// ── CONFIG ────────────────────────────────────────────────────────────────
const FIREBASE_URL  = process.env.FIREBASE_URL;   // URL de votre base Firebase
const SERVICE_ID    = process.env.EMAILJS_SERVICE_ID;
const TEMPLATE_ID   = process.env.EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY    = process.env.EMAILJS_PUBLIC_KEY;
const PRIVATE_KEY   = process.env.EMAILJS_PRIVATE_KEY;
const TO_EMAIL      = process.env.TO_EMAIL;

// ── UTILITAIRES ───────────────────────────────────────────────────────────
const fmt = n => Number(n).toLocaleString('fr-FR');

function getWeekRange() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) - 7); // lundi dernier
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function formatDate(d) {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── LECTURE FIREBASE ──────────────────────────────────────────────────────
async function fetchFirebase(path) {
  const res = await fetch(`${FIREBASE_URL}/${path}.json`);
  if (!res.ok) throw new Error(`Firebase error: ${res.status}`);
  return res.json();
}

// ── GÉNÉRATION DU RAPPORT ─────────────────────────────────────────────────
async function generateReport() {
  console.log('📖 Lecture des données Firebase...');
  
  const [winesData, salesData] = await Promise.all([
    fetchFirebase('wines'),
    fetchFirebase('sales')
  ]);

  const wines = winesData ? Object.values(winesData) : [];
  const allSales = salesData ? Object.values(salesData) : [];

  const { monday, sunday } = getWeekRange();
  console.log(`📅 Période : ${formatDate(monday)} → ${formatDate(sunday)}`);

  // Ventes de la semaine écoulée
  const weeklySales = allSales.filter(s => {
    const d = new Date(s.date);
    return d >= monday && d <= sunday;
  });

  // KPIs ventes
  const bottlesSold = weeklySales.reduce((a, s) => a + s.qty, 0);
  const revenue     = weeklySales.reduce((a, s) => a + s.qty * s.price, 0);
  const avgPrice    = bottlesSold > 0 ? revenue / bottlesSold : 0;

  // Top vins
  const cnt = {};
  weeklySales.forEach(s => { cnt[s.wineId] = (cnt[s.wineId] || 0) + s.qty; });
  const tops = Object.entries(cnt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, qty], i) => {
      const wine = wines.find(w => w.id === id);
      const name = wine ? wine.nom + (wine.millesime ? ' ' + wine.millesime : '') : 'Vin supprimé';
      return `${i + 1}. ${name} — ${qty} bouteille${qty > 1 ? 's' : ''}`;
    });

  const topWinesText = tops.length > 0
    ? tops.join('<br>')
    : 'Aucune vente cette semaine';

  // Stock
  const totalStock = wines.reduce((a, w) => a + (Number(w.stock) || 0), 0);
  const stockValue = wines.reduce((a, w) => a + (Number(w.prix) || 0) * (Number(w.stock) || 0), 0);

  // Stocks bas
  const lowStockWines = wines
    .filter(w => (Number(w.stock) || 0) <= 3)
    .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));

  const lowStockText = lowStockWines.length > 0
    ? lowStockWines.map(w =>
        `• ${w.nom}${w.millesime ? ' ' + w.millesime : ''} — <strong style="color:#d4788a">${w.stock} bouteille${w.stock !== 1 ? 's' : ''}</strong>${w.stock == 0 ? ' ❌ ÉPUISÉ' : ' ⚠️'}`
      ).join('<br>')
    : '✅ Tous les stocks sont suffisants';

  const weekLabel = `${formatDate(monday)} → ${formatDate(sunday)}`;

  return {
    week: weekLabel,
    bottles_sold: bottlesSold.toString(),
    revenue: fmt(Math.round(revenue)),
    avg_price: bottlesSold > 0 ? fmt(Math.round(avgPrice)) : '—',
    top_wines: topWinesText,
    total_stock: totalStock.toString(),
    stock_value: fmt(Math.round(stockValue)),
    low_stock: lowStockText,
  };
}

// ── ENVOI EMAIL ───────────────────────────────────────────────────────────
async function sendEmail(params) {
  console.log('📧 Envoi de l\'email...');

  const body = {
    service_id:  SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id:     PUBLIC_KEY,
    accessToken: PRIVATE_KEY,
    template_params: {
      ...params,
      to_email: TO_EMAIL,
    }
  };

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    console.log('✅ Email envoyé avec succès !');
  } else {
    const text = await res.text();
    throw new Error(`EmailJS error ${res.status}: ${text}`);
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    const params = await generateReport();
    console.log('📊 Rapport généré:', params);
    await sendEmail(params);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
})();
