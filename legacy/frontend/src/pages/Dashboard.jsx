// Dashboard Screen - Home screen with daily summary and quick actions

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import OutstandingBalanceSummary from '../components/OutstandingBalanceSummary';
import { transactionsAPI, inventoryStatsAPI, partiesAPI } from '../services/api';

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    dailyStats: null,
    inventoryStats: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [dailyRes, invRes] = await Promise.all([
        transactionsAPI.getDailyStats(today),
        inventoryStatsAPI.getSummary(),
      ]);

      setStats({
        dailyStats: dailyRes.success ? dailyRes.data : null,
        inventoryStats: invRes.success ? invRes.data : null,
        loading: false,
        error: !dailyRes.success || !invRes.success ? 'Failed to load data' : null,
      });
    } catch (error) {
      setStats((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Dashboard"
          ur="ڈیش بورڈ"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Error Alert */}
      {stats.error && (
        <BilingualAlert
          en="Error loading dashboard data"
          ur="ڈیش بورڈ ڈیٹا لوڈ کرنے میں خرابی"
          type="error"
          onClose={() => setStats((prev) => ({ ...prev, error: null }))}
        />
      )}

      {/* Loading State */}
      {stats.loading && (
        <div className="text-center py-12">
          <div className="spinner text-4xl inline-block"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      )}

      {/* Stats Cards */}
      {!stats.loading && stats.dailyStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Sales Card */}
          <StatCard
            en="Sales"
            ur="فروخت"
            value={stats.dailyStats.sales?.count || 0}
            amount={stats.dailyStats.sales?.total_amount || 0}
            color="blue"
          />

          {/* Cash In Card */}
          <StatCard
            en="Cash In"
            ur="نقد رقم آنا"
            value={`Rs. ${(stats.dailyStats.cash_in || 0).toLocaleString()}`}
            amount=""
            color="green"
          />

          {/* Inventory Card */}
          <StatCard
            en="In Stock"
            ur="اسٹاک میں"
            value={stats.inventoryStats?.total_in_stock || 0}
            amount={stats.inventoryStats?.inventory_value || 0}
            color="purple"
          />

          {/* Profit Card */}
          <StatCard
            en="Est. Profit"
            ur="متوقع منافع"
            value={`Rs. ${(stats.dailyStats.profit_estimate || 0).toLocaleString()}`}
            amount=""
            color="orange"
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <BilingualLabel
          en="Quick Actions"
          ur="تیز کارروائیاں"
          size="lg"
          bold={true}
          className="mb-4"
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <QuickActionButton en="Purchase Device" ur="ڈیوائس خریداری" icon="📱" onClick={() => navigate('/purchase-device')} />
          <QuickActionButton en="View Stock" ur="اسٹاک دیکھیں" icon="📦" onClick={() => navigate('/view-stock')} />
          <QuickActionButton en="Sale" ur="فروخت" icon="💰" onClick={() => navigate('/sale-mobile')} />
          <QuickActionButton en="Mobile History" ur="موبائل کی تاریخ" icon="📖" onClick={() => navigate('/mobile-history')} />
          <QuickActionButton en="View Customer" ur="گاہک دیکھیں" icon="👥" onClick={() => navigate('/view-customer')} />
          <QuickActionButton en="View Supplier" ur="سپلائی کار دیکھیں" icon="🏢" onClick={() => navigate('/view-supplier')} />
          <QuickActionButton en="Vendor Ledger" ur="فروخت کار بہی خاتہ" icon="📊" onClick={() => navigate('/vendor-ledger')} />
          <QuickActionButton en="Payment" ur="ادائیگی" icon="💳" onClick={() => navigate('/payment')} />
        </div>
      </div>

      {/* Outstanding Balance Summary */}
      <div className="mb-8">
        <OutstandingBalanceSummary />
      </div>

      {/* Recent Transactions */}
      <div>
        <BilingualLabel
          en="Recent Activity"
          ur="حالیہ سرگرمی"
          size="lg"
          bold={true}
          className="mb-4"
        />
        <div className="card">
          <p className="text-gray-600">No transactions today</p>
        </div>
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ en, ur, value, amount, color }) => {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
  };

  return (
    <div className={`card border-l-4 ${colors[color]}`}>
      <BilingualLabel en={en} ur={ur} size="md" className="mb-2" />
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {amount && <p className="text-sm text-gray-600 mt-1">Rs. {amount.toLocaleString()}</p>}
    </div>
  );
};

// Quick Action Button Component
const QuickActionButton = ({ en, ur, icon, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="card hover:shadow-lg transition-shadow cursor-pointer text-center p-4"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <BilingualLabel en={en} ur={ur} size="sm" bold={true} />
    </button>
  );
};

export default Dashboard;
