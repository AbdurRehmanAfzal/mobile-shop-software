// API Service
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const fetchAPI = async (endpoint, options = {}) => {
  const { method = 'GET', body = null, headers = {} } = options;
  const defaultHeaders = { 'Content-Type': 'application/json', ...headers };

  try {
    const response = await fetch(API_BASE_URL + endpoint, {
      method,
      headers: defaultHeaders,
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'HTTP Error');
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Brands API
export const brandsAPI = {
  getAll: () => fetchAPI('/api/brands/'),
  getById: (id) => fetchAPI('/api/brands/' + id),
  create: (brand) => fetchAPI('/api/brands/', { method: 'POST', body: brand }),
  update: (id, brand) => fetchAPI('/api/brands/' + id, { method: 'PUT', body: brand }),
};

// Models API
export const modelsAPI = {
  getAll: () => fetchAPI('/api/brands/models'),
  getById: (id) => fetchAPI('/api/brands/models/' + id),
  getByBrand: (brandId) => fetchAPI('/api/brands/' + brandId + '/models'),
  create: (model) => fetchAPI('/api/brands/models', { method: 'POST', body: model }),
  update: (id, model) => fetchAPI('/api/brands/models/' + id, { method: 'PUT', body: model }),
};

// Parties API
export const partiesAPI = {
  getAll: (type, isActive = true) => {
    let endpoint = '/api/parties/';
    if (type) endpoint += '?party_type=' + type + '&is_active=' + isActive;
    return fetchAPI(endpoint);
  },
  getCustomers: () => fetchAPI('/api/parties/customers'),
  getSuppliers: () => fetchAPI('/api/parties/suppliers'),
  getById: (id) => fetchAPI('/api/parties/' + id),
  searchByPhone: (phone) => fetchAPI('/api/parties/search/phone/' + phone),
  create: (party) => fetchAPI('/api/parties/', { method: 'POST', body: party }),
  update: (id, party) => fetchAPI('/api/parties/' + id, { method: 'PUT', body: party }),
  deactivate: (id) => fetchAPI('/api/parties/' + id + '/deactivate', { method: 'PATCH' }),
  getBalance: (id) => fetchAPI('/api/parties/' + id + '/balance'),
};

// Mobile API
export const mobileAPI = {
  add: (mobile) => fetchAPI('/api/inventory/mobiles', { method: 'POST', body: mobile }),
  getAll: (status, condition) => {
    let endpoint = '/api/inventory/mobiles';
    const parts = [];
    if (status) parts.push('status=' + status);
    if (condition) parts.push('condition=' + condition);
    if (parts.length) endpoint += '?' + parts.join('&');
    return fetchAPI(endpoint);
  },
  getById: (id) => fetchAPI('/api/inventory/mobiles/' + id),
  searchByIMEI: (imei) => fetchAPI('/api/inventory/mobiles/search/imei/' + imei),
  update: (id, mobile) => fetchAPI('/api/inventory/mobiles/' + id, { method: 'PUT', body: mobile }),
};

// Accessories API
export const accessoriesAPI = {
  add: (accessory) => fetchAPI('/api/inventory/accessories', { method: 'POST', body: accessory }),
  getAll: (status, type) => {
    let endpoint = '/api/inventory/accessories';
    const parts = [];
    if (status) parts.push('status=' + status);
    if (type) parts.push('accessory_type=' + type);
    if (parts.length) endpoint += '?' + parts.join('&');
    return fetchAPI(endpoint);
  },
  getById: (id) => fetchAPI('/api/inventory/accessories/' + id),
  getByMobile: (mobileId) => fetchAPI('/api/inventory/accessories/mobile/' + mobileId),
  update: (id, accessory) => fetchAPI('/api/inventory/accessories/' + id, { method: 'PUT', body: accessory }),
};

// Inventory Stats API
export const inventoryStatsAPI = {
  getSummary: () => fetchAPI('/api/inventory/stats/summary'),
  getPendingAccessories: () => fetchAPI('/api/inventory/stats/pending-accessories'),
  getLowStock: (minCount = 5) => fetchAPI('/api/inventory/stats/low-stock?min_count=' + minCount),
};

// Transactions API
export const transactionsAPI = {
  create: (transaction) => fetchAPI('/api/transactions/', { method: 'POST', body: transaction }),
  getAll: (partyId, type, startDate, endDate) => {
    let endpoint = '/api/transactions/';
    const parts = [];
    if (partyId) parts.push('party_id=' + partyId);
    if (type) parts.push('transaction_type=' + type);
    if (startDate) parts.push('start_date=' + startDate);
    if (endDate) parts.push('end_date=' + endDate);
    if (parts.length) endpoint += '?' + parts.join('&');
    return fetchAPI(endpoint);
  },
  getById: (id) => fetchAPI('/api/transactions/' + id),
  getByParty: (partyId) => fetchAPI('/api/transactions/party/' + partyId),
  getMobileHistory: (mobileId) => fetchAPI('/api/transactions/mobile/' + mobileId + '/history'),
  searchMobile: (query) => fetchAPI('/api/transactions/mobile/search/' + query),
  getCustomerMobiles: (customerId) => fetchAPI('/api/transactions/mobile/by-customer/' + customerId),
  quickSale: (customerId, mobileId, price, amountPaid, paymentMethod, transactionDate, notes) =>
    fetchAPI('/api/transactions/quick-sale', {
      method: 'POST',
      body: {
        customer_id: customerId,
        mobile_id: mobileId,
        price,
        amount_paid: amountPaid,
        payment_method: paymentMethod,
        transaction_date: transactionDate,
        notes
      },
    }),
  quickTradeIn: (supplierId, brandId, modelId, imei1, imei2, imei3, condition, patchDetails, ptaStatus, cnicNumber, cnicPhotoUrl, photos, purchasePrice, paymentMethod, amountPaid, transactionDate, notes) =>
    fetchAPI('/api/transactions/quick-trade-in', {
      method: 'POST',
      body: {
        supplier_id: supplierId,
        brand_id: brandId,
        model_id: modelId,
        imei1,
        imei2,
        imei3,
        condition,
        patch_details: patchDetails,
        pta_status: ptaStatus,
        cnic_number: cnicNumber,
        cnic_photo_url: cnicPhotoUrl,
        photos,
        purchase_price: purchasePrice,
        payment_method: paymentMethod,
        amount_paid: amountPaid,
        transaction_date: transactionDate,
        notes
      },
    }),
  quickPaymentIn: (customerId, amount, transactionDate, notes) =>
    fetchAPI('/api/transactions/quick-payment-in', {
      method: 'POST',
      body: { customer_id: customerId, amount, transaction_date: transactionDate, notes },
    }),
  quickPaymentOut: (supplierId, amount, transactionDate, notes) =>
    fetchAPI('/api/transactions/quick-payment-out', {
      method: 'POST',
      body: { supplier_id: supplierId, amount, transaction_date: transactionDate, notes },
    }),
  getDailyStats: (targetDate) => fetchAPI('/api/transactions/stats/daily?target_date=' + targetDate),
};

// Storage & Color API
export const storageAPI = {
  getAll: () => fetchAPI('/api/mobile/storages'),
  create: (name, nameUrdu) => fetchAPI('/api/mobile/storages?name=' + name + (nameUrdu ? '&name_urdu=' + nameUrdu : ''), { method: 'POST' }),
};

export const colorAPI = {
  getAll: () => fetchAPI('/api/mobile/colors'),
  create: (name, nameUrdu, hexCode) => {
    let params = 'name=' + name;
    if (nameUrdu) params += '&name_urdu=' + nameUrdu;
    if (hexCode) params += '&hex_code=' + hexCode;
    return fetchAPI('/api/mobile/colors?' + params, { method: 'POST' });
  },
};

// Supplies API (Vendor/Supplier Purchases)
export const suppliesAPI = {
  getAll: () => fetchAPI('/api/supplies/'),
  getByVendor: (vendorId) => fetchAPI('/api/supplies/vendor/' + vendorId),
  getById: (supplyId) => fetchAPI('/api/supplies/' + supplyId),
  getOutstandingSummary: () => fetchAPI('/api/supplies/outstanding/summary'),
  recordPayment: (supplyId, paymentData) =>
    fetchAPI('/api/supplies/' + supplyId + '/payment', { method: 'POST', body: paymentData }),
  getRecent: (limit = 10) => fetchAPI('/api/supplies/recent/purchases?limit=' + limit),
};

// Health API
export const healthAPI = {
  check: () => fetchAPI('/health'),
  status: () => fetchAPI('/'),
};

export default { brandsAPI, modelsAPI, partiesAPI, mobileAPI, accessoriesAPI, storageAPI, colorAPI, inventoryStatsAPI, transactionsAPI, suppliesAPI, healthAPI };
