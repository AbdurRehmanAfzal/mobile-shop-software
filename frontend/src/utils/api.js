import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Customer endpoints
export const customerAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/customers`, { params: { page, limit } }),
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post(`/customers`, data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  getLedger: (id) => api.get(`/customers/${id}/ledger`),
};

// Supplier endpoints
export const supplierAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/suppliers`, { params: { page, limit } }),
  getById: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post(`/suppliers`, data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  getLedger: (id) => api.get(`/suppliers/${id}/ledger`),
};

// Mobile Inventory endpoints
export const inventoryAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/inventory`, { params: { page, limit } }),
  getById: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post(`/inventory`, data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  getByCondition: (condition) => api.get(`/inventory/condition/${condition}`),
};

// Mobile Brand endpoints
export const brandAPI = {
  getAll: () => api.get(`/brands`),
  create: (data) => api.post(`/brands`, data),
};

// Mobile Model endpoints
export const modelAPI = {
  getAll: () => api.get(`/models`),
  getByBrand: (brandId) => api.get(`/models/brand/${brandId}`),
  create: (data) => api.post(`/models`, data),
};

// Accessory endpoints
export const accessoryAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/accessories`, { params: { page, limit } }),
  getById: (id) => api.get(`/accessories/${id}`),
  create: (data) => api.post(`/accessories`, data),
  update: (id, data) => api.put(`/accessories/${id}`, data),
  delete: (id) => api.delete(`/accessories/${id}`),
};

// Sales/Purchase endpoints
export const salesAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/sales`, { params: { page, limit } }),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post(`/sales`, data),
};

// Payment endpoints
export const paymentAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/payments`, { params: { page, limit } }),
  create: (data) => api.post(`/payments`, data),
};

// Exchange endpoints
export const exchangeAPI = {
  getAll: (page = 1, limit = 10) => api.get(`/exchanges`, { params: { page, limit } }),
  getById: (id) => api.get(`/exchanges/${id}`),
  create: (data) => api.post(`/exchanges`, data),
};

// Dashboard endpoints
export const dashboardAPI = {
  getStats: () => api.get(`/dashboard/stats`),
  getRecentTransactions: () => api.get(`/dashboard/transactions`),
  getLowStockItems: () => api.get(`/dashboard/low-stock`),
};

export default api;
